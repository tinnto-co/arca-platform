/**
 * Job batch (server-only) que contabiliza comprobantes sin asiento. (UST4)
 *
 * Vive fuera de `src/actions/accounting.tsx` a propósito: ese módulo es parte del
 * bundle del cliente (importa server functions), y una función exportada que use
 * `db` ahí arrastraría el driver de Postgres al browser. Acá es server-only (lo
 * importan solo el cron y el script), así que puede tocar la DB libremente.
 *
 * La lógica de cálculo (importes, selección de regla, líneas del asiento) se reusa
 * del motor puro `accounting-invoice-posting.ts`; el plumbing de DB (cargar reglas,
 * resolver período, validar cuentas, insertar) replica el de generateInvoiceEntries.
 */
import { db } from '@/lib/db';
import {
  asiento,
  asientoLinea,
  cliente,
  comprobante,
  comprobanteTipo,
  contraparte,
  evento,
  organizationModule,
} from '@/drizzle/schema';
import { and, eq, sql } from 'drizzle-orm';
import {
  armarLineas,
  calcularImportes,
  seleccionarRegla,
  type ReglaLike,
} from '@/lib/accounting-invoice-posting';
import {
  assertPostableAccounts,
  loadActiveMappingRules,
  loadPendingReviewAccountId,
  nextEntryNumber,
  resolvePeriodForDate,
} from '@/lib/accounting-posting-db';

export interface InvoiceBatchResult {
  startedAt: string;
  finishedAt: string;
  batchSize: number;
  dryRun: boolean;
  clientesConPendientes: number;
  comprobantesRevisados: number;
  created: number;
  pendingReview: number;
  skipped: number;
  errors: { clienteId: string; comprobanteId: string; reason: string }[];
}

const COMPROBANTE_SELECT = {
  id: comprobante.id,
  fechaEmision: comprobante.fechaEmision,
  direccion: comprobante.direccion,
  tipo: comprobante.tipo,
  letra: comprobanteTipo.letra,
  contraparteNombre: contraparte.nombre,
  total: comprobante.total,
  ivaTotal: comprobante.ivaTotal,
  otrosTributos: comprobante.otrosTributos,
} as const;

interface ComprobanteRow {
  id: string;
  fechaEmision: string;
  direccion: 'emitido' | 'recibido';
  tipo: number;
  letra: string | null;
  contraparteNombre: string | null;
  total: string;
  ivaTotal: string;
  otrosTributos: string;
}

async function hasAutoEntry(clienteId: string, comprobanteId: string) {
  const [row] = await db
    .select({ id: asiento.id })
    .from(asiento)
    .where(
      and(
        eq(asiento.clienteId, clienteId),
        eq(asiento.origenTipo, 'comprobante'),
        eq(asiento.origenId, comprobanteId),
        eq(asiento.anulado, false)
      )
    )
    .limit(1);
  return !!row;
}

async function insertAutoInvoiceEntry(params: {
  orgId: string;
  clienteId: string;
  ejercicioId: string;
  periodoId: string;
  comp: ComprobanteRow;
  reglaId: string | null;
  lineas: {
    cuentaId: string;
    debe: number;
    haber: number;
    descripcion: string | null;
  }[];
  usoPendienteRevision: boolean;
  motivo: string | null;
}) {
  const {
    orgId,
    clienteId,
    ejercicioId,
    periodoId,
    comp,
    reglaId,
    lineas,
    usoPendienteRevision,
    motivo,
  } = params;
  await db.transaction(async (tx) => {
    const numero = await nextEntryNumber(
      tx,
      params.clienteId,
      params.ejercicioId
    );
    const etiqueta = comp.direccion === 'recibido' ? 'Compra' : 'Venta';
    const descripcion =
      `${etiqueta} ${comp.letra ?? comp.tipo} — ${comp.contraparteNombre ?? 's/d'}`.trim();

    const [asi] = await tx
      .insert(asiento)
      .values({
        orgId,
        clienteId,
        ejercicioId,
        periodoId,
        numero,
        fecha: comp.fechaEmision,
        descripcion,
        origenTipo: 'comprobante',
        origenId: comp.id,
        reglaId,
        fuente: 'import',
        creadoPor: null,
      })
      .returning();

    await tx.insert(asientoLinea).values(
      lineas.map((l, i) => ({
        asientoId: asi.id,
        cuentaId: l.cuentaId,
        debe: String(l.debe),
        haber: String(l.haber),
        descripcion: l.descripcion,
        orden: i,
      }))
    );

    await tx.insert(evento).values({
      orgId,
      clienteId,
      entidad: 'asiento',
      entidadId: asi.id,
      tipo: 'alta',
      actorTipo: 'job',
      detalle: {
        numero,
        ejercicioId,
        origen: 'comprobante',
        comprobanteId: comp.id,
        reglaId,
        pendienteRevision: usoPendienteRevision,
        motivo,
        batch: true,
      },
    });
  });
}

export async function runPendingInvoiceBatch(opts?: {
  batchSize?: number;
  dryRun?: boolean;
  clienteId?: string;
}): Promise<InvoiceBatchResult> {
  const batchSize = Math.max(1, Math.min(opts?.batchSize ?? 50, 500));
  const dryRun = opts?.dryRun ?? false;
  const soloClienteId = opts?.clienteId ?? null;
  const startedAt = new Date();
  const result = {
    clientesConPendientes: 0,
    comprobantesRevisados: 0,
    created: 0,
    pendingReview: 0,
    skipped: 0,
    errors: [] as {
      clienteId: string;
      comprobanteId: string;
      reason: string;
    }[],
  };

  // Empresas de organizaciones con el módulo de contabilidad activo.
  const clientes = await db
    .select({ clienteId: cliente.id, orgId: cliente.orgId })
    .from(cliente)
    .innerJoin(
      organizationModule,
      and(
        eq(organizationModule.orgId, cliente.orgId),
        eq(organizationModule.module, 'contabilidad'),
        eq(organizationModule.enabled, true)
      )
    )
    .where(soloClienteId ? eq(cliente.id, soloClienteId) : undefined);

  for (const { clienteId, orgId } of clientes) {
    const pendientes = await db
      .select(COMPROBANTE_SELECT)
      .from(comprobante)
      .innerJoin(comprobanteTipo, eq(comprobante.tipo, comprobanteTipo.codigo))
      .innerJoin(contraparte, eq(comprobante.contraparteId, contraparte.id))
      .where(
        and(
          eq(comprobante.clienteId, clienteId),
          sql`NOT EXISTS (
            SELECT 1 FROM ${asiento} a
            WHERE a.cliente_id = ${comprobante.clienteId}
              AND a.origen_tipo = 'comprobante'
              AND a.origen_id = ${comprobante.id}
              AND a.anulado = false
          )`
        )
      )
      .limit(batchSize);

    if (pendientes.length === 0) continue;
    result.clientesConPendientes++;

    let cuentaPendienteId: string;
    let reglas: ReglaLike[];
    try {
      cuentaPendienteId = await loadPendingReviewAccountId(orgId);
      reglas = await loadActiveMappingRules(clienteId, 'comprobante');
    } catch (e) {
      result.errors.push({
        clienteId,
        comprobanteId: '*',
        reason: `Setup falló: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    for (const comp of pendientes) {
      result.comprobantesRevisados++;
      try {
        if (await hasAutoEntry(clienteId, comp.id)) {
          result.skipped++;
          continue;
        }
        const importes = calcularImportes(comp);
        if (importes.total <= 0) {
          result.skipped++;
          continue;
        }
        let resuelto;
        try {
          resuelto = await resolvePeriodForDate(clienteId, comp.fechaEmision);
        } catch {
          result.skipped++; // sin ejercicio/período para esa fecha
          continue;
        }
        if (resuelto.period.estado === 'cerrado') {
          result.skipped++;
          continue;
        }
        const regla = seleccionarRegla(reglas, comp);
        if (regla && regla.lineas.length > 0) {
          await assertPostableAccounts(
            clienteId,
            orgId,
            regla.lineas.map((l) => l.cuentaId)
          );
        }
        const armado = armarLineas(regla, importes, cuentaPendienteId);
        if (!dryRun) {
          await insertAutoInvoiceEntry({
            orgId,
            clienteId,
            ejercicioId: resuelto.fy.id,
            periodoId: resuelto.period.id,
            comp,
            reglaId: regla?.id ?? null,
            lineas: armado.lineas,
            usoPendienteRevision: armado.usoPendienteRevision,
            motivo: armado.motivo,
          });
        }
        result.created++;
        if (armado.usoPendienteRevision) result.pendingReview++;
      } catch (e) {
        result.errors.push({
          clienteId,
          comprobanteId: comp.id,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const finishedAt = new Date();
  const summary: InvoiceBatchResult = {
    ...result,
    batchSize,
    dryRun,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
  console.log(
    `[accounting-batch]${dryRun ? ' (DRY-RUN)' : ''} ${summary.created} asientos creados ` +
      `(${summary.pendingReview} pend. de revisión), ${summary.skipped} omitidos, ` +
      `${summary.errors.length} errores · ${summary.clientesConPendientes} empresas, ` +
      `${summary.comprobantesRevisados} comprobantes (tope ${batchSize}/empresa) · ` +
      `${startedAt.toISOString()} → ${finishedAt.toISOString()}`
  );
  if (summary.errors.length > 0) {
    console.warn(
      '[accounting-batch] errores:',
      JSON.stringify(summary.errors.slice(0, 20))
    );
  }
  return summary;
}
