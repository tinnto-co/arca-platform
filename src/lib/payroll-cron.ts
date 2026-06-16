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
  payrollParametrosPeriodo,
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

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
    model: 'gemini-2.5-flash',
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
// Tope máximo imponible (RIPTE) — ANSES publica el valor cada mes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fuente para el tope máximo imponible.
 * ignacioonline.com.ar publica una entrada mensual por mes con los valores oficiales de ANSES,
 * accesible sin restricciones (a diferencia de anses.gob.ar que usa Incapsula WAF).
 */
const IGNACIOONLINE_BASE = 'https://www.ignacioonline.com.ar';

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Typos conocidos en las URLs de ignacioonline.com.ar
const MESES_TYPOS: Record<string, string> = { 'febrero': 'febero' };

/**
 * Genera las URLs candidatas para la página de un mes dado.
 * Algunas páginas usan el sufijo "-actualizacion", otras no.
 * El typo "febero" es conocido en el sitio.
 */
function buildTopeUrls(year: number, month: number): string[] {
  const mesNormal = MESES_ES[month - 1];
  const mesTypo = MESES_TYPOS[mesNormal] ?? null;
  const slug = `${year}-aportes-y-contribuciones-base-imponible-maxima-y-minima`;
  const candidates: string[] = [];
  for (const mes of [mesNormal, mesTypo].filter(Boolean) as string[]) {
    candidates.push(`${IGNACIOONLINE_BASE}/${mes}-${slug}-actualizacion/`);
    candidates.push(`${IGNACIOONLINE_BASE}/${mes}-${slug}/`);
  }
  return candidates;
}

async function fetchTopePageText(year: number, month: number): Promise<{ text: string; url: string } | null> {
  const candidates = buildTopeUrls(year, month);
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArcaBot/1.0)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const text = html
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
      if (text.length > 500) return { text, url };
    } catch {
      // siguiente candidato
    }
  }
  return null;
}

interface TopeExtraido {
  periodo: string;      // "YYYY-MM"
  tope: number;         // en pesos, sin centavos (ej: 1357033)
  smvm?: number;        // opcional
  fuente: string;       // URL o referencia normativa
}

async function parseTopeWithAI(
  pageText: string,
  periodoTarget: string
): Promise<TopeExtraido | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Sos un extractor de datos de parámetros laborales argentinos.
Del siguiente texto de ignacioonline.com.ar (tabla de base imponible máxima y mínima para aportes y contribuciones),
extraé el tope máximo imponible para el período ${periodoTarget} (o el más reciente que aparezca si no está ese exacto).

El "tope máximo imponible" es la base imponible MÁXIMA SIPA: el techo sobre el cual se calculan
los aportes y contribuciones previsionales (jubilación 11%, PAMI 3%, obra social 3%).

Devolvé:
- periodo: el período al que corresponde el valor, en formato "YYYY-MM"
- tope: el importe en pesos como número entero (sin puntos ni símbolo $). Si dice "$4.414.652" el número es 4414652.
- smvm: el Salario Mínimo Vital y Móvil si aparece, como número entero. Null si no aparece.
- fuente: "ANSES - Resolución mensual SIPA (via ignacioonline.com.ar)"

Texto:
${pageText}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          periodo: { type: 'STRING' },
          tope: { type: 'NUMBER' },
          smvm: { type: 'NUMBER' },
          fuente: { type: 'STRING' },
        },
        required: ['periodo', 'tope', 'fuente'],
      },
    },
  });

  const text = response.text ?? '';
  if (!text) return null;

  const parsed = JSON.parse(text) as { periodo: string; tope: number; smvm?: number; fuente: string };
  if (!parsed.tope || parsed.tope < 100_000 || parsed.tope > 100_000_000_000) {
    throw new Error(`Tope fuera de rango: ${parsed.tope}`);
  }
  if (!/^\d{4}-\d{2}$/.test(parsed.periodo)) {
    throw new Error(`Período inválido: ${parsed.periodo}`);
  }

  return {
    periodo: parsed.periodo,
    tope: Math.round(parsed.tope),
    smvm: parsed.smvm ? Math.round(parsed.smvm) : undefined,
    fuente: parsed.fuente || IGNACIOONLINE_BASE,
  };
}

export async function syncTopeImponible(): Promise<{ periodo: string; tope: number } | null> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periodoTarget = `${year}-${String(month).padStart(2, '0')}`;

  console.log(`[payroll-cron] Sincronizando tope imponible para ${periodoTarget}...`);

  const fetched = await fetchTopePageText(year, month);
  if (!fetched) {
    console.warn(`[payroll-cron] No se pudo obtener la página de ignacioonline.com.ar para ${periodoTarget}`);
    return null;
  }
  console.log(`[payroll-cron] Página obtenida: ${fetched.url} (${fetched.text.length} chars)`);

  const resultado = await parseTopeWithAI(fetched.text, periodoTarget);
  if (!resultado) {
    console.warn('[payroll-cron] No se pudo extraer el tope imponible de ANSES');
    return null;
  }

  await db
    .insert(payrollParametrosPeriodo)
    .values({
      periodo: resultado.periodo,
      topeMaximoImponible: String(resultado.tope),
      salarioMinimo: resultado.smvm ? String(resultado.smvm) : null,
      fuente: resultado.fuente,
      actualizadoPorCron: true,
    })
    .onConflictDoUpdate({
      target: payrollParametrosPeriodo.periodo,
      set: {
        topeMaximoImponible: String(resultado.tope),
        salarioMinimo: resultado.smvm ? String(resultado.smvm) : null,
        fuente: resultado.fuente,
        actualizadoPorCron: true,
        updatedAt: new Date(),
      },
    });

  console.log(
    `[payroll-cron] Tope imponible ${resultado.periodo}: $${resultado.tope.toLocaleString('es-AR')} — guardado`
  );
  return { periodo: resultado.periodo, tope: resultado.tope };
}

// ─────────────────────────────────────────────────────────────────────────────
// Job principal (también exportado para uso manual desde scripts)
// ─────────────────────────────────────────────────────────────────────────────

export async function runPayrollCronJob(): Promise<void> {
  console.log('[payroll-cron] Iniciando actualización mensual...');

  // ── 1. Tope máximo imponible (RIPTE) ───────────────────────────────────────
  try {
    await syncTopeImponible();
  } catch (err) {
    console.error(
      '[payroll-cron] Error sincronizando tope imponible:',
      err instanceof Error ? err.message : err
    );
  }

  // ── 2. Escalas salariales por CCT ──────────────────────────────────────────
  console.log('[payroll-cron] Actualizando escalas salariales...');
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

  console.log('[payroll-cron] Actualización mensual completada');
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
  if (!process.env.GEMINI_API_KEY) {
    console.log(
      '[payroll-cron] GEMINI_API_KEY no configurada — cron desactivado'
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
