/**
 * Cierre de la liquidación de sueldos y generación de su asiento (US 3.3.1).
 *
 * Server-only, igual que `accounting-invoice-batch.ts`: toca `db` directamente,
 * así que no puede importarse desde el bundle del cliente. La server function
 * de `src/actions/sueldos.ts` lo invoca; el cálculo puro vive en
 * `accounting-payroll-posting.ts` y los helpers de DB en `accounting-posting-db.ts`.
 *
 * Flujo: recibos confirmados del período → conceptos agregados por código SOS →
 * reglas `modulo='recibo'` → UN asiento `origen_tipo='recibo'` cuyo `origen_id`
 * es la fila de `cierre_sueldos`.
 */
import { db } from '@/lib/db';
import {
  asiento,
  asientoLinea,
  cierreSueldos,
  concepto,
  evento,
  recibo,
  reciboConcepto,
} from '@/drizzle/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  agregarConceptosSueldos,
  armarLineasSueldos,
  type AsientoSueldosArmado,
} from '@/lib/accounting-payroll-posting';
import {
  assertPostableAccounts,
  loadAccountLabels,
  loadActiveMappingRules,
  loadPendingReviewAccountId,
  nextEntryNumber,
  resolvePeriodForDate,
} from '@/lib/accounting-posting-db';
import { normalizarPeriodoYYYYMM } from '@/lib/payroll-period-rules';

export interface ClosePayrollPeriodParams {
  /** Empresa (cliente.id) — el mismo id que usa contabilidad. */
  clientId: string;
  orgId: string;
  /** Período a cerrar, "YYYY-MM". */
  periodo: string;
  userId: string | null;
  /** Calcula y devuelve el asiento sin persistir nada. */
  dryRun?: boolean;
}

export interface ClosePayrollPeriodResult {
  periodo: string;
  recibos: number;
  conceptos: number;
  conceptosSinRegla: number;
  /** null en dry-run. */
  cierreId: string | null;
  journalEntryId: string | null;
  entryNumber: number | null;
  pendingReview: boolean;
  reason: string | null;
  lines: {
    accountId: string;
    /** Código y nombre de la cuenta, para mostrar el asiento sin re-consultar. */
    accountCode: string | null;
    accountName: string | null;
    debit: number;
    credit: number;
    description: string | null;
  }[];
  mappings: AsientoSueldosArmado['mapeos'];
  dryRun: boolean;
}

/** Primer día del mes — cómo guarda el período el modelo ideal. */
function primerDiaPeriodo(periodoNorm: string): string {
  return `${periodoNorm}-01`;
}

/** Último día del mes del período — fecha contable del asiento de devengamiento. */
function fechaAsientoPeriodo(periodoNorm: string): string {
  const [y, m] = periodoNorm.split('-').map((x) => parseInt(x, 10));
  if (!y || !m) throw new Error(`Período inválido: ${periodoNorm}`);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Cierra el período y genera su asiento. Idempotente: si ya existe un cierre
 * vigente (no reabierto) para la empresa+período, lanza en vez de duplicar.
 */
export async function closePayrollPeriod(
  params: ClosePayrollPeriodParams
): Promise<ClosePayrollPeriodResult> {
  const { clientId, orgId, userId } = params;
  const dryRun = params.dryRun ?? false;
  const periodoNorm = normalizarPeriodoYYYYMM(params.periodo);
  const periodoFecha = primerDiaPeriodo(periodoNorm);

  // 1. Idempotencia: un cierre vigente bloquea otro. (Lo respalda el índice
  //    parcial uq_cierre_sueldos_vigente, por si dos requests corren a la vez.)
  const [vigente] = await db
    .select({ id: cierreSueldos.id })
    .from(cierreSueldos)
    .where(
      and(
        eq(cierreSueldos.clienteId, clientId),
        eq(cierreSueldos.periodo, periodoFecha),
        isNull(cierreSueldos.reabiertoAt)
      )
    )
    .limit(1);
  if (vigente && !dryRun)
    throw new Error(
      `La liquidación de ${periodoNorm} ya está cerrada. Reabrila para volver a generarla.`
    );

  // 2. Recibos confirmados del período. `recibo.periodo` es date con el primer
  //    día del mes, así que no hacen falta las variantes de texto del modelo viejo.
  const recibos = await db
    .select({ id: recibo.id })
    .from(recibo)
    .where(
      and(
        eq(recibo.clienteId, clientId),
        eq(recibo.periodo, periodoFecha),
        eq(recibo.confirmado, true)
      )
    );

  if (recibos.length === 0)
    throw new Error(
      `No hay recibos confirmados para ${periodoNorm}. Confirmá los recibos antes de cerrar.`
    );

  // 3. Conceptos de esos recibos, agregados por código SOS. El código sale de
  //    `concepto.numero`; el tipo, del renglón si lo trae y si no del catálogo
  //    (`concepto.tipo` es NOT NULL, así que el fallback por rango casi no juega).
  const valores = await db
    .select({
      numero: concepto.numero,
      tipoLinea: reciboConcepto.tipo,
      tipoCatalogo: concepto.tipo,
      monto: reciboConcepto.monto,
    })
    .from(reciboConcepto)
    .innerJoin(concepto, eq(reciboConcepto.conceptoId, concepto.id))
    .where(
      and(
        inArray(
          reciboConcepto.reciboId,
          recibos.map((r) => r.id)
        ),
        eq(reciboConcepto.activo, true)
      )
    );

  const concepts = agregarConceptosSueldos(
    valores.map((v) => ({
      codigo: String(v.numero),
      tipoLiquidacion: v.tipoLinea ?? v.tipoCatalogo,
      monto: v.monto,
    }))
  );
  if (concepts.length === 0)
    throw new Error(
      `Los recibos de ${periodoNorm} no tienen conceptos con importe.`
    );

  // 4. Reglas + cuenta pendiente de revisión + período contable destino.
  const [prId, rules] = await Promise.all([
    loadPendingReviewAccountId(orgId),
    loadActiveMappingRules(clientId, 'recibo'),
  ]);

  const resolved = await resolvePeriodForDate(
    clientId,
    fechaAsientoPeriodo(periodoNorm)
  ).catch((e: Error) => {
    if (e.message === 'no_fy')
      throw new Error(
        `No hay ejercicio contable que contenga ${periodoNorm}. Creá el ejercicio antes de cerrar.`
      );
    if (e.message === 'no_period')
      throw new Error(`No hay período contable para ${periodoNorm}.`);
    throw e;
  });
  if (resolved.period.estado === 'cerrado')
    throw new Error(
      `El período contable de ${periodoNorm} está cerrado; reabrilo para contabilizar sueldos.`
    );

  // 5. Asiento (puro). Las cuentas de las reglas usadas deben ser imputables.
  const built = armarLineasSueldos(concepts, rules, prId);
  const ruleAccountIds = rules
    .filter((r) => built.reglasUsadasIds.includes(r.id))
    .flatMap((r) => r.lineas.map((l) => l.cuentaId));
  await assertPostableAccounts(clientId, orgId, ruleAccountIds);

  const conceptosSinRegla = built.mapeos.filter((m) => m.sinRegla).length;
  const labels = await loadAccountLabels(
    orgId,
    built.lineas.map((l) => l.cuentaId)
  );
  const linesWithLabels = built.lineas.map((l) => ({
    accountId: l.cuentaId,
    accountCode: labels.get(l.cuentaId)?.code ?? null,
    accountName: labels.get(l.cuentaId)?.name ?? null,
    debit: l.debe,
    credit: l.haber,
    description: l.descripcion,
  }));
  const base: ClosePayrollPeriodResult = {
    periodo: periodoNorm,
    recibos: recibos.length,
    conceptos: concepts.length,
    conceptosSinRegla,
    cierreId: null,
    journalEntryId: null,
    entryNumber: null,
    pendingReview: built.usoPendienteRevision,
    reason: built.motivo,
    lines: linesWithLabels,
    mappings: built.mapeos,
    dryRun,
  };
  if (dryRun) return base;

  // 6. Persistencia atómica: cierre + asiento + líneas + evento.
  return await db.transaction(async (tx) => {
    const number = await nextEntryNumber(tx, clientId, resolved.fy.id);

    const [cierre] = await tx
      .insert(cierreSueldos)
      .values({
        orgId,
        clienteId: clientId,
        periodo: periodoFecha,
        recibos: recibos.length,
        conceptosSinRegla,
        cerradoPor: userId,
      })
      .returning();

    const [je] = await tx
      .insert(asiento)
      .values({
        orgId,
        clienteId: clientId,
        ejercicioId: resolved.fy.id,
        periodoId: resolved.period.id,
        numero: number,
        fecha: fechaAsientoPeriodo(periodoNorm),
        descripcion: `Sueldos y jornales devengados ${periodoNorm}`,
        origenTipo: 'recibo',
        origenId: cierre.id,
        // Un asiento agrupa varias reglas; se guarda la primera como referencia.
        reglaId: built.reglasUsadasIds[0] ?? null,
        fuente: 'calculo',
        creadoPor: userId,
      })
      .returning();

    await tx.insert(asientoLinea).values(
      built.lineas.map((l, i) => ({
        asientoId: je.id,
        cuentaId: l.cuentaId,
        debe: String(l.debe),
        haber: String(l.haber),
        descripcion: l.descripcion,
        orden: i,
      }))
    );

    await tx
      .update(cierreSueldos)
      .set({ asientoId: je.id })
      .where(eq(cierreSueldos.id, cierre.id));

    await tx.insert(evento).values({
      orgId,
      clienteId: clientId,
      entidad: 'cierre_sueldos',
      entidadId: cierre.id,
      tipo: 'alta',
      actorTipo: 'user',
      actorId: userId,
      detalle: {
        asientoId: je.id,
        numero: number,
        periodo: periodoNorm,
        recibos: recibos.length,
        reglaIds: built.reglasUsadasIds,
        pendienteRevision: built.usoPendienteRevision,
        conceptosSinRegla,
        motivo: built.motivo,
      },
    });

    return {
      ...base,
      cierreId: cierre.id,
      journalEntryId: je.id,
      entryNumber: number,
    };
  });
}

/**
 * Reabre la liquidación: marca el cierre como reabierto y anula su asiento.
 * No borra nada — el cierre queda como historial y el asiento como anulado.
 */
export async function reopenPayrollPeriod(params: {
  clientId: string;
  periodo: string;
  userId: string | null;
  reason?: string;
}): Promise<{ cierreId: string; voidedEntryId: string | null }> {
  const periodoNorm = normalizarPeriodoYYYYMM(params.periodo);
  const [cierre] = await db
    .select()
    .from(cierreSueldos)
    .where(
      and(
        eq(cierreSueldos.clienteId, params.clientId),
        eq(cierreSueldos.periodo, primerDiaPeriodo(periodoNorm)),
        isNull(cierreSueldos.reabiertoAt)
      )
    )
    .limit(1);
  if (!cierre)
    throw new Error(`No hay una liquidación cerrada para ${periodoNorm}.`);

  return await db.transaction(async (tx) => {
    if (cierre.asientoId) {
      await tx
        .update(asiento)
        .set({
          anulado: true,
          anuladoAt: new Date(),
          anuladoPor: params.userId,
          motivoAnulacion:
            params.reason ?? `Reapertura de la liquidación de ${periodoNorm}`,
        })
        .where(eq(asiento.id, cierre.asientoId));
    }
    await tx
      .update(cierreSueldos)
      .set({ reabiertoAt: new Date(), reabiertoPor: params.userId })
      .where(eq(cierreSueldos.id, cierre.id));

    return { cierreId: cierre.id, voidedEntryId: cierre.asientoId };
  });
}
