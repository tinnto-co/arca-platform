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
  clienteCuenta,
  comprobante,
  comprobanteTipo,
  contraparte,
  cuenta,
  ejercicio,
  evento,
  organizationModule,
  periodoContable,
  reglaMapeo,
  reglaMapeoLinea,
} from '@/drizzle/schema';
import { and, asc, eq, inArray, gte, lte, sql } from 'drizzle-orm';
import {
  armarLineas,
  calcularImportes,
  seleccionarRegla,
  type ReglaLike,
} from '@/lib/accounting-invoice-posting';
import { PENDING_REVIEW_CODE } from '@/lib/accounting-labels';

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

async function loadPendingReviewAccountId(orgId: string): Promise<string> {
  const [acc] = await db
    .select({ id: cuenta.id })
    .from(cuenta)
    .where(
      and(
        eq(cuenta.orgId, orgId),
        eq(cuenta.alcance, 'base'),
        eq(cuenta.codigo, PENDING_REVIEW_CODE)
      )
    )
    .limit(1);
  if (!acc)
    throw new Error('Falta la cuenta de sistema "Pendiente de revisión"');
  return acc.id;
}

async function loadActiveInvoiceRules(clienteId: string): Promise<ReglaLike[]> {
  const reglas = await db
    .select()
    .from(reglaMapeo)
    .where(
      and(
        eq(reglaMapeo.clienteId, clienteId),
        eq(reglaMapeo.modulo, 'comprobante'),
        eq(reglaMapeo.activa, true)
      )
    )
    .orderBy(asc(reglaMapeo.prioridad), asc(reglaMapeo.nombre));
  if (reglas.length === 0) return [];

  const lineas = await db
    .select()
    .from(reglaMapeoLinea)
    .where(
      inArray(
        reglaMapeoLinea.reglaId,
        reglas.map((r) => r.id)
      )
    )
    .orderBy(asc(reglaMapeoLinea.orden));
  const porRegla = new Map<string, typeof lineas>();
  for (const l of lineas) {
    const arr = porRegla.get(l.reglaId) ?? [];
    arr.push(l);
    porRegla.set(l.reglaId, arr);
  }

  return reglas.map(
    (r): ReglaLike => ({
      id: r.id,
      nombre: r.nombre,
      tipo: r.tipo,
      condicion: (r.condicion ?? null) as Record<string, unknown> | null,
      prioridad: r.prioridad,
      lineas: (porRegla.get(r.id) ?? []).map((l) => ({
        cuentaId: l.cuentaId,
        lado: l.lado,
        base: l.base,
        importeFijo: l.importeFijo,
        descripcion: l.descripcion,
      })),
    })
  );
}

/** `fecha` es un 'YYYY-MM-DD': las columnas de fecha de la BD son strings. */
async function resolvePeriodForDate(clienteId: string, fecha: string) {
  const [ej] = await db
    .select()
    .from(ejercicio)
    .where(
      and(
        eq(ejercicio.clienteId, clienteId),
        lte(ejercicio.fechaDesde, fecha),
        gte(ejercicio.fechaHasta, fecha)
      )
    )
    .limit(1);
  if (!ej) throw new Error('no_ejercicio');
  const [periodo] = await db
    .select()
    .from(periodoContable)
    .where(
      and(
        eq(periodoContable.ejercicioId, ej.id),
        eq(periodoContable.periodo, `${fecha.slice(0, 7)}-01`)
      )
    )
    .limit(1);
  if (!periodo) throw new Error('no_periodo');
  return { ejercicio: ej, periodo };
}

async function assertPostableAccounts(
  clienteId: string,
  orgId: string,
  cuentaIds: string[]
) {
  const ids = [...new Set(cuentaIds)];
  const cuentas = await db
    .select()
    .from(cuenta)
    .where(and(eq(cuenta.orgId, orgId), inArray(cuenta.id, ids)));
  const propias = await db
    .select()
    .from(clienteCuenta)
    .where(
      and(
        eq(clienteCuenta.clienteId, clienteId),
        inArray(clienteCuenta.cuentaId, ids)
      )
    );
  const propiaPorCuenta = new Map(propias.map((o) => [o.cuentaId, o]));
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  for (const id of ids) {
    const c = porId.get(id);
    if (!c) throw new Error('Cuenta inexistente o de otro estudio');
    if (c.alcance === 'propia' && c.clienteId !== clienteId)
      throw new Error('Cuenta propia de otra empresa');
    if (c.tipo !== 'imputable')
      throw new Error(`La cuenta ${c.codigo} es de agrupación`);
    const activa = propiaPorCuenta.get(id)?.activa ?? c.activa;
    if (!activa) throw new Error(`La cuenta ${c.codigo} está inactiva`);
  }
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
    const [{ maxNum }] = await tx
      .select({ maxNum: sql<number>`coalesce(max(${asiento.numero}),0)::int` })
      .from(asiento)
      .where(
        and(
          eq(asiento.clienteId, clienteId),
          eq(asiento.ejercicioId, ejercicioId)
        )
      );
    const numero = (maxNum ?? 0) + 1;
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
    errors: [] as { clienteId: string; comprobanteId: string; reason: string }[],
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
      reglas = await loadActiveInvoiceRules(clienteId);
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
        if (resuelto.periodo.estado === 'cerrado') {
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
            ejercicioId: resuelto.ejercicio.id,
            periodoId: resuelto.periodo.id,
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
