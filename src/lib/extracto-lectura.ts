/**
 * Lectura de un extracto bancario con Gemini.
 *
 * Separado de los server functions a propósito: el worker de la cola
 * (`extractos-worker.ts`) necesita leer un PDF sin pasar por una llamada HTTP
 * a sí mismo. Acá vive el prompt, el schema de salida y el enrutado por
 * modelo; la aritmética (cuadre) sigue siendo nuestra, en `extracto-calc`.
 *
 * Solo servidor: habla con la API del modelo y con R2.
 */
import { FinishReason, GoogleGenAI, type Schema } from '@google/genai';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as r2 from '@/lib/r2';
import { documento, extractoBancario } from '@/drizzle/schema';
import {
  cuadreExtracto,
  monedaIso,
  type MovimientoExtraido,
} from '@/lib/extracto-calc';
import { clasificarMovimiento } from '@/lib/clasificar-movimiento';
import { aLatino } from '@/lib/texto-latino';

const ai = new GoogleGenAI({
  apiKey: (process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY)!,
});

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
export type { CuentaExtraida, ExtractoExtraido };
export { ErrorDeLectura, extraerConGemini };

/**
 * Resumen de una lectura, tal como lo guarda la cola: la extracción completa
 * más los pocos campos que la lista necesita para pintarse sin abrir el jsonb.
 */
export interface LecturaGuardable {
  extraccion: {
    banco: string;
    periodoDesde: string;
    periodoHasta: string;
    cuentas: (CuentaExtraida & {
      movimientos: (MovimientoExtraido & { categoria: string })[];
    })[];
  };
  banco: string;
  periodoDesde: string | null;
  periodoHasta: string | null;
  cuentas: number;
  movimientos: number;
  cuadra: boolean;
}

/** `YYYY-MM-DD` o null: el modelo a veces devuelve una fecha vacía. */
const fechaOnull = (v: string): string | null =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/**
 * Lee el PDF de un extracto que ya está en la cola: lo baja de R2, lo pasa por
 * el modelo y devuelve la lectura lista para guardar, con el cuadre de cada
 * cuenta y la categoría propuesta de cada movimiento.
 *
 * No escribe: de eso se encarga el worker, que es el que maneja los estados.
 */
export async function leerExtractoDeDocumento(
  extractoId: string
): Promise<LecturaGuardable> {
  const [fila] = await db
    .select({
      storageKey: documento.storageKey,
      mimeType: documento.mimeType,
      nombre: extractoBancario.nombreArchivo,
    })
    .from(extractoBancario)
    .leftJoin(documento, eq(documento.id, extractoBancario.documentoId))
    .where(eq(extractoBancario.id, extractoId))
    .limit(1);

  if (!fila?.storageKey) {
    throw new ErrorDeLectura(
      'No se encontró el archivo subido. Volvé a subir el extracto.'
    );
  }

  const buffer = await r2.download(fila.storageKey);
  const extracto = await extraerConGemini(
    buffer.toString('base64'),
    fila.mimeType ?? 'application/pdf'
  );

  const conMovimientos = extracto.cuentas.filter(
    (c) => c.movimientos.length > 0
  );
  if (!extracto.legible || conMovimientos.length === 0) {
    throw new ErrorDeLectura(
      'El documento no parece un extracto bancario legible. Si lo es y este banco no está soportado, avisá al equipo con el archivo.'
    );
  }

  const cuentas = conMovimientos.map((c) => ({
    ...c,
    moneda: monedaIso(c.moneda),
    movimientos: c.movimientos.map((m) => {
      // La IA a veces devuelve letras cirílicas que se ven latinas ("СОЕ"):
      // se corrigen antes de clasificar y guardar.
      const descripcion = aLatino(m.descripcion);
      return {
        ...m,
        descripcion,
        importe: Math.abs(m.importe),
        categoria: clasificarMovimiento(descripcion),
      };
    }),
  }));

  return {
    extraccion: {
      banco: extracto.banco,
      periodoDesde: extracto.periodoDesde,
      periodoHasta: extracto.periodoHasta,
      cuentas,
    },
    banco: extracto.banco,
    periodoDesde: fechaOnull(extracto.periodoDesde),
    periodoHasta: fechaOnull(extracto.periodoHasta),
    cuentas: cuentas.length,
    movimientos: cuentas.reduce((a, c) => a + c.movimientos.length, 0),
    cuadra: cuentas.every(
      (c) => cuadreExtracto(c.saldoInicial, c.saldoFinal, c.movimientos).cuadra
    ),
  };
}
