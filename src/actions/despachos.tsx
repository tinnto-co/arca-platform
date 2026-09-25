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
  despachoAlicuota,
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
  inferirLineas,
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
  /**
   * Los conceptos 415 del documento, uno por renglón leído. Es una lista y no
   * un número porque un despacho puede traer varios: una Importación Directa
   * lista un 415 por ítem y un courier puede consolidar varios envíos.
   */
  conceptos415: { alicuota: number; ivaUsd: number }[];
  tipoCambio: number;
  /**
   * Base imponible en dólares, cuando el documento la trae. Sirve para deducir
   * la alícuota cuando ningún renglón la dice, que es lo que pasa en las
   * liquidaciones de courier consolidadas.
   */
  baseImponibleUsd: number;
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
    conceptos415: {
      type: 'ARRAY',
      description:
        'TODOS los renglones del Concepto 415 (IVA) del documento, uno por elemento. Un despacho puede tener varios: la Importación Directa lista un 415 por ítem/foja, y un courier puede consolidar varios envíos. Si el documento trae además un total consolidado del 415, devolvé SOLO el total (una entrada) y no también los parciales, para no duplicar. Lista vacía si no se encuentra ninguno.',
      items: {
        type: 'OBJECT',
        properties: {
          alicuota: {
            type: 'NUMBER',
            description:
              'Alícuota de IVA de ESE renglón, en porcentaje (21 o 10.5). 0 si el renglón no la indica: se deduce después, no la inventes.',
          },
          ivaUsd: {
            type: 'NUMBER',
            description:
              'Importe de ESE renglón del Concepto 415 en DÓLARES, tal como figura.',
          },
        },
        required: ['alicuota', 'ivaUsd'],
      },
    },
    baseImponibleUsd: {
      type: 'NUMBER',
      description:
        'Base imponible del IVA en DÓLARES si el documento la trae (suele figurar como "Base Imponible", o como valor en aduana + derechos de importación + tasa de estadística). 0 si no se puede leer. No la calcules a partir del IVA.',
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
    'conceptos415',
    'baseImponibleUsd',
    'tipoCambio',
    'legible',
    'importadorCoincide',
    'importadorDelDocumento',
  ],
} as Schema;

const PROMPT = `Sos un extractor de datos de DESPACHOS DE IMPORTACIÓN argentinos (Aduana/ARCA y couriers).

QUÉ BUSCAR — el CONCEPTO 415 (IVA):
Los despachos listan conceptos numerados. El concepto 415 es el IVA de la importación. De ahí sale lo que importa:
1. TODOS los renglones del 415, cada uno con su ALÍCUOTA (21% o 10,5%) y su importe en DÓLARES.
2. El TIPO DE CAMBIO del documento (la cotización usada para pesificar).
3. La BASE IMPONIBLE en dólares, si el documento la trae.

PUEDE HABER MÁS DE UN 415 (importante):
- En una Importación Directa, cada ítem/foja del despacho tiene su propio
  concepto 415. Si el documento trae además una columna "TOTAL" con el 415
  consolidado de todo el despacho, devolvé SOLO ese total: es la suma de los
  ítems y cargar las dos cosas duplicaría el IVA.
- En un courier, la liquidación puede consolidar varios envíos y traer un
  único 415 SIN alícuota. En ese caso devolvé ese renglón con alicuota=0 y
  completá baseImponibleUsd: la alícuota se deduce después con la base. NO la
  adivines ni pongas 21 por defecto.
- Si dos renglones tienen alícuotas distintas (21% y 10,5%), devolvé los dos
  por separado: cada alícuota necesita su propio importe.

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
- NO inventes: si un dato no está, devolvé 0 (o cadena vacía para la fecha) y marcá legible=false si el documento es dudoso. Vale especialmente para la alícuota: 0 significa "el documento no la dice" y se resuelve después; un 21 inventado se convierte en un crédito fiscal equivocado.
- Si hay varios conceptos, el 415 es el IVA; no lo confundas con 410 (derechos), 416/422 (IVA adicional/percepción) ni otros.
- La imagen puede ser una foto de baja calidad: esforzate igual, priorizá la fila del concepto 415.`;

/**
 * Las líneas del despacho, resueltas: lo que la IA leyó más lo que se puede
 * deducir.
 *
 * Un renglón con alicuota=0 significa "el documento no la dice", que es lo que
 * pasa en las liquidaciones de courier consolidadas. Si el documento trae la
 * base imponible, la alícuota se deduce: el cociente IVA/base da 21% o 10,5%
 * justo, o cae en el medio y entonces hay de las dos y se despeja el reparto.
 *
 * Lo deducido se marca para que quede a la vista: es una propuesta para que
 * alguien la confirme, no un dato leído.
 */
function resolverLineas(e: Extraccion): {
  lineas: { alicuota: number; ivaUsd: number }[];
  inferido: boolean;
} {
  const conAlicuota = e.conceptos415.filter(
    (c) => c.ivaUsd > 0 && alicuotaValida(c.alicuota)
  );
  const sinAlicuota = e.conceptos415.filter(
    (c) => c.ivaUsd > 0 && !alicuotaValida(c.alicuota)
  );
  if (sinAlicuota.length === 0) return { lineas: conAlicuota, inferido: false };

  // Solo se deduce cuando hay UN renglón sin alícuota y una base para
  // dividir. Con varios, no se sabe qué parte de la base es de cuál.
  const ivaSuelto = sinAlicuota.reduce((s, c) => s + c.ivaUsd, 0);
  const inferidas =
    sinAlicuota.length === 1 && conAlicuota.length === 0
      ? inferirLineas(ivaSuelto, e.baseImponibleUsd)
      : null;

  return inferidas
    ? { lineas: [...conAlicuota, ...inferidas.lineas], inferido: true }
    : { lineas: conAlicuota, inferido: false };
}

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
    const ivaLeido = extraccion.conceptos415.reduce((s, c) => s + c.ivaUsd, 0);
    if (!extraccion.numero || (!ivaLeido && !extraccion.tipoCambio)) {
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

    // 3. La fila del despacho. Sin alícuota utilizable → 'revision', nunca
    // cálculo mudo; y lo deducido también, porque es una propuesta.
    const { lineas, inferido } = resolverLineas(extraccion);
    const derivados = calcularDespacho({
      lineas,
      tipoCambio: extraccion.tipoCambio,
    });
    const estado =
      lineas.length > 0 &&
      !inferido &&
      extraccion.legible &&
      extraccion.importadorCoincide
        ? 'extraido'
        : 'revision';
    const aviso = !extraccion.importadorCoincide
      ? `Ojo: el documento parece ser de ${extraccion.importadorDelDocumento || 'otro importador'}, no de la empresa seleccionada.`
      : inferido
        ? 'El documento no dice la alícuota: se dedujo de la base imponible. Revisá el reparto antes de confirmar.'
        : lineas.length === 0
          ? 'No se pudo leer ninguna alícuota del Concepto 415: cargala a mano.'
          : null;

    // La alícuota del padre es la de mayor importe: el listado la muestra y
    // no tiene sentido inventar un promedio. El detalle vive en las líneas.
    const principal = derivados.lineas[0]?.alicuota ?? 0;
    const ivaUsdTotal = derivados.lineas.reduce((s, l) => s + l.ivaUsd, 0);

    const [fila] = await db
      .insert(despachoImportacion)
      .values({
        orgId,
        clienteId: ctx.data.clienteId,
        documentoId,
        tipo: extraccion.tipoDocumento,
        numero: extraccion.numero.trim(),
        fecha: extraccion.fecha === '' ? null : extraccion.fecha,
        alicuota: principal.toFixed(2),
        ivaUsd: ivaUsdTotal.toFixed(2),
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
          alicuota: principal.toFixed(2),
          ivaUsd: ivaUsdTotal.toFixed(2),
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

    // Las líneas, una por alícuota. Se rehacen enteras: si la lectura cambió,
    // lo que quedó de la anterior no tiene por qué sobrevivir.
    if (fila) {
      await db
        .delete(despachoAlicuota)
        .where(eq(despachoAlicuota.despachoId, fila.id));
      if (derivados.lineas.length > 0)
        await db.insert(despachoAlicuota).values(
          derivados.lineas.map((l) => ({
            despachoId: fila.id,
            alicuota: l.alicuota.toFixed(2),
            ivaUsd: l.ivaUsd.toFixed(2),
            ivaPesos: l.ivaPesos.toFixed(2),
            netoGravado: l.netoGravado.toFixed(2),
          }))
        );
    }

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
      // Las líneas del que ya estaba: son las que se van a editar.
      const guardadas = await db
        .select({
          alicuota: despachoAlicuota.alicuota,
          ivaUsd: despachoAlicuota.ivaUsd,
        })
        .from(despachoAlicuota)
        .where(eq(despachoAlicuota.despachoId, existente.id))
        .orderBy(desc(despachoAlicuota.alicuota));
      return {
        despacho: { ...existente, lineas: guardadas },
        duplicado: true,
        aviso,
      };
    }
    return {
      despacho: {
        ...fila,
        lineas: derivados.lineas.map((l) => ({
          alicuota: l.alicuota.toFixed(2),
          ivaUsd: l.ivaUsd.toFixed(2),
        })),
      },
      duplicado: false,
      aviso,
    };
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
      // La persona puede corregir lo extraído antes de confirmar, y agregar o
      // sacar líneas: un despacho puede tener varios conceptos 415.
      lineas: z
        .array(
          z.object({
            alicuota: z.number().positive().max(100),
            ivaUsd: z.number().positive(),
          })
        )
        .min(1),
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
    const derivados = calcularDespacho({
      lineas: ctx.data.lineas,
      tipoCambio: ctx.data.tipoCambio,
    });
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

    // Una fila por alícuota: es lo que el libro de IVA compras agrupa y lo
    // que hace que el crédito fiscal quede discriminado. `calcularDespacho` ya
    // consolidó las líneas repetidas, así que ninguna choca con el unique
    // (comprobante, alícuota).
    await db.insert(comprobanteAlicuota).values(
      derivados.lineas.map((l) => ({
        comprobanteId: compra.id,
        alicuota: l.alicuota.toFixed(2),
        neto: l.netoGravado.toFixed(2),
        iva: l.ivaPesos.toFixed(2),
      }))
    );

    const [actualizado] = await db
      .update(despachoImportacion)
      .set({
        numero: ctx.data.numero,
        fecha: ctx.data.fecha,
        alicuota: (derivados.lineas[0]?.alicuota ?? 0).toFixed(2),
        ivaUsd: derivados.lineas
          .reduce((acc, l) => acc + l.ivaUsd, 0)
          .toFixed(2),
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

    // Las líneas del despacho quedan como lo que se confirmó, no como lo que
    // leyó la IA: son el respaldo de por qué la compra tiene esas alícuotas.
    await db
      .delete(despachoAlicuota)
      .where(eq(despachoAlicuota.despachoId, desp.id));
    await db.insert(despachoAlicuota).values(
      derivados.lineas.map((l) => ({
        despachoId: desp.id,
        alicuota: l.alicuota.toFixed(2),
        ivaUsd: l.ivaUsd.toFixed(2),
        ivaPesos: l.ivaPesos.toFixed(2),
        netoGravado: l.netoGravado.toFixed(2),
      }))
    );

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
        // Las líneas van en el mismo viaje: la fila se despliega para
        // editarlas y pedirlas aparte por cada despacho sería una consulta
        // por fila.
        // Como texto, igual que el resto de las columnas numeric: así la fila
        // del listado y la de la extracción tienen la misma forma.
        lineas: sql<{ alicuota: string; ivaUsd: string }[]>`coalesce((
          select json_agg(json_build_object(
                   'alicuota', a.alicuota::text,
                   'ivaUsd', a.iva_usd::text)
                 order by a.alicuota desc)
          from despacho_alicuota a
          where a.despacho_id = ${despachoImportacion.id}
        ), '[]'::json)`,
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
