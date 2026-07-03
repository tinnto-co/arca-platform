/**
 * Script: seed-topes-historicos.ts
 *
 * Descarga el historial de topes máximos imponibles desde la página de ANSES
 * y los guarda en payroll_parametros_periodo para TODOS los períodos disponibles
 * en la página (no solo el mes actual).
 *
 * Usar una sola vez para ponerse al día con los meses pasados.
 * De ahí en adelante el cron del día 20 mantiene el tope actualizado solo.
 *
 * Uso:
 *   bun run src/scripts/seed-topes-historicos.ts
 *
 * Requiere: DATABASE_URL y GEMINI_API_KEY en el entorno (o en .env).
 */

import { GoogleGenAI } from '@google/genai';
import { db } from '@/lib/db';
import { payrollParametrosPeriodo } from '@/drizzle/schema';

const TOPE_IMPONIBLE_URL =
  'https://www.anses.gob.ar/informacion/topes-de-aportes-y-contribuciones';

// ─── Fetch y limpieza de HTML ─────────────────────────────────────────────────

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al acceder a ${url}`);
  const html = await res.text();

  // Intentar extraer JSON embebido (páginas Next.js / React SSR guardan datos en __NEXT_DATA__)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch?.[1]) {
    return nextDataMatch[1].slice(0, 80_000);
  }

  // Fallback: extraer texto plano
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
    .slice(0, 80_000);

  return text;
}

// ─── Extracción de TODOS los períodos con Gemini ─────────────────────────────

interface TopeHistorico {
  periodo: string;   // "YYYY-MM"
  tope: number;      // en pesos enteros
  smvm?: number;     // opcional
  fuente: string;
}

async function extraerTodosLosTopeWithAI(pageText: string): Promise<TopeHistorico[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Sos un extractor de datos de parámetros laborales argentinos.

Del siguiente texto de la página de ANSES sobre topes de aportes y contribuciones,
extraé el tope máximo imponible para TODOS los períodos disponibles en la página.

El "tope máximo imponible" es el importe máximo de la remuneración sobre el cual
se calculan aportes y contribuciones previsionales (jubilación 11%, PAMI 3%, obra social 3%).
También puede aparecer como "Máximo imponible para aportes" o "Remuneración máxima imponible".

Para cada período que encuentres devolvé:
- periodo: en formato "YYYY-MM" (ej: "2026-05" para Mayo 2026)
- tope: el importe en pesos como número entero, sin puntos ni símbolo $
  (si dice "$1.357.033" el número es 1357033)
- smvm: el Salario Mínimo Vital y Móvil si aparece para ese período, como entero. Null si no aparece.
- fuente: "ANSES - anses.gob.ar/informacion/topes-de-aportes-y-contribuciones"

IMPORTANTE:
- Incluí TODOS los períodos con valores concretos que aparezcan en la página.
- No incluyas períodos sin valor numérico confirmado.
- Si el mismo período aparece más de una vez, usá el valor más reciente.

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
          topes: {
            type: 'ARRAY',
            items: {
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
        },
        required: ['topes'],
      },
    },
  });

  const text = response.text ?? '';
  if (!text) throw new Error('Gemini no devolvió respuesta');

  const parsed = JSON.parse(text) as { topes: TopeHistorico[] };

  if (!Array.isArray(parsed.topes) || parsed.topes.length === 0) {
    throw new Error('Gemini no encontró ningún período con tope en la página');
  }

  // Validaciones básicas
  const validos: TopeHistorico[] = [];
  for (const t of parsed.topes) {
    if (!/^\d{4}-\d{2}$/.test(t.periodo)) {
      console.warn(`  [skip] Período inválido: "${t.periodo}"`);
      continue;
    }
    if (!t.tope || t.tope < 100_000 || t.tope > 100_000_000_000) {
      console.warn(`  [skip] Tope fuera de rango: ${t.tope} para ${t.periodo}`);
      continue;
    }
    validos.push({
      periodo: t.periodo,
      tope: Math.round(t.tope),
      smvm: t.smvm ? Math.round(t.smvm) : undefined,
      fuente: t.fuente || TOPE_IMPONIBLE_URL,
    });
  }

  return validos;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('='.repeat(60));
console.log('  SEED: Topes Máximos Imponibles Históricos');
console.log('='.repeat(60));
console.log(`\n  Fuente: ${TOPE_IMPONIBLE_URL}\n`);

// 1. Fetch
console.log('  Descargando página de ANSES...');
const pageText = await fetchPageText(TOPE_IMPONIBLE_URL);
console.log(`  Texto extraído: ${pageText.length} chars`);

if (pageText.length < 100) {
  console.error('\n  ERROR: La página de ANSES no devolvió contenido legible.');
  console.error('  Posible causa: la página usa JavaScript para renderizar el contenido.');
  console.error('  Solución: ingresá el tope manualmente desde la solapa Cargas Sociales.');
  console.error(`  Fuente: ${TOPE_IMPONIBLE_URL}`);
  process.exit(1);
}
console.log();

// 2. Extraer todos los períodos con Gemini
console.log('  Extrayendo topes con Gemini...');
const topes = await extraerTodosLosTopeWithAI(pageText);
console.log(`  Gemini encontró ${topes.length} período(s):\n`);

// Mostrar lo que se va a guardar
for (const t of topes) {
  const smvmStr = t.smvm ? ` | SMVM: $${t.smvm.toLocaleString('es-AR')}` : '';
  console.log(
    `    ${t.periodo}  →  Tope: $${t.tope.toLocaleString('es-AR')}${smvmStr}`
  );
}

// 3. Upsert en la DB
console.log('\n  Guardando en payroll_parametros_periodo...');
let guardados = 0;
let errores = 0;

for (const t of topes) {
  try {
    await db
      .insert(payrollParametrosPeriodo)
      .values({
        periodo: t.periodo,
        topeMaximoImponible: String(t.tope),
        salarioMinimo: t.smvm ? String(t.smvm) : null,
        fuente: t.fuente,
        actualizadoPorCron: false, // cargado por script, no por cron automático
      })
      .onConflictDoUpdate({
        target: payrollParametrosPeriodo.periodo,
        set: {
          topeMaximoImponible: String(t.tope),
          salarioMinimo: t.smvm ? String(t.smvm) : null,
          fuente: t.fuente,
          updatedAt: new Date(),
          // No pisamos actualizadoPorCron si ya lo gestionó el cron
        },
      });
    console.log(`    [OK] ${t.periodo} — $${t.tope.toLocaleString('es-AR')}`);
    guardados++;
  } catch (err) {
    console.error(`    [ERR] ${t.periodo} — ${(err as Error).message}`);
    errores++;
  }
}

// 4. Resumen
console.log('\n' + '='.repeat(60));
console.log(`  Guardados: ${guardados} | Errores: ${errores}`);
if (errores === 0) {
  console.log('  Listo. De ahora en adelante el cron del dia 20 lo mantiene actualizado.');
} else {
  console.log('  Revisar los errores arriba y corregir manualmente si es necesario.');
}
console.log('='.repeat(60));

process.exit(errores > 0 ? 1 : 0);
