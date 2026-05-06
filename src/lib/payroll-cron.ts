/**
 * Cron mensual de escalas salariales.
 *
 * El día 20 de cada mes, para cada fuente configurada en CCT_SOURCES:
 *  1. Descarga el HTML de la página
 *  2. Usa Gemini para extraer los períodos y montos por categoría
 *  3. Hace upsert en payroll_escala para todos los convenios CCT coincidentes
 *
 * Llamado desde server.ts al iniciar el servidor de producción.
 */

import { GoogleGenAI } from '@google/genai';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  payrollConvenio,
  payrollConvenioCategoria,
  payrollEscala,
} from '@/drizzle/schema';

// ─────────────────────────────────────────────────────────────────────────────
// Fuentes CCT monitoreadas
// ─────────────────────────────────────────────────────────────────────────────

export const CCT_SOURCES = [
  {
    cctCodigo: '130/75',
    nombre: 'Empleados de Comercio',
    url: 'https://estudiovilaplana.com.ar/escala-salarial-empleados-comercio/',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────────────────────

interface EscalaCategoria {
  nombre: string;
  basico: number;
}
interface PeriodoEscala {
  label: string;
  vigenciaDesde: string; // YYYY-MM-DD
  vigenciaHasta: string; // YYYY-MM-DD o ''
  noRemunerativo: number;
  categorias: EscalaCategoria[];
}
interface ParsedResult {
  periodos: PeriodoEscala[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch y limpieza de HTML
// ─────────────────────────────────────────────────────────────────────────────

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArcaBot/1.0)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al acceder a ${url}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(+n))
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 60_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracción con Gemini
// ─────────────────────────────────────────────────────────────────────────────

async function parseEscalasWithAI(
  pageText: string,
  cctNombre: string
): Promise<ParsedResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY no configurada');

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Sos un extractor de datos de escalas salariales argentinas para el convenio "${cctNombre}".
Del siguiente texto de una página web, extraé TODOS los períodos de vigencia y los montos por categoría.

Para cada período devolvé:
- label: nombre descriptivo (ej. "Abril 2026")
- vigenciaDesde: fecha inicio YYYY-MM-DD
- vigenciaHasta: fecha fin YYYY-MM-DD (vacío "" si no tiene fin definido)
- noRemunerativo: suma total de adicionales no remunerativos que aplican a todas las categorías en ese período (número, 0 si no hay). Si hay "$100.000 NR + $20.000 recomposición", el total es 120000.
- categorias: array de { nombre, basico } donde basico es el sueldo básico remunerativo en pesos (entero sin puntos ni símbolos). Si el texto dice "1.078.911" el número es 1078911.

IMPORTANTE:
- Solo incluí períodos con montos concretos. No incluyas períodos futuros sin valores.
- El campo basico debe ser SOLO el remunerativo, sin sumarle el NR.
- Cada período puede tener entre 15 y 25 categorías.

Texto:
${pageText}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          periodos: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                label: { type: 'STRING' },
                vigenciaDesde: { type: 'STRING' },
                vigenciaHasta: { type: 'STRING' },
                noRemunerativo: { type: 'NUMBER' },
                categorias: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      nombre: { type: 'STRING' },
                      basico: { type: 'NUMBER' },
                    },
                    required: ['nombre', 'basico'],
                  },
                },
              },
              required: [
                'label',
                'vigenciaDesde',
                'vigenciaHasta',
                'noRemunerativo',
                'categorias',
              ],
            },
          },
        },
        required: ['periodos'],
      },
    },
  });

  const text = response.text ?? '';
  if (!text) throw new Error('Gemini no devolvió respuesta');

  const parsed = JSON.parse(text) as ParsedResult;
  if (!Array.isArray(parsed.periodos) || parsed.periodos.length === 0) {
    throw new Error('Gemini no detectó períodos en la página');
  }

  // Validación de rangos razonables para montos en ARS (2024–2031)
  for (const p of parsed.periodos) {
    for (const c of p.categorias) {
      if (c.basico < 100_000 || c.basico > 100_000_000) {
        throw new Error(
          `Monto fuera de rango: ${c.basico} para "${c.nombre}" en ${p.label}`
        );
      }
    }
  }

  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalización de nombres para matching
// ─────────────────────────────────────────────────────────────────────────────

function canon(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert de escalas en la BD para un CCT
// ─────────────────────────────────────────────────────────────────────────────

async function syncCCT(
  cctCodigo: string,
  periodos: PeriodoEscala[],
  fuente: string
): Promise<{ upserted: number; skipped: number }> {
  const convenios = await db
    .select({ id: payrollConvenio.id })
    .from(payrollConvenio)
    .where(eq(payrollConvenio.cctCodigo, cctCodigo));

  if (convenios.length === 0) return { upserted: 0, skipped: 0 };

  const convenioIds = convenios.map((c) => c.id);
  const categorias = await db
    .select({
      id: payrollConvenioCategoria.id,
      convenioId: payrollConvenioCategoria.convenioId,
      nombre: payrollConvenioCategoria.nombre,
    })
    .from(payrollConvenioCategoria)
    .where(inArray(payrollConvenioCategoria.convenioId, convenioIds));

  let upserted = 0;
  let skipped = 0;

  for (const conv of convenios) {
    const convCats = categorias.filter((c) => c.convenioId === conv.id);
    const catByCanon = new Map(convCats.map((c) => [canon(c.nombre), c]));

    for (const periodo of periodos) {
      const desde = new Date(periodo.vigenciaDesde);
      if (isNaN(desde.getTime())) {
        skipped++;
        continue;
      }
      const hasta = periodo.vigenciaHasta
        ? new Date(periodo.vigenciaHasta)
        : null;
      const nr = periodo.noRemunerativo ?? 0;

      for (const ref of periodo.categorias) {
        const cat = catByCanon.get(canon(ref.nombre));
        if (!cat) {
          skipped++;
          continue;
        }

        const [existing] = await db
          .select({ id: payrollEscala.id })
          .from(payrollEscala)
          .where(
            and(
              eq(payrollEscala.categoriaId, cat.id),
              eq(payrollEscala.vigenciaDesde, desde),
              eq(payrollEscala.periodoLabel, periodo.label)
            )
          )
          .limit(1);

        if (existing) {
          await db
            .update(payrollEscala)
            .set({
              montoBasico: String(ref.basico),
              montoNoRemunerativo: String(nr),
              vigenciaHasta: hasta,
              fuente,
              updatedAt: new Date(),
            })
            .where(eq(payrollEscala.id, existing.id));
        } else {
          await db.insert(payrollEscala).values({
            categoriaId: cat.id,
            vigenciaDesde: desde,
            vigenciaHasta: hasta,
            montoBasico: String(ref.basico),
            montoNoRemunerativo: String(nr),
            periodoLabel: periodo.label,
            fuente,
          });
        }
        upserted++;
      }
    }
  }

  return { upserted, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Job principal (también exportado para uso manual desde scripts)
// ─────────────────────────────────────────────────────────────────────────────

export async function runPayrollCronJob(): Promise<void> {
  console.log(
    '[payroll-cron] Iniciando actualización de escalas salariales...'
  );

  for (const source of CCT_SOURCES) {
    try {
      console.log(
        `[payroll-cron] ${source.cctCodigo} (${source.nombre}) — ${source.url}`
      );
      const pageText = await fetchPageText(source.url);
      const { periodos } = await parseEscalasWithAI(pageText, source.nombre);
      console.log(
        `[payroll-cron] Gemini detectó ${periodos.length} período(s) con ` +
          `${periodos.reduce((s, p) => s + p.categorias.length, 0)} valores de categorías`
      );
      const { upserted, skipped } = await syncCCT(
        source.cctCodigo,
        periodos,
        source.url
      );
      console.log(
        `[payroll-cron] ${source.cctCodigo}: ${upserted} escalas guardadas, ${skipped} sin coincidencia`
      );
    } catch (err) {
      console.error(
        `[payroll-cron] Error en ${source.cctCodigo}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log('[payroll-cron] Actualización completada');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler — llamado desde server.ts al arrancar
// ─────────────────────────────────────────────────────────────────────────────

let lastRunMonth = '';

export function startPayrollCron(): void {
  if (!process.env.DATABASE_URL) {
    console.log(
      '[payroll-cron] DATABASE_URL no configurada — cron desactivado'
    );
    return;
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.log(
      '[payroll-cron] GOOGLE_GENERATIVE_AI_API_KEY no configurada — cron desactivado'
    );
    return;
  }

  // Verificar cada hora si es el día 20 y no corrió este mes
  setInterval(
    () => {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${now.getMonth()}`;
      if (now.getDate() === 20 && yearMonth !== lastRunMonth) {
        lastRunMonth = yearMonth;
        runPayrollCronJob().catch((err: unknown) => {
          console.error('[payroll-cron] Error en job mensual:', err);
        });
      }
    },
    60 * 60 * 1000
  );

  console.log(
    '[payroll-cron] Cron configurado: se ejecuta el día 20 de cada mes'
  );
}
