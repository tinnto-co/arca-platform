/**
 * Extractos bancarios: PDF → extracción (Gemini) → cuadre → revisión →
 * movimientos persistidos (TIN-1634).
 *
 * Reemplaza al scanner suelto de /scan_pdf, que mostraba y no guardaba.
 * La IA solo LEE (banco, saldos y cada movimiento); el cuadre
 * (inicial + ingresos − egresos = final) es nuestro, y nada se guarda sin
 * que una persona confirme. El PDF queda en documento/R2 como respaldo.
 *
 * El cuadre además elige el modelo: se lee rápido y solo se relee con el
 * modelo lento cuando los saldos no cierran.
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
  monedaIso,
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

interface CuentaExtraida {
  numeroCuenta: string;
  cbu: string;
  tipo: string;
  moneda: string;
  saldoInicial: number;
  saldoFinal: number;
  movimientos: MovimientoExtraido[];
}

interface ExtractoExtraido {
  banco: string;
  periodoDesde: string;
  periodoHasta: string;
  /** Un extracto consolidado trae varias; uno común, una sola. */
  cuentas: CuentaExtraida[];
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

const cuentaSchema: Schema = {
  type: 'OBJECT',
  properties: {
    numeroCuenta: {
      type: 'STRING',
      description: 'Número de cuenta tal como figura, ej. "147-013617/6".',
    },
    cbu: {
      type: 'STRING',
      description: 'CBU o CVU sin espacios (22 dígitos); vacío si no figura.',
    },
    tipo: {
      type: 'STRING',
      enum: ['caja_ahorro', 'cuenta_corriente', 'otra'],
      description:
        '"Cta. Cte." / "Cuenta Corriente" = cuenta_corriente; "Caja de Ahorro" = caja_ahorro.',
    },
    moneda: { type: 'STRING', description: 'ARS, USD, etc.' },
    saldoInicial: {
      type: 'NUMBER',
      description: 'El "SALDO ANTERIOR" de ESTA cuenta.',
    },
    saldoFinal: {
      type: 'NUMBER',
      description: 'El "SALDO AL <fecha>" de ESTA cuenta.',
    },
    movimientos: { type: 'ARRAY', items: movimientoSchema },
  },
  required: [
    'numeroCuenta',
    'cbu',
    'tipo',
    'moneda',
    'saldoInicial',
    'saldoFinal',
    'movimientos',
  ],
} as Schema;

const extractoSchema: Schema = {
  type: 'OBJECT',
  properties: {
    banco: {
      type: 'STRING',
      description:
        'Entidad emisora (BBVA, Galicia, Santander, ICBC, Macro, Coinag, Mercado Pago, etc.).',
    },
    periodoDesde: { type: 'STRING', description: 'YYYY-MM-DD' },
    periodoHasta: { type: 'STRING', description: 'YYYY-MM-DD' },
    cuentas: { type: 'ARRAY', items: cuentaSchema },
    legible: {
      type: 'BOOLEAN',
      description: 'false si el documento no parece un extracto o es ilegible.',
    },
  },
  required: ['banco', 'periodoDesde', 'periodoHasta', 'cuentas', 'legible'],
} as Schema;

const PROMPT = `Sos un extractor de EXTRACTOS BANCARIOS argentinos (bancos y billeteras: BBVA, Galicia, Santander, ICBC, Macro, Coinag, Mercado Pago, etc.).

QUÉ EXTRAER:
1. Banco/entidad y período del extracto.
2. UNA ENTRADA POR CADA CUENTA del documento. Un extracto CONSOLIDADO trae
   varias cuentas (ej. "CC $ 147-013617/6" y "CC $ 147-013618/3"), y cada una
   tiene SU PROPIA tabla de movimientos más adelante en el PDF, con su propio
   "SALDO ANTERIOR" y su propio "SALDO AL <fecha>". Recorré el documento
   entero: las tablas de las cuentas siguientes suelen estar en las últimas
   hojas, después de la primera. Por cada cuenta: número, CBU/CVU, tipo,
   moneda, saldo inicial, saldo final y sus movimientos.
3. De cada cuenta, TODOS los movimientos de SU tabla, uno por uno: fecha,
   concepto/descripción, importe (siempre positivo) y si es ingreso o egreso
   PARA EL TITULAR. No mezcles movimientos entre cuentas: cada movimiento va
   en la cuenta cuya tabla lo contiene.

CÓMO DISTINGUIR INGRESO DE EGRESO (cada banco lo marca distinto):
- Columnas separadas "Crédito"/"Débito" (o "Depósitos"/"Extracciones"): crédito = ingreso, débito = egreso.
- Una sola columna con signo: negativo o entre paréntesis = egreso.
- Mercado Pago: "Te transfirieron"/"cobraste" = ingreso; "Transferiste"/"pagaste" = egreso.

REGLAS:
- Números argentinos: punto de miles, coma decimal ("1.234,56" = 1234.56).
- NO saltees movimientos NI CUENTAS: el control de cuadre de cada cuenta (inicial + ingresos − egresos = final) delata cualquier faltante.
- Si la tabla trae columna de saldo, completá saldoPosterior de cada fila; si no, 0.
- Descripciones multilínea: unilas en una sola línea.
- Si el documento NO es un extracto bancario o es ilegible, marcá legible=false.`;

/**
 * Una pasada de lectura. `pensar` prende el razonamiento del modelo: sin él
 * la misma tabla se lee en un sexto del tiempo (medido sobre un BBVA de un
 * mes: 31s contra 181s), y el control de cuadre nos dice si hizo falta.
 */
async function leerExtracto(
  base64Data: string,
  mimeType: string,
  modelo: string,
  pensar: boolean
): Promise<ExtractoExtraido> {
  const t0 = Date.now();
  const response = await ai.models.generateContent({
    model: modelo,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: extractoSchema,
      // Un extracto trimestral son cientos de movimientos, y cada uno es un
      // objeto JSON: con el techo por defecto la respuesta se corta al medio
      // y el JSON no parsea.
      maxOutputTokens: 65_536,
      ...(pensar ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
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
      modelo,
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

/**
 * Lee el extracto rápido y, si no cuadra, lo relee con el modelo que razona.
 *
 * El cuadre es el árbitro: cuando cierra, la lectura rápida está completa y
 * no hay nada que ganar esperando tres minutos. Cuando no cierra —o el
 * documento salió ilegible— vale la pena la segunda pasada, y si tampoco
 * cuadra se devuelve la del modelo más cuidadoso para que la persona decida
 * sobre la mejor lectura disponible.
 */
async function extraerConGemini(
  base64Data: string,
  mimeType: string
): Promise<ExtractoExtraido> {
  const rapida = await leerExtracto(
    base64Data,
    mimeType,
    'gemini-2.5-flash',
    false
  );
  // Tienen que cerrar TODAS las cuentas: si una sola no cuadra, la lectura
  // rápida se perdió algo y vale la pena releer.
  const cuadra =
    rapida.legible &&
    rapida.cuentas.length > 0 &&
    rapida.cuentas.every(
      (c) =>
        c.movimientos.length > 0 &&
        cuadreExtracto(c.saldoInicial, c.saldoFinal, c.movimientos).cuadra
    );
  if (cuadra) return rapida;

  console.warn('[extractos] la lectura rápida no cuadró, releyendo con pro');
  return await leerExtracto(base64Data, mimeType, 'gemini-2.5-pro', true);
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
    const conMovimientos = extracto.cuentas.filter(
      (c) => c.movimientos.length > 0
    );
    if (!extracto.legible || conMovimientos.length === 0) {
      throw new Error(
        'El documento no parece un extracto bancario legible. Si lo es y este banco no está soportado, avisá al equipo con el archivo.'
      );
    }

    // Las cuentas que la empresa ya tiene, para reconocer cuáles del PDF son
    // nuevas sin que la persona tenga que elegirlas a mano.
    const existentes = await db
      .select({
        id: cuentaBancaria.id,
        banco: cuentaBancaria.banco,
        numero: cuentaBancaria.numero,
        cbu: cuentaBancaria.cbu,
        alias: cuentaBancaria.alias,
      })
      .from(cuentaBancaria)
      .where(
        and(
          eq(cuentaBancaria.orgId, orgId),
          eq(cuentaBancaria.clienteId, ctx.data.clienteId),
          eq(cuentaBancaria.activa, true)
        )
      );

    const soloDigitos = (s: string) => s.replace(/\D/g, '');

    const cuentas = conMovimientos.map((c) => {
      // Se reconoce por CBU (es único) y, si no lo hay, por número: los
      // separadores varían entre el PDF y lo cargado a mano.
      const cbu = soloDigitos(c.cbu);
      const numero = soloDigitos(c.numeroCuenta);
      const match = existentes.find((e) => {
        const mismoCbu =
          cbu !== '' && e.cbu != null && soloDigitos(e.cbu) === cbu;
        const mismoNumero =
          numero !== '' && e.numero != null && soloDigitos(e.numero) === numero;
        return mismoCbu || mismoNumero;
      });

      return {
        numeroCuenta: c.numeroCuenta,
        cbu: c.cbu,
        tipo: c.tipo,
        moneda: monedaIso(c.moneda),
        saldoInicial: c.saldoInicial,
        saldoFinal: c.saldoFinal,
        cuadre: cuadreExtracto(c.saldoInicial, c.saldoFinal, c.movimientos),
        cuentaExistenteId: match?.id ?? null,
        cuentaExistenteNombre: match
          ? `${match.banco}${match.alias ? ` · ${match.alias}` : ''}`
          : null,
        // Categoría propuesta por el clasificador, para la revisión.
        movimientos: c.movimientos.map((m) => ({
          ...m,
          importe: Math.abs(m.importe),
          categoria: clasificarMovimiento(m.descripcion),
        })),
      };
    });

    return {
      banco: extracto.banco,
      periodoDesde: extracto.periodoDesde,
      periodoHasta: extracto.periodoHasta,
      cuentas,
    };
  });

/**
 * Persiste el extracto revisado: PDF a R2 + movimientos deduplicados (el
 * idExterno estable hace que reimportar el mismo extracto no duplique).
 *
 * Toma TODAS las cuentas del extracto de una vez. Las que ya existen vienen
 * con su id; las nuevas se crean acá con los datos que el PDF ya trae, así un
 * consolidado se importa completo sin cargar cuentas a mano.
 */
export const confirmarExtracto = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      base64Data: z.string().min(1),
      banco: z.string().min(1),
      cuentas: z
        .array(
          z.object({
            /** Cuenta ya existente; si es null, se crea con los datos de acá. */
            cuentaBancariaId: z.string().uuid().nullable(),
            numeroCuenta: z.string(),
            cbu: z.string(),
            tipo: z.enum(['caja_ahorro', 'cuenta_corriente', 'otra']),
            moneda: z.string(),
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
        .min(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    // Las cuentas ya existentes tienen que ser de la org y de esta empresa.
    const idsElegidos = ctx.data.cuentas
      .map((c) => c.cuentaBancariaId)
      .filter((id): id is string => id !== null);
    if (idsElegidos.length > 0) {
      const propias = await db
        .select({ id: cuentaBancaria.id })
        .from(cuentaBancaria)
        .where(
          and(
            eq(cuentaBancaria.orgId, orgId),
            eq(cuentaBancaria.clienteId, ctx.data.clienteId),
            inArray(cuentaBancaria.id, idsElegidos)
          )
        );
      if (propias.length !== new Set(idsElegidos).size)
        throw new Error('Alguna cuenta bancaria no corresponde a esta empresa');
    }

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

    let importados = 0;
    let salteados = 0;
    let cuentasCreadas = 0;

    for (const cta of ctx.data.cuentas) {
      // La cuenta que falta se crea con lo que el PDF ya dijo.
      let cuentaId = cta.cuentaBancariaId;
      if (!cuentaId) {
        const cbu = cta.cbu.replace(/\D/g, '');
        try {
          const [creada] = await db
            .insert(cuentaBancaria)
            .values({
              orgId,
              clienteId: ctx.data.clienteId,
              banco: ctx.data.banco,
              tipo: cta.tipo,
              numero: cta.numeroCuenta || null,
              cbu: cbu.length === 22 ? cbu : null,
              moneda: monedaIso(cta.moneda),
            })
            .returning({ id: cuentaBancaria.id });
          cuentaId = creada.id;
          cuentasCreadas++;
        } catch (error) {
          // El CBU es único en todo el sistema: si ya está, es de otra
          // empresa y hay que decirlo con nombre y apellido.
          console.error('[extractos] no se pudo crear la cuenta', { error });
          throw new Error(
            `No se pudo crear la cuenta ${cta.numeroCuenta || ctx.data.banco}. Puede que su CBU ya esté registrado en otra empresa.`
          );
        }
      }

      // idExterno estable por movimiento (ocurrencia distingue repetidos).
      const vistos = new Map<string, number>();
      const filas = cta.movimientos.map((m) => {
        const base = idExternoDeMovimiento(m, 0).slice(0, -2);
        const n = vistos.get(base) ?? 0;
        vistos.set(base, n + 1);
        return { ...m, idExterno: idExternoDeMovimiento(m, n) };
      });

      // Dedup contra lo ya importado en esa cuenta.
      const yaImportados = await db
        .select({ idExterno: movimientoBancario.idExterno })
        .from(movimientoBancario)
        .where(
          and(
            eq(movimientoBancario.cuentaBancariaId, cuentaId),
            inArray(
              movimientoBancario.idExterno,
              filas.map((f) => f.idExterno)
            )
          )
        );
      const ya = new Set(yaImportados.map((e) => e.idExterno));
      const nuevos = filas.filter((f) => !ya.has(f.idExterno));

      if (nuevos.length > 0) {
        await db.insert(movimientoBancario).values(
          nuevos.map((m) => ({
            cuentaBancariaId: cuentaId,
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

      importados += nuevos.length;
      salteados += filas.length - nuevos.length;
    }

    return {
      importados,
      salteados,
      cuentas: ctx.data.cuentas.length,
      cuentasCreadas,
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
