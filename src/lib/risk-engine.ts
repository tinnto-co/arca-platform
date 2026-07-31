/**
 * Motor de riesgo: puntúa a cada cliente de 0 a 100 en un período.
 *
 * Todo se mide sobre el `cliente` (la empresa), no sobre el login de AFIP. La
 * única excepción son los errores de scraping, que son un problema de la
 * credencial: se cuentan las alertas abiertas de los logins que administran a
 * ese cliente.
 */
import { db } from '@/lib/db';
import {
  cliente,
  clienteCredencial,
  alerta,
  deuda,
  notificacion,
  vencimiento,
  comprobante,
  ivaDeclaracion,
  riesgoSnapshot,
  riesgoNivel,
} from '@/drizzle/schema';
import { eq, and, lt, isNull, gte, lte, inArray, sql } from 'drizzle-orm';

export interface RiskFactors {
  deudasVencidas: number;
  deudasVencidasScore: number;
  notificacionesUrgentes: number;
  notificacionesUrgentesScore: number;
  vencimientosProximos: number;
  vencimientosProximosScore: number;
  mesesSinComprobantes: number;
  mesesSinComprobantesScore: number;
  ivaEstado: 'ok' | 'incompleta' | 'sin_declarar';
  ivaScore: number;
  tieneErrorScraping: boolean;
  errorScrapingScore: number;
}

export interface RiskScoreResult {
  score: number;
  nivel: (typeof riesgoNivel.enumValues)[number];
  factores: RiskFactors;
}

/** `YYYY-MM-DD` en hora local: las columnas `date` de la BD son strings. */
function aFecha(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Puntaje de riesgo (0–100) de un cliente en un período ("YYYY-MM").
 *
 * Pesos:
 *  deudas vencidas          30%
 *  notificaciones urgentes  20%
 *  vencimientos próximos    15%
 *  meses sin comprobantes   15%
 *  estado del IVA           10%
 *  errores de scraping      10%
 *
 * Niveles: bajo < 25, medio 25–50, alto 50–75, crítico > 75
 */
export async function calculateRiskScore(
  clienteId: string,
  periodo: string
): Promise<RiskScoreResult> {
  const [row] = await db
    .select({ id: cliente.id })
    .from(cliente)
    .where(eq(cliente.id, clienteId))
    .limit(1);
  if (!row) throw new Error(`Cliente ${clienteId} no encontrado`);

  const now = new Date();
  const hoy = aFecha(now);
  const en30Dias = aFecha(new Date(now.getTime() + 30 * 86400000));

  const [anio, mes] = periodo.split('-').map(Number);
  const inicioPeriodo = new Date(anio, mes - 1, 1);

  // Los errores de scraping son de la credencial, no de la empresa.
  const credenciales = await db
    .select({ id: clienteCredencial.credencialId })
    .from(clienteCredencial)
    .where(eq(clienteCredencial.clienteId, clienteId));
  const credencialIds = credenciales.map((c) => c.id);

  const [
    deudasVencidas,
    notificacionesUrgentes,
    vencimientosProximos,
    tieneErrorScraping,
    declaracion,
  ] = await Promise.all([
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(deuda)
      .where(
        and(
          eq(deuda.clienteId, clienteId),
          eq(deuda.estado, 'abierta'),
          lt(deuda.venceAt, hoy)
        )
      )
      .then((r) => Number(r[0]?.n ?? 0)),

    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(notificacion)
      .where(
        and(
          eq(notificacion.clienteId, clienteId),
          eq(notificacion.severidad, 'urgente'),
          isNull(notificacion.resueltaAt)
        )
      )
      .then((r) => Number(r[0]?.n ?? 0)),

    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(vencimiento)
      .where(
        and(
          eq(vencimiento.clienteId, clienteId),
          isNull(vencimiento.completadoAt),
          gte(vencimiento.venceAt, hoy),
          lte(vencimiento.venceAt, en30Dias)
        )
      )
      .then((r) => Number(r[0]?.n ?? 0)),

    credencialIds.length === 0
      ? Promise.resolve(false)
      : db
          .select({ n: sql<number>`COUNT(*)` })
          .from(alerta)
          .where(
            and(
              inArray(alerta.credencialId, credencialIds),
              eq(alerta.tipo, 'error_scraping'),
              eq(alerta.estado, 'abierta')
            )
          )
          .then((r) => Number(r[0]?.n ?? 0) > 0),

    db
      .select({ debitoFiscal: ivaDeclaracion.debitoFiscal })
      .from(ivaDeclaracion)
      .where(
        and(
          eq(ivaDeclaracion.clienteId, clienteId),
          eq(ivaDeclaracion.periodo, `${periodo}-01`)
        )
      )
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const mesesSinComprobantes = await contarMesesSinComprobantes(
    clienteId,
    inicioPeriodo
  );

  // Deudas vencidas: 0→0, 1→15, 2→20, ≥3→30
  let deudasVencidasScore = 0;
  if (deudasVencidas >= 3) deudasVencidasScore = 30;
  else if (deudasVencidas === 2) deudasVencidasScore = 20;
  else if (deudasVencidas === 1) deudasVencidasScore = 15;

  // Notificaciones urgentes: 0→0, 1→10, 2→15, ≥3→20
  let notificacionesUrgentesScore = 0;
  if (notificacionesUrgentes >= 3) notificacionesUrgentesScore = 20;
  else if (notificacionesUrgentes === 2) notificacionesUrgentesScore = 15;
  else if (notificacionesUrgentes === 1) notificacionesUrgentesScore = 10;

  // Vencimientos próximos: 0→0, 1-2→5, 3-5→10, ≥6→15
  let vencimientosProximosScore = 0;
  if (vencimientosProximos >= 6) vencimientosProximosScore = 15;
  else if (vencimientosProximos >= 3) vencimientosProximosScore = 10;
  else if (vencimientosProximos >= 1) vencimientosProximosScore = 5;

  // Meses sin comprobantes: 0→0, 1→5, 2→10, 3→15
  let mesesSinComprobantesScore = 0;
  if (mesesSinComprobantes >= 3) mesesSinComprobantesScore = 15;
  else if (mesesSinComprobantes === 2) mesesSinComprobantesScore = 10;
  else if (mesesSinComprobantes === 1) mesesSinComprobantesScore = 5;

  // IVA: sin declarar→10, declarada pero sin débito scrapeado→5, completa→0.
  // `iva_declaracion` no tiene bandera de éxito: el débito nulo es el síntoma
  // de que el F2051 se scrapeó a medias.
  let ivaEstado: RiskFactors['ivaEstado'] = 'sin_declarar';
  let ivaScore = 10;
  if (declaracion !== null) {
    if (declaracion.debitoFiscal !== null) {
      ivaEstado = 'ok';
      ivaScore = 0;
    } else {
      ivaEstado = 'incompleta';
      ivaScore = 5;
    }
  }

  const errorScrapingScore = tieneErrorScraping ? 10 : 0;

  const score = Math.min(
    100,
    deudasVencidasScore +
      notificacionesUrgentesScore +
      vencimientosProximosScore +
      mesesSinComprobantesScore +
      ivaScore +
      errorScrapingScore
  );

  let nivel: RiskScoreResult['nivel'];
  if (score > 75) nivel = 'critico';
  else if (score > 50) nivel = 'alto';
  else if (score >= 25) nivel = 'medio';
  else nivel = 'bajo';

  return {
    score,
    nivel,
    factores: {
      deudasVencidas,
      deudasVencidasScore,
      notificacionesUrgentes,
      notificacionesUrgentesScore,
      vencimientosProximos,
      vencimientosProximosScore,
      mesesSinComprobantes,
      mesesSinComprobantesScore,
      ivaEstado,
      ivaScore,
      tieneErrorScraping,
      errorScrapingScore,
    },
  };
}

/** Cuántos de los 3 meses previos al período no tuvieron ningún comprobante. */
async function contarMesesSinComprobantes(
  clienteId: string,
  inicioPeriodo: Date
): Promise<number> {
  let sinMovimiento = 0;
  for (let i = 1; i <= 3; i++) {
    const desde = new Date(
      inicioPeriodo.getFullYear(),
      inicioPeriodo.getMonth() - i,
      1
    );
    const hasta = new Date(
      inicioPeriodo.getFullYear(),
      inicioPeriodo.getMonth() - i + 1,
      1
    );
    const n = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(comprobante)
      .where(
        and(
          eq(comprobante.clienteId, clienteId),
          gte(comprobante.fechaEmision, aFecha(desde)),
          lt(comprobante.fechaEmision, aFecha(hasta))
        )
      )
      .then((r) => Number(r[0]?.n ?? 0));
    if (n === 0) sinMovimiento++;
  }
  return sinMovimiento;
}

/**
 * Genera (o actualiza) los snapshots de riesgo de todos los clientes de una
 * organización. El upsert sobre (cliente_id, periodo) hace que re-correrlo sea
 * seguro.
 */
export async function generateRiskSnapshots(
  orgId: string,
  periodo: string
): Promise<{ processed: number; errors: number }> {
  const clientes = await db
    .select({ id: cliente.id })
    .from(cliente)
    .where(and(eq(cliente.orgId, orgId), eq(cliente.estado, 'activo')));

  let processed = 0;
  let errors = 0;

  for (const c of clientes) {
    try {
      const result = await calculateRiskScore(c.id, periodo);

      await db
        .insert(riesgoSnapshot)
        .values({
          clienteId: c.id,
          periodo: `${periodo}-01`,
          score: String(result.score),
          nivel: result.nivel,
          factores: result.factores,
        })
        .onConflictDoUpdate({
          target: [riesgoSnapshot.clienteId, riesgoSnapshot.periodo],
          set: {
            score: String(result.score),
            nivel: result.nivel,
            factores: result.factores,
          },
        });

      processed++;
    } catch {
      errors++;
    }
  }

  return { processed, errors };
}
