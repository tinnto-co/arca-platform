/**
 * Despachos de importación: PDF → extracción (Gemini) → revisión → compra.
 *
 * El IVA aduanero del Concepto 415 no figura en los registros estándar de
 * ARCA: llega en PDFs de despacho. Acá la IA propone (los 3 datos leídos:
 * alícuota, IVA en USD, tipo de cambio) y una persona confirma; recién ahí se
 * crea la compra como `comprobante` tipo 66 y el crédito fiscal entra solo al
 * estimado de IVA y a balances. El PDF queda en `documento`/R2 como respaldo.
 */
import { randomUUID } from 'node:crypto';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { GoogleGenAI, type Schema } from '@google/genai';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as r2 from '@/lib/r2';
import {
  cliente,
  clienteCredencial,
  comprobante,
  comprobanteAlicuota,
  contraparte,
  despachoImportacion,
  documento,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import {
  alicuotaValida,
  calcularDespacho,
  nombreCompraDespacho,
  numeroComprobanteSintetico,
} from '@/lib/despacho-calc';

// Acepta los dos nombres: CLAUDE.md documenta GEMINI_API_KEY y algún entorno
// usa el nombre largo del SDK.
const ai = new GoogleGenAI({
  apiKey: (process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY)!,
});

const MAX_BYTES = 15 * 1024 * 1024;

/* ───────────────────────── extracción con Gemini ───────────────────────── */

interface Extraccion {
  tipoDocumento: 'importacion_directa' | 'destinacion_simplificada';
  numero: string;
  fecha: string | null;
  alicuota: number;
  ivaUsd: number;
  tipoCambio: number;
  legible: boolean;
  importadorCoincide: boolean;
  importadorDelDocumento: string;
}

const extraccionSchema: Schema = {
  type: 'OBJECT',
  properties: {
    tipoDocumento: {
      type: 'STRING',
      enum: ['importacion_directa', 'destinacion_simplificada'],
      description:
        'importacion_directa: despacho oficial de ARCA/Aduana (formato SIM, encabezado de AFIP/DGA). destinacion_simplificada: documento de courier (DHL, UPS, correo, etc.), menos estandarizado.',
    },
    numero: {
      type: 'STRING',
      description:
        'Importación directa: el número de despacho completo (ej. "24 001 IC04 123456 A"). Destinación simplificada: el número de MANIFIESTO. Tal como figura, sin inventar.',
    },
    fecha: {
      type: 'STRING',
      description:
        'Fecha de oficialización del despacho en formato YYYY-MM-DD, o cadena vacía si no se lee.',
    },
    alicuota: {
      type: 'NUMBER',
      description:
        'Alícuota de IVA del Concepto 415, en porcentaje (21 o 10.5 normalmente). 0 si no se encuentra.',
    },
    ivaUsd: {
      type: 'NUMBER',
      description:
        'Importe del Concepto 415 (IVA) en DÓLARES, tal como figura en el documento. 0 si no se encuentra.',
    },
    tipoCambio: {
      type: 'NUMBER',
      description:
        'Tipo de cambio (cotización del dólar) del documento. 0 si no se encuentra.',
    },
    legible: {
      type: 'BOOLEAN',
      description:
        'false si la imagen es tan ilegible que los importes son dudosos.',
    },
    importadorCoincide: {
      type: 'BOOLEAN',
      description:
        'true si el importador/destinatario del envío del documento coincide con el importador indicado en las instrucciones (mismo CUIT o razón social equivalente).',
    },
    importadorDelDocumento: {
      type: 'STRING',
      description:
        'Razón social (y CUIT si figura) del importador/destinatario que se lee en el documento. Cadena vacía si no se lee.',
    },
  },
  required: [
    'tipoDocumento',
    'numero',
    'fecha',
    'alicuota',
    'ivaUsd',
    'tipoCambio',
    'legible',
    'importadorCoincide',
    'importadorDelDocumento',
  ],
} as Schema;

const PROMPT = `Sos un extractor de datos de DESPACHOS DE IMPORTACIÓN argentinos (Aduana/ARCA y couriers).

QUÉ BUSCAR — el CONCEPTO 415 (IVA):
Los despachos listan conceptos numerados. El concepto 415 es el IVA de la importación. De ahí salen los 3 datos que importan:
1. La ALÍCUOTA de IVA (normalmente 21% o 10,5%).
2. El importe del IVA en DÓLARES (los conceptos van en USD).
3. El TIPO DE CAMBIO del documento (la cotización usada para pesificar).

TIPOS DE DOCUMENTO:
- Importación Directa: despacho oficial (formato SIM de Aduana, membrete AFIP/DGA, número de despacho tipo "AA DDD LLNN NNNNNN L").
- Destinación Simplificada: documento de courier (DHL, UPS, correo, agentes); buscá el número de MANIFIESTO.

OJO CON LOS LEGAJOS DE COURIER (error clásico):
El PDF de un courier suele ser un LEGAJO con varios documentos pegados: la
factura comercial del proveedor, la factura de servicios del courier, la
"DESTINACIÓN SIMPLIFICADA DE IMPORTACIÓN" del envío PARTICULAR del importador
(con IDENTIFICADOR PARTICULAR, ej. "26073PART010986H"), y al final la
liquidación del MANIFIESTO COMPLETO del courier (muchos envíos de muchos
importadores: se reconoce por "Cantidad de envíos" > 1, "Total Bultos" altos,
"PERMISIONARIO", "Total de Tributos").
→ El concepto 415 que importa es el de la DESTINACIÓN PARTICULAR del
importador indicado, NUNCA el total del manifiesto. Si en la página del envío
particular el 415 figura con su alícuota y monto (en USD), ese es el dato.
→ Como control: la factura del courier suele trasladar "IVA Aduanero" en
pesos; monto_particular × tipo de cambio debería aproximarlo.
→ El tipo de cambio puede venir como lista ("T/CAMBIO: 1520/1498.5/1498.5"):
usá el que pesifica el IVA aduanero (si la factura trae el IVA aduanero en
pesos, elegí el valor de la lista que haga cerrar esa cuenta).

REGLAS:
- Números en formato argentino: punto de miles, coma decimal ("1.234,56" = 1234.56).
- NO inventes: si un dato no está, devolvé 0 (o cadena vacía para la fecha) y marcá legible=false si el documento es dudoso.
- Si hay varios conceptos, el 415 es el IVA; no lo confundas con 410 (derechos), 416/422 (IVA adicional/percepción) ni otros.
- La imagen puede ser una foto de baja calidad: esforzate igual, priorizá la fila del concepto 415.`;

async function extraerConGemini(
  base64Data: string,
  mimeType: string,
  importador: { razonSocial: string; cuit: string }
): Promise<Extraccion> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: extraccionSchema,
    },
    contents: [
      {
        text:
          PROMPT +
          `\n\nEL IMPORTADOR ESPERADO ES: ${importador.razonSocial} (CUIT ${importador.cuit}). Si el legajo tiene envíos de VARIOS sujetos, extraé el de este importador e ignorá los totales de manifiesto. Si el documento entero pertenece a OTRO importador, extraé igual sus datos y marcá importadorCoincide=false con su nombre en importadorDelDocumento — nunca devuelvas todo en 0 por esto.`,
      },
      { inlineData: { mimeType, data: base64Data } },
    ],
  });
  const texto = response.text;
  if (!texto) throw new Error('El modelo no devolvió datos');
  return JSON.parse(texto) as Extraccion;
}

/* ───────────────────────────── server fns ──────────────────────────────── */

export const subirYExtraerDespacho = createServerFn({ method: 'POST' })
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
    const { orgId, userId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const buffer = Buffer.from(ctx.data.base64Data, 'base64');
    if (buffer.length > MAX_BYTES)
      throw new Error('El archivo no puede superar los 15 MB');

    const [cli] = await db
      .select({
        id: cliente.id,
        razonSocial: cliente.razonSocial,
        cuit: cliente.cuit,
      })
      .from(cliente)
      .where(and(eq(cliente.id, ctx.data.clienteId), eq(cliente.orgId, orgId)))
      .limit(1);
    if (!cli) throw new Error('Empresa no encontrada');

    // `documento` cuelga del login de AFIP con el que se administra al cliente.
    const [rel] = await db
      .select({ credencialId: clienteCredencial.credencialId })
      .from(clienteCredencial)
      .where(eq(clienteCredencial.clienteId, ctx.data.clienteId))
      .limit(1);
    if (!rel)
      throw new Error('La empresa no tiene una credencial de ARCA asociada');

    // 1. Extraer ANTES de subir: si el modelo no puede leer nada, no queda
    //    basura en R2. La extracción cruda se guarda para auditoría.
    let extraccion: Extraccion;
    try {
      extraccion = await extraerConGemini(
        ctx.data.base64Data,
        ctx.data.mimeType,
        {
          razonSocial: cli.razonSocial,
          cuit: cli.cuit,
        }
      );
    } catch (error) {
      console.error('[despachos] falló la extracción', { error });
      throw new Error(
        'No se pudo leer el documento. Si es una foto, probá con una toma más nítida.'
      );
    }
    if (!extraccion.numero || (!extraccion.ivaUsd && !extraccion.tipoCambio)) {
      console.error('[despachos] extracción vacía', { extraccion });
      throw new Error(
        'No se encontró el Concepto 415 ni el número de despacho en el documento. Si es un despacho, avisá al equipo con el archivo.'
      );
    }

    // 2. Guardar el PDF como respaldo.
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
      console.error('[despachos] falló la subida a R2', { storageKey, error });
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

    // 3. La fila del despacho. Alícuota rara → 'revision', nunca cálculo mudo.
    const derivados = calcularDespacho(extraccion);
    const estado =
      alicuotaValida(extraccion.alicuota) &&
      extraccion.legible &&
      extraccion.importadorCoincide
        ? 'extraido'
        : 'revision';
    const aviso = !extraccion.importadorCoincide
      ? `Ojo: el documento parece ser de ${extraccion.importadorDelDocumento || 'otro importador'}, no de la empresa seleccionada.`
      : null;

    const [fila] = await db
      .insert(despachoImportacion)
      .values({
        orgId,
        clienteId: ctx.data.clienteId,
        documentoId,
        tipo: extraccion.tipoDocumento,
        numero: extraccion.numero.trim(),
        fecha: extraccion.fecha === '' ? null : extraccion.fecha,
        alicuota: extraccion.alicuota.toFixed(2),
        ivaUsd: extraccion.ivaUsd.toFixed(2),
        tipoCambio: extraccion.tipoCambio.toFixed(6),
        ivaPesos: derivados.ivaPesos.toFixed(2),
        netoGravado: derivados.netoGravado.toFixed(2),
        total: derivados.total.toFixed(2),
        estado,
        extraccion: extraccion,
        creadoPor: userId,
      })
      // Resubir un despacho NO confirmado lo reprocesa (extracción y PDF
      // nuevos): descartar + volver a intentar es el camino normal cuando la
      // primera lectura salió mal. Uno confirmado no se pisa jamás.
      .onConflictDoUpdate({
        target: [
          despachoImportacion.clienteId,
          despachoImportacion.tipo,
          despachoImportacion.numero,
        ],
        set: {
          documentoId,
          fecha: extraccion.fecha === '' ? null : extraccion.fecha,
          alicuota: extraccion.alicuota.toFixed(2),
          ivaUsd: extraccion.ivaUsd.toFixed(2),
          tipoCambio: extraccion.tipoCambio.toFixed(6),
          ivaPesos: derivados.ivaPesos.toFixed(2),
          netoGravado: derivados.netoGravado.toFixed(2),
          total: derivados.total.toFixed(2),
          estado,
          extraccion: extraccion,
        },
        setWhere: sql`despacho_importacion.estado <> 'confirmado'`,
      })
      .returning({
        id: despachoImportacion.id,
        clienteId: despachoImportacion.clienteId,
        documentoId: despachoImportacion.documentoId,
        tipo: despachoImportacion.tipo,
        numero: despachoImportacion.numero,
        fecha: despachoImportacion.fecha,
        alicuota: despachoImportacion.alicuota,
        ivaUsd: despachoImportacion.ivaUsd,
        tipoCambio: despachoImportacion.tipoCambio,
        ivaPesos: despachoImportacion.ivaPesos,
        netoGravado: despachoImportacion.netoGravado,
        total: despachoImportacion.total,
        estado: despachoImportacion.estado,
        comprobanteId: despachoImportacion.comprobanteId,
        importadorCoincide: sql<
          boolean | null
        >`(extraccion -> 'importadorCoincide')::boolean`,
        importadorDocumento: sql<
          string | null
        >`extraccion ->> 'importadorDelDocumento'`,
      });

    if (!fila) {
      // Ya estaba cargado: se devuelve el existente, marcado como duplicado.
      const [existente] = await db
        .select({
          id: despachoImportacion.id,
          clienteId: despachoImportacion.clienteId,
          documentoId: despachoImportacion.documentoId,
          tipo: despachoImportacion.tipo,
          numero: despachoImportacion.numero,
          fecha: despachoImportacion.fecha,
          alicuota: despachoImportacion.alicuota,
          ivaUsd: despachoImportacion.ivaUsd,
          tipoCambio: despachoImportacion.tipoCambio,
          ivaPesos: despachoImportacion.ivaPesos,
          netoGravado: despachoImportacion.netoGravado,
          total: despachoImportacion.total,
          estado: despachoImportacion.estado,
          comprobanteId: despachoImportacion.comprobanteId,
          importadorCoincide: sql<
            boolean | null
          >`(extraccion -> 'importadorCoincide')::boolean`,
          importadorDocumento: sql<
            string | null
          >`extraccion ->> 'importadorDelDocumento'`,
        })
        .from(despachoImportacion)
        .where(
          and(
            eq(despachoImportacion.clienteId, ctx.data.clienteId),
            eq(despachoImportacion.tipo, extraccion.tipoDocumento),
            eq(despachoImportacion.numero, extraccion.numero.trim())
          )
        )
        .limit(1);
      return { despacho: existente, duplicado: true, aviso };
    }
    return { despacho: fila, duplicado: false, aviso };
  });

/** La contraparte única de todos los despachos: la Aduana. */
async function contraparteAduana(): Promise<string> {
  const [existente] = await db
    .select({ id: contraparte.id })
    .from(contraparte)
    .where(and(eq(contraparte.docTipo, 'otro'), eq(contraparte.docNro, 'DGA')))
    .limit(1);
  if (existente) return existente.id;
  const [creada] = await db
    .insert(contraparte)
    .values({
      docTipo: 'otro',
      docNro: 'DGA',
      nombre: 'Dirección General de Aduanas',
    })
    .onConflictDoNothing()
    .returning({ id: contraparte.id });
  if (creada) return creada.id;
  const [otra] = await db
    .select({ id: contraparte.id })
    .from(contraparte)
    .where(and(eq(contraparte.docTipo, 'otro'), eq(contraparte.docNro, 'DGA')))
    .limit(1);
  return otra.id;
}

export const confirmarDespacho = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      despachoId: z.string().uuid(),
      // La persona puede corregir lo extraído antes de confirmar.
      alicuota: z.number().positive().max(100),
      ivaUsd: z.number().positive(),
      tipoCambio: z.number().positive(),
      numero: z.string().trim().min(1),
      fecha: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const [desp] = await db
      .select()
      .from(despachoImportacion)
      .where(
        and(
          eq(despachoImportacion.id, ctx.data.despachoId),
          eq(despachoImportacion.orgId, orgId)
        )
      )
      .limit(1);
    if (!desp) throw new Error('Despacho no encontrado');
    if (desp.estado === 'confirmado')
      throw new Error('Este despacho ya tiene su compra generada');

    // El cálculo se rehace en el server con lo confirmado: lo que firma la
    // persona es lo que queda, no lo que leyó la IA.
    const derivados = calcularDespacho(ctx.data);
    const fechaEmision =
      ctx.data.fecha ?? new Date().toISOString().slice(0, 10);
    const contraparteId = await contraparteAduana();

    const [compra] = await db
      .insert(comprobante)
      .values({
        orgId,
        clienteId: desp.clienteId,
        direccion: 'recibido',
        tipo: 66,
        puntoVenta: 0,
        numero: numeroComprobanteSintetico(ctx.data.numero),
        fechaEmision,
        contraparteId,
        moneda: 'ARS',
        cotizacion: '1',
        netoGravado: derivados.netoGravado.toFixed(2),
        ivaTotal: derivados.ivaPesos.toFixed(2),
        total: derivados.total.toFixed(2),
        fuente: 'import',
      })
      .onConflictDoNothing()
      .returning({ id: comprobante.id });
    if (!compra)
      throw new Error(
        'Ya existe una compra para este despacho (mismo número). Revisá en Facturas.'
      );

    await db.insert(comprobanteAlicuota).values({
      comprobanteId: compra.id,
      alicuota: ctx.data.alicuota.toFixed(2),
      neto: derivados.netoGravado.toFixed(2),
      iva: derivados.ivaPesos.toFixed(2),
    });

    const [actualizado] = await db
      .update(despachoImportacion)
      .set({
        numero: ctx.data.numero,
        fecha: ctx.data.fecha,
        alicuota: ctx.data.alicuota.toFixed(2),
        ivaUsd: ctx.data.ivaUsd.toFixed(2),
        tipoCambio: ctx.data.tipoCambio.toFixed(6),
        ivaPesos: derivados.ivaPesos.toFixed(2),
        netoGravado: derivados.netoGravado.toFixed(2),
        total: derivados.total.toFixed(2),
        estado: 'confirmado',
        comprobanteId: compra.id,
      })
      .where(eq(despachoImportacion.id, desp.id))
      .returning({
        id: despachoImportacion.id,
        clienteId: despachoImportacion.clienteId,
        documentoId: despachoImportacion.documentoId,
        tipo: despachoImportacion.tipo,
        numero: despachoImportacion.numero,
        fecha: despachoImportacion.fecha,
        alicuota: despachoImportacion.alicuota,
        ivaUsd: despachoImportacion.ivaUsd,
        tipoCambio: despachoImportacion.tipoCambio,
        ivaPesos: despachoImportacion.ivaPesos,
        netoGravado: despachoImportacion.netoGravado,
        total: despachoImportacion.total,
        estado: despachoImportacion.estado,
        comprobanteId: despachoImportacion.comprobanteId,
        importadorCoincide: sql<
          boolean | null
        >`(extraccion -> 'importadorCoincide')::boolean`,
        importadorDocumento: sql<
          string | null
        >`extraccion ->> 'importadorDelDocumento'`,
      });

    return {
      despacho: actualizado,
      nombreCompra: nombreCompraDespacho(desp.tipo, ctx.data.numero),
    };
  });

export const descartarDespacho = createServerFn({ method: 'POST' })
  .validator(z.object({ despachoId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const [fila] = await db
      .update(despachoImportacion)
      .set({ estado: 'descartado' })
      .where(
        and(
          eq(despachoImportacion.id, ctx.data.despachoId),
          eq(despachoImportacion.orgId, orgId),
          eq(despachoImportacion.estado, 'extraido')
        )
      )
      .returning({ id: despachoImportacion.id });
    if (!fila) {
      // También se puede descartar uno en revisión; confirmados no.
      const [rev] = await db
        .update(despachoImportacion)
        .set({ estado: 'descartado' })
        .where(
          and(
            eq(despachoImportacion.id, ctx.data.despachoId),
            eq(despachoImportacion.orgId, orgId),
            eq(despachoImportacion.estado, 'revision')
          )
        )
        .returning({ id: despachoImportacion.id });
      if (!rev) {
        // Ya estaba descartado: descartar dos veces no es un error.
        const [ya] = await db
          .select({ estado: despachoImportacion.estado })
          .from(despachoImportacion)
          .where(
            and(
              eq(despachoImportacion.id, ctx.data.despachoId),
              eq(despachoImportacion.orgId, orgId)
            )
          )
          .limit(1);
        if (ya?.estado !== 'descartado')
          throw new Error(
            'El despacho no se puede descartar (¿ya está confirmado?)'
          );
      }
    }
    return { ok: true };
  });

export const listarDespachos = createServerFn({ method: 'GET' })
  .validator(z.object({ clienteId: z.string().uuid().optional() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    return await db
      .select({
        id: despachoImportacion.id,
        clienteId: despachoImportacion.clienteId,
        clienteNombre: cliente.razonSocial,
        documentoId: despachoImportacion.documentoId,
        tipo: despachoImportacion.tipo,
        numero: despachoImportacion.numero,
        fecha: despachoImportacion.fecha,
        alicuota: despachoImportacion.alicuota,
        ivaUsd: despachoImportacion.ivaUsd,
        tipoCambio: despachoImportacion.tipoCambio,
        ivaPesos: despachoImportacion.ivaPesos,
        netoGravado: despachoImportacion.netoGravado,
        total: despachoImportacion.total,
        estado: despachoImportacion.estado,
        comprobanteId: despachoImportacion.comprobanteId,
        importadorCoincide: sql<
          boolean | null
        >`(extraccion -> 'importadorCoincide')::boolean`,
        importadorDocumento: sql<
          string | null
        >`extraccion ->> 'importadorDelDocumento'`,
        createdAt: despachoImportacion.createdAt,
      })
      .from(despachoImportacion)
      .innerJoin(cliente, eq(cliente.id, despachoImportacion.clienteId))
      .where(
        and(
          eq(despachoImportacion.orgId, orgId),
          ctx.data.clienteId
            ? eq(despachoImportacion.clienteId, ctx.data.clienteId)
            : undefined
        )
      )
      .orderBy(desc(despachoImportacion.createdAt))
      .limit(100);
  });
