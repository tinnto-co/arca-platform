/**
 * Extractos bancarios: PDF → extracción (Gemini) → cuadre → revisión →
 * movimientos persistidos (TIN-1634).
 *
 * Reemplaza al scanner suelto de /scan_pdf, que mostraba y no guardaba.
 * La IA solo LEE (banco, saldos y cada movimiento); el cuadre
 * (inicial + ingresos − egresos = final) es nuestro, y nada se guarda sin
 * que una persona confirme. El PDF queda en documento/R2 como respaldo.
 */
import { randomUUID } from 'node:crypto';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { FinishReason, GoogleGenAI, type Schema } from '@google/genai';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as r2 from '@/lib/r2';
import {
  cliente,
  clienteCredencial,
  cuentaBancaria,
  documento,
  movimientoBancario,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import {
  cuadreExtracto,
  idExternoDeMovimiento,
  type MovimientoExtraido,
} from '@/lib/extracto-calc';
import {
  CATEGORIAS_MOVIMIENTO,
  clasificarMovimiento,
} from '@/lib/clasificar-movimiento';

const ai = new GoogleGenAI({
  apiKey: (process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY)!,
});

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Error de lectura con un mensaje pensado para el usuario. Se distingue por
 * clase para que el `catch` de la extracción lo deje pasar en vez de
 * reemplazarlo por el mensaje genérico.
 */
class ErrorDeLectura extends Error {
  override name = 'ErrorDeLectura';
}

/* ───────────────────────── extracción con Gemini ───────────────────────── */

interface ExtractoExtraido {
  banco: string;
  numeroCuenta: string;
  moneda: string;
  periodoDesde: string;
  periodoHasta: string;
  saldoInicial: number;
  saldoFinal: number;
  movimientos: MovimientoExtraido[];
  legible: boolean;
}

const movimientoSchema: Schema = {
  type: 'OBJECT',
  properties: {
    fecha: { type: 'STRING', description: 'YYYY-MM-DD' },
    descripcion: {
      type: 'STRING',
      description: 'Concepto tal como figura, en una línea.',
    },
    importe: { type: 'NUMBER', description: 'Siempre positivo.' },
    direccion: {
      type: 'STRING',
      enum: ['ingreso', 'egreso'],
      description:
        'Visto desde el titular: ingreso = entró plata, egreso = salió.',
    },
    saldoPosterior: {
      type: 'NUMBER',
      description:
        'Saldo después del movimiento si la columna existe; 0 si no.',
    },
  },
  required: ['fecha', 'descripcion', 'importe', 'direccion', 'saldoPosterior'],
} as Schema;

const extractoSchema: Schema = {
  type: 'OBJECT',
  properties: {
    banco: {
      type: 'STRING',
      description:
        'Entidad emisora (BBVA, Galicia, Santander, ICBC, Macro, Coinag, Mercado Pago, etc.).',
    },
    numeroCuenta: {
      type: 'STRING',
      description: 'Número de cuenta o CBU/CVU si figura; vacío si no.',
    },
    moneda: { type: 'STRING', description: 'ARS, USD, etc.' },
    periodoDesde: { type: 'STRING', description: 'YYYY-MM-DD' },
    periodoHasta: { type: 'STRING', description: 'YYYY-MM-DD' },
    saldoInicial: { type: 'NUMBER' },
    saldoFinal: { type: 'NUMBER' },
    movimientos: { type: 'ARRAY', items: movimientoSchema },
    legible: {
      type: 'BOOLEAN',
      description: 'false si el documento no parece un extracto o es ilegible.',
    },
  },
  required: [
    'banco',
    'numeroCuenta',
    'moneda',
    'periodoDesde',
    'periodoHasta',
    'saldoInicial',
    'saldoFinal',
    'movimientos',
    'legible',
  ],
} as Schema;

const PROMPT = `Sos un extractor de EXTRACTOS BANCARIOS argentinos (bancos y billeteras: BBVA, Galicia, Santander, ICBC, Macro, Coinag, Mercado Pago, etc.).

QUÉ EXTRAER:
1. Banco/entidad, número de cuenta o CBU/CVU, moneda, período del extracto.
2. SALDO INICIAL y SALDO FINAL del período (los bancos los llaman "saldo anterior", "saldo al inicio", "saldo actual", "saldo al cierre").
3. TODOS los movimientos de la tabla, uno por uno: fecha, concepto/descripción, importe (siempre positivo) y si es ingreso o egreso PARA EL TITULAR.

CÓMO DISTINGUIR INGRESO DE EGRESO (cada banco lo marca distinto):
- Columnas separadas "Crédito"/"Débito" (o "Depósitos"/"Extracciones"): crédito = ingreso, débito = egreso.
- Una sola columna con signo: negativo o entre paréntesis = egreso.
- Mercado Pago: "Te transfirieron"/"cobraste" = ingreso; "Transferiste"/"pagaste" = egreso.

REGLAS:
- Números argentinos: punto de miles, coma decimal ("1.234,56" = 1234.56).
- NO saltees movimientos: el control de cuadre (inicial + ingresos − egresos = final) delata cualquier faltante.
- Si la tabla trae columna de saldo, completá saldoPosterior de cada fila; si no, 0.
- Descripciones multilínea: unilas en una sola línea.
- Si el documento NO es un extracto bancario o es ilegible, marcá legible=false.`;

async function extraerConGemini(
  base64Data: string,
  mimeType: string
): Promise<ExtractoExtraido> {
  const t0 = Date.now();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: extractoSchema,
      // Un extracto trimestral son cientos de movimientos, y cada uno es un
      // objeto JSON: con el techo por defecto la respuesta se corta al medio
      // y el JSON no parsea.
      maxOutputTokens: 65_536,
    },
    contents: [
      { text: PROMPT },
      { inlineData: { mimeType, data: base64Data } },
    ],
  });

  const finish = response.candidates?.[0]?.finishReason;
  const segundos = Math.round((Date.now() - t0) / 1000);
  // Solo se loguea lo anómalo: una lectura que tardó de más o que no terminó
  // sola es lo que sirve para diagnosticar después.
  if (segundos > 90 || (finish && finish !== FinishReason.STOP)) {
    console.warn('[extractos] lectura lenta o incompleta', {
      segundos,
      finishReason: finish,
      tokensSalida: response.usageMetadata?.candidatesTokenCount,
    });
  }

  const texto = response.text;
  if (!texto) throw new Error('El modelo no devolvió datos');

  // Respuesta cortada por el techo de tokens: el JSON viene incompleto, así
  // que el error tiene que decir qué hacer y no «no se pudo leer».
  if (finish === FinishReason.MAX_TOKENS) {
    throw new ErrorDeLectura(
      'El extracto es demasiado largo para leerlo de una vez. Subilo partido por mes y volvé a intentar.'
    );
  }

  try {
    return JSON.parse(texto) as ExtractoExtraido;
  } catch {
    throw new ErrorDeLectura(
      'La lectura del extracto quedó incompleta. Probá de nuevo; si vuelve a pasar, subilo partido por mes.'
    );
  }
}

/* ───────────────────────────── server fns ──────────────────────────────── */

/**
 * Lee el PDF y devuelve la extracción CON el control de cuadre, sin guardar
 * nada: la persistencia recién ocurre en confirmarExtracto.
 */
export const extraerExtracto = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      fileName: z.string().min(1),
      mimeType: z
        .string()
        .regex(
          /^(application\/pdf|image\/(png|jpe?g|webp))$/i,
          'Formato no soportado: PDF o imagen'
        ),
      base64Data: z.string().min(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const buffer = Buffer.from(ctx.data.base64Data, 'base64');
    if (buffer.length > MAX_BYTES)
      throw new Error('El archivo no puede superar los 20 MB');

    const [cli] = await db
      .select({ id: cliente.id })
      .from(cliente)
      .where(and(eq(cliente.id, ctx.data.clienteId), eq(cliente.orgId, orgId)))
      .limit(1);
    if (!cli) throw new Error('Empresa no encontrada');

    let extracto: ExtractoExtraido;
    try {
      extracto = await extraerConGemini(ctx.data.base64Data, ctx.data.mimeType);
    } catch (error) {
      console.error('[extractos] falló la extracción', { error });
      // Los mensajes que escribimos a propósito ya explican qué hacer.
      if (error instanceof ErrorDeLectura) throw error;
      throw new Error(
        'No se pudo leer el documento. Si es una foto, probá con una toma más nítida.'
      );
    }
    if (!extracto.legible || extracto.movimientos.length === 0) {
      throw new Error(
        'El documento no parece un extracto bancario legible. Si lo es y este banco no está soportado, avisá al equipo con el archivo.'
      );
    }

    const cuadre = cuadreExtracto(
      extracto.saldoInicial,
      extracto.saldoFinal,
      extracto.movimientos
    );

    // Categoría propuesta por el clasificador, para mostrar en la revisión.
    const movimientos = extracto.movimientos.map((m) => ({
      ...m,
      importe: Math.abs(m.importe),
      categoria: clasificarMovimiento(m.descripcion),
    }));

    return {
      banco: extracto.banco,
      numeroCuenta: extracto.numeroCuenta,
      moneda: extracto.moneda || 'ARS',
      periodoDesde: extracto.periodoDesde,
      periodoHasta: extracto.periodoHasta,
      saldoInicial: extracto.saldoInicial,
      saldoFinal: extracto.saldoFinal,
      movimientos,
      cuadre,
    };
  });

/**
 * Persiste el extracto revisado: PDF a R2 + movimientos deduplicados (el
 * idExterno estable hace que reimportar el mismo extracto no duplique).
 */
export const confirmarExtracto = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      cuentaBancariaId: z.string().uuid(),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      base64Data: z.string().min(1),
      movimientos: z
        .array(
          z.object({
            fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            descripcion: z.string(),
            importe: z.number().positive(),
            direccion: z.enum(['ingreso', 'egreso']),
            saldoPosterior: z.number().nullable().optional(),
            categoria: z.enum(CATEGORIAS_MOVIMIENTO),
          })
        )
        .min(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    // La cuenta tiene que ser de la org y de la misma empresa.
    const [cta] = await db
      .select({ id: cuentaBancaria.id, clienteId: cuentaBancaria.clienteId })
      .from(cuentaBancaria)
      .where(
        and(
          eq(cuentaBancaria.id, ctx.data.cuentaBancariaId),
          eq(cuentaBancaria.orgId, orgId)
        )
      )
      .limit(1);
    if (cta?.clienteId !== ctx.data.clienteId)
      throw new Error('La cuenta bancaria no corresponde a esta empresa');

    // El PDF de respaldo, como en despachos.
    const buffer = Buffer.from(ctx.data.base64Data, 'base64');
    const [rel] = await db
      .select({ credencialId: clienteCredencial.credencialId })
      .from(clienteCredencial)
      .where(eq(clienteCredencial.clienteId, ctx.data.clienteId))
      .limit(1);
    if (!rel)
      throw new Error('La empresa no tiene una credencial de ARCA asociada');

    const documentoId = randomUUID();
    const storageKey = r2.documentKey({
      orgId,
      clienteId: ctx.data.clienteId,
      documentId: documentoId,
      extension: r2.extensionFor(ctx.data.fileName, ctx.data.mimeType),
    });
    try {
      await r2.upload(storageKey, buffer, ctx.data.mimeType);
    } catch (error) {
      console.error('[extractos] falló la subida a R2', { storageKey, error });
      throw new Error(
        'No se pudo guardar el archivo. Probá de nuevo en unos minutos.'
      );
    }
    await db.insert(documento).values({
      id: documentoId,
      orgId,
      credencialId: rel.credencialId,
      clienteId: ctx.data.clienteId,
      nombre: ctx.data.fileName,
      storageKey,
      mimeType: ctx.data.mimeType,
      tamanoBytes: buffer.length,
      checksum: r2.checksum(buffer),
      fuente: 'manual',
    });

    // idExterno estable por movimiento (ocurrencia distingue repetidos).
    const vistos = new Map<string, number>();
    const filas = ctx.data.movimientos.map((m) => {
      const base = idExternoDeMovimiento(m, 0).slice(0, -2);
      const n = vistos.get(base) ?? 0;
      vistos.set(base, n + 1);
      return { ...m, idExterno: idExternoDeMovimiento(m, n) };
    });

    // Dedup contra lo ya importado en esa cuenta.
    const existentes = await db
      .select({ idExterno: movimientoBancario.idExterno })
      .from(movimientoBancario)
      .where(
        and(
          eq(movimientoBancario.cuentaBancariaId, ctx.data.cuentaBancariaId),
          inArray(
            movimientoBancario.idExterno,
            filas.map((f) => f.idExterno)
          )
        )
      );
    const ya = new Set(existentes.map((e) => e.idExterno));
    const nuevos = filas.filter((f) => !ya.has(f.idExterno));

    if (nuevos.length > 0) {
      await db.insert(movimientoBancario).values(
        nuevos.map((m) => ({
          cuentaBancariaId: ctx.data.cuentaBancariaId,
          fecha: m.fecha,
          importe: m.importe.toFixed(2),
          direccion: m.direccion,
          descripcion: m.descripcion || null,
          saldoPosterior:
            m.saldoPosterior != null && m.saldoPosterior !== 0
              ? m.saldoPosterior.toFixed(2)
              : null,
          idExterno: m.idExterno,
          categoria: m.categoria,
          categoriaFuente: 'sistema',
          fuente: 'import' as const,
          datosCrudos: { documentoId },
        }))
      );
    }

    return {
      importados: nuevos.length,
      salteados: filas.length - nuevos.length,
      documentoId,
    };
  });

/** Recategorizar a mano un movimiento (pisa al clasificador). */
export const recategorizarMovimiento = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      movimientoId: z.string().uuid(),
      categoria: z.enum(CATEGORIAS_MOVIMIENTO),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const [fila] = await db
      .update(movimientoBancario)
      .set({ categoria: ctx.data.categoria, categoriaFuente: 'manual' })
      .where(
        and(
          eq(movimientoBancario.id, ctx.data.movimientoId),
          inArray(
            movimientoBancario.cuentaBancariaId,
            db
              .select({ id: cuentaBancaria.id })
              .from(cuentaBancaria)
              .where(eq(cuentaBancaria.orgId, orgId))
          )
        )
      )
      .returning({ id: movimientoBancario.id });
    if (!fila) throw new Error('Movimiento no encontrado');
    return { ok: true };
  });

/** Excluir/incluir un movimiento de la comparación Banco vs Facturación. */
export const excluirMovimiento = createServerFn({ method: 'POST' })
  .validator(
    z.object({ movimientoId: z.string().uuid(), excluido: z.boolean() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const [fila] = await db
      .update(movimientoBancario)
      .set({ excluido: ctx.data.excluido })
      .where(
        and(
          eq(movimientoBancario.id, ctx.data.movimientoId),
          inArray(
            movimientoBancario.cuentaBancariaId,
            db
              .select({ id: cuentaBancaria.id })
              .from(cuentaBancaria)
              .where(eq(cuentaBancaria.orgId, orgId))
          )
        )
      )
      .returning({ id: movimientoBancario.id });
    if (!fila) throw new Error('Movimiento no encontrado');
    return { ok: true };
  });

/** Movimiento de ajuste manual (el saldo contable no coincide al cierre). */
export const agregarMovimientoManual = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      cuentaBancariaId: z.string().uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      descripcion: z.string().min(1),
      importe: z.number().positive(),
      direccion: z.enum(['ingreso', 'egreso']),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const [cta] = await db
      .select({ id: cuentaBancaria.id })
      .from(cuentaBancaria)
      .where(
        and(
          eq(cuentaBancaria.id, ctx.data.cuentaBancariaId),
          eq(cuentaBancaria.orgId, orgId)
        )
      )
      .limit(1);
    if (!cta) throw new Error('Cuenta no encontrada');
    await db.insert(movimientoBancario).values({
      cuentaBancariaId: ctx.data.cuentaBancariaId,
      fecha: ctx.data.fecha,
      importe: ctx.data.importe.toFixed(2),
      direccion: ctx.data.direccion,
      descripcion: ctx.data.descripcion,
      categoria: 'varios',
      categoriaFuente: 'manual',
      fuente: 'manual' as const,
    });
    return { ok: true };
  });
