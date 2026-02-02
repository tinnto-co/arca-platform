import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { GoogleGenAI, Schema } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
});

/* =========================
   INPUT
========================= */
const scanSchema = z.object({
    fileBase64: z.string().min(1),
});

/* =========================
   OUTPUT
========================= */
const movementSchema = z.object({
    fecha: z.string(),
    tipo: z.enum(["ingreso", "egreso"]),
    monto: z.string(),
    infoExtra: z.string(),
});

const outputSchema = z.object({
    banco: z.string(),
    saldo_inicial: z.string(),
    saldo_final: z.string(),
    ingresos: z.array(movementSchema),
    egresos: z.array(movementSchema),
});

/* =========================
   SERVER FN
========================= */
export const scanBankStatement = createServerFn({
    method: "POST",
})
    .inputValidator(scanSchema)
    .handler(async (ctx) => {
        const { fileBase64 } = ctx.data;

        // Construir schema optimizado manualmente según mejores prácticas de Gemini
        const optimizedSchema: Schema = {
            type: "OBJECT",
            properties: {
                banco: {
                    type: "STRING",
                },
                saldo_inicial: {
                    type: "STRING",
                },
                saldo_final: {
                    type: "STRING",
                },
                ingresos: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            fecha: {
                                type: "STRING",
                            },
                            tipo: {
                                type: "STRING",
                                enum: ["ingreso", "egreso"],
                            },
                            monto: {
                                type: "STRING",
                            },
                            infoExtra: {
                                type: "STRING",
                            },
                        },
                        required: ["fecha", "tipo", "monto", "infoExtra"],
                    },
                },
                egresos: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            fecha: {
                                type: "STRING",
                            },
                            tipo: {
                                type: "STRING",
                                enum: ["ingreso", "egreso"],
                            },
                            monto: {
                                type: "STRING",
                            },
                            infoExtra: {
                                type: "STRING",
                            },
                        },
                        required: ["fecha", "tipo", "monto", "infoExtra"],
                    },
                },
            },
            required: ["banco", "saldo_inicial", "saldo_final", "ingresos", "egresos"],
            propertyOrdering: ["banco", "saldo_inicial", "saldo_final", "ingresos", "egresos"],
        } as Schema;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            config: {
                responseMimeType: "application/json",
                responseJsonSchema: optimizedSchema,
            },
            contents: [
                {
                    text: `
Eres un extractor de datos bancarios especializado en extractos de cuenta corriente argentinos.

ESTRUCTURA DEL DOCUMENTO:
El extracto tiene una tabla de movimientos con estas columnas:
- Fecha
- Descripción (puede ocupar múltiples líneas)
- Origen (puede estar vacío o tener información)
- Crédito (valores positivos, sin signo)
- Débito (valores negativos, con signo menos "-")
- Saldo (saldo después de cada movimiento)

INSTRUCCIONES DETALLADAS:

1. IDENTIFICAR EL BANCO:
   - Busca el nombre completo del banco en el encabezado del documento
   - Ejemplos: "BANCO DE GALICIA Y BUENOS AIRES", "BANCO BBVA ARGENTINA", "BANCO DE LA NACIÓN ARGENTINA"
   - Si aparece abreviado, usa el nombre completo más común (ej: "BANCO DE GALICIA Y B" → "Banco Galicia")
   - Extrae SOLO el nombre del banco, sin palabras adicionales como "SA", "S.A.", etc.

2. IDENTIFICAR SALDOS:
   - Busca la sección que dice "Saldos" o similar al inicio del documento
   - Saldo inicial: Es el PRIMER valor numérico en la sección de saldos (el menor, generalmente)
   - Saldo final: Es el SEGUNDO valor numérico en la sección de saldos (el mayor, generalmente)
   - Los saldos usan formato argentino: puntos para miles y coma para decimales (ej: "16.577.985,27")
   - Extrae el valor EXACTAMENTE como aparece, incluyendo puntos y comas
   - Si no encuentras la sección de saldos, el saldo inicial puede ser el primer valor en la columna "Saldo" de la tabla

3. IDENTIFICAR INGRESOS (CRÉDITOS):
   - Los INGRESOS están en la columna "Crédito" de la tabla
   - Esta columna contiene valores POSITIVOS (sin signo menos)
   - Si una fila tiene un valor en la columna "Crédito" (aunque sea pequeño), es un INGRESO
   - La columna "Débito" debe estar VACÍA o con "-" para los ingresos
   - Para cada ingreso, extrae:
     * fecha: La fecha de la columna "Fecha" (formato DD/MM/YY o DD/MM/YYYY, mantén el formato original)
     * monto: El valor numérico de la columna "Crédito" EXACTAMENTE como aparece (con puntos y comas, ej: "1.372.006,92")
     * infoExtra: Toda la información de la columna "Descripción" (puede ser múltiples líneas, únelas con espacios)
   - Si la descripción tiene múltiples líneas, incluye TODAS las líneas unidas

4. IDENTIFICAR EGRESOS (DÉBITOS):
   - Los EGRESOS están en la columna "Débito" de la tabla
   - Esta columna contiene valores NEGATIVOS (con signo menos "-" al inicio)
   - Si una fila tiene un valor en la columna "Débito" (con signo menos), es un EGRESO
   - La columna "Crédito" debe estar VACÍA para los egresos
   - Para cada egreso, extrae:
     * fecha: La fecha de la columna "Fecha" (formato DD/MM/YY o DD/MM/YYYY, mantén el formato original)
     * monto: El valor numérico de la columna "Débito" SIN el signo menos (ej: si dice "-41.160,21", extrae "41.160,21")
     * infoExtra: Toda la información de la columna "Descripción" (puede ser múltiples líneas, únelas con espacios)
   - Si la descripción tiene múltiples líneas, incluye TODAS las líneas unidas

5. PROCESAMIENTO DE LA TABLA:
   - Lee la tabla FILA POR FILA desde el inicio hasta el final
   - Cada fila representa UN movimiento (ya sea ingreso o egreso)
   - NO combines múltiples filas en un solo movimiento
   - Si una descripción ocupa múltiples filas, únelas todas en el campo "infoExtra"
   - Procesa TODAS las filas de la tabla, sin omitir ninguna

6. FORMATO DE DATOS:
   - Fechas: Mantén el formato original (DD/MM/YY o DD/MM/YYYY)
   - Montos: Mantén el formato original con puntos y comas (ej: "1.372.006,92" o "41.160,21")
   - NO elimines puntos ni comas de los montos
   - NO agregues símbolos de moneda ($, pesos, etc.)
   - Descripciones: Une todas las líneas con un espacio " "

FORMATO EXACTO DEL JSON (NOMBRES DE PROPIEDADES OBLIGATORIOS):

{
  "banco": "nombre del banco",
  "saldo_inicial": "16.577.985,27",
  "saldo_final": "23.459.827,45",
  "ingresos": [
    {
      "fecha": "31/07/25",
      "tipo": "ingreso",
      "monto": "1.372.006,92",
      "infoExtra": "G. DE ECHEQ GALICIA Q 2793"
    }
  ],
  "egresos": [
    {
      "fecha": "31/07/25",
      "tipo": "egreso",
      "monto": "41.160,21",
      "infoExtra": "ING. BRUTOS S/ CRED REG.RECAU.SIRCREB"
    }
  ]
}

IMPORTANTE - NOMBRES EXACTOS DE PROPIEDADES:
- Usa EXACTAMENTE "saldo_inicial" (con guión bajo, NO "saldoInicial" ni "saldoinicial")
- Usa EXACTAMENTE "saldo_final" (con guión bajo, NO "saldoFinal" ni "saldofinal")
- Usa EXACTAMENTE "banco" (en minúsculas)
- Usa EXACTAMENTE "ingresos" (en minúsculas, plural)
- Usa EXACTAMENTE "egresos" (en minúsculas, plural)
- Dentro de cada movimiento usa: "fecha", "tipo", "monto", "infoExtra" (exactamente así)

REGLAS CRÍTICAS Y VALIDACIONES:
- Cada fila de la tabla debe generar UN objeto en "ingresos" O "egresos" (nunca ambos)
- Si una fila tiene valor en "Crédito" → es INGRESO (la columna "Débito" debe estar vacía)
- Si una fila tiene valor en "Débito" → es EGRESO (la columna "Crédito" debe estar vacía)
- El campo "monto" en egresos NO debe incluir el signo menos "-"
- Los montos deben mantener su formato original (puntos y comas)
- Cada objeto DEBE tener exactamente 4 campos: fecha, tipo, monto, infoExtra
- El campo "tipo" debe ser exactamente "ingreso" o "egreso" (en minúsculas)
- Si no hay movimientos de un tipo, devuelve array vacío []
- NO uses camelCase (saldoInicial, saldoFinal) - usa snake_case (saldo_inicial, saldo_final)
- NO agregues texto, comentarios, ni explicaciones fuera del JSON
- El JSON debe ser válido y parseable
`,
                },
                {
                    inlineData: {
                        mimeType: "application/pdf",
                        data: fileBase64,
                    },
                },
            ],
        });

        if (!response.text) {
            throw new Error("Gemini no devolvió texto");
        }

        const raw = JSON.parse(response.text);

        console.log(response);

        console.log(raw);

        /* =========================
        NORMALIZACIÓN DE PROPIEDADES
        ========================= */
        // Convierte camelCase a snake_case para las propiedades principales
        const normalizeKeys = (obj: any): any => {
            if (Array.isArray(obj)) {
                return obj.map(normalizeKeys);
            }
            if (obj !== null && typeof obj === 'object') {
                const normalized: any = {};
                for (const [key, value] of Object.entries(obj)) {
                    // Mapeo explícito de variantes comunes
                    let normalizedKey = key;
                    if (key === 'saldoInicial' || key === 'saldo_inicial') {
                        normalizedKey = 'saldo_inicial';
                    } else if (key === 'saldoFinal' || key === 'saldo_final') {
                        normalizedKey = 'saldo_final';
                    } else if (key === 'saldoinicial') {
                        normalizedKey = 'saldo_inicial';
                    } else if (key === 'saldofinal') {
                        normalizedKey = 'saldo_final';
                    }
                    normalized[normalizedKey] = normalizeKeys(value);
                }
                return normalized;
            }
            return obj;
        };

        const rawNormalized = normalizeKeys(raw);

        /* =========================
        NORMALIZACIÓN DEFENSIVA
        ========================= */
        const parseFlatMovements = (
            arr: any[],
            tipo: "ingreso" | "egreso"
        ): Array<{ fecha: string; tipo: "ingreso" | "egreso"; monto: string; infoExtra: string }> => {
            const result: Array<{ fecha: string; tipo: "ingreso" | "egreso"; monto: string; infoExtra: string }> = [];

            if (!Array.isArray(arr)) {
                return result;
            }

            for (const item of arr) {
                // Si el item es un string JSON, parsearlo
                if (typeof item === 'string') {
                    try {
                        const parsed = JSON.parse(item);
                        if (parsed && typeof parsed === 'object') {
                            result.push({
                                fecha: String(parsed.fecha ?? ""),
                                tipo,
                                monto: String(parsed.monto ?? ""),
                                infoExtra: String(parsed.infoExtra ?? ""),
                            });
                        }
                    } catch (e) {
                        // Si no es JSON válido, ignorar
                        continue;
                    }
                }
                // Si el item es un objeto directamente
                else if (item && typeof item === 'object') {
                    result.push({
                        fecha: String(item.fecha ?? ""),
                        tipo,
                        monto: String(item.monto ?? ""),
                        infoExtra: String(item.infoExtra ?? ""),
                    });
                }
                // Si es un array plano (formato antiguo), intentar parsearlo
                else if (Array.isArray(item) && item.length >= 8) {
                    const obj: any = {};
                    for (let j = 0; j < item.length; j += 2) {
                        if (j + 1 < item.length) {
                            obj[item[j]] = item[j + 1];
                        }
                    }
                    result.push({
                        fecha: String(obj.fecha ?? ""),
                        tipo,
                        monto: String(obj.monto ?? ""),
                        infoExtra: String(obj.infoExtra ?? ""),
                    });
                }
            }

            return result;
        };


        const normalized = {
            banco: String(rawNormalized.banco ?? ""),
            saldo_inicial: String(rawNormalized.saldo_inicial ?? ""),
            saldo_final: String(rawNormalized.saldo_final ?? ""),
            ingresos: parseFlatMovements(rawNormalized.ingresos ?? [], "ingreso"),
            egresos: parseFlatMovements(rawNormalized.egresos ?? [], "egreso"),
        };


        return outputSchema.parse(normalized);

    });
