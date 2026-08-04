/**
 * Dashboard del estudio.
 *
 * Todo se acota por `org_id`, que ahora viaja en las propias tablas de hechos:
 * ya no hace falta juntar la lista de logins de AFIP de la organización para
 * después filtrar por ella. Las deudas y los vencimientos siguen colgando de la
 * credencial (AFIP los publica por CUIT de login), así que su `cliente_id`
 * puede venir vacío y el nombre se resuelve con un left join.
 */
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  cliente,
  credencialAfip,
  comprobante,
  deuda,
  vencimiento,
  notificacion,
  alerta,
  job,
} from '@/drizzle/schema';
import { eq, and, gte, lte, sql, isNull, desc } from 'drizzle-orm';
import { getSessionWithOrg } from '@/actions/helpers';

// ── Helpers ────────────────────────────────────────────────────────────────

function parseDateParam(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

/**
 * `YYYY-MM-DD` en hora local. Las columnas `date` de la BD son strings y los
 * rangos se arman con fechas locales: pasar por UTC correría un día.
 */
function aFecha(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** El total en pesos: los comprobantes en moneda extranjera traen su cotización. */
const totalEnPesos = sql<number>`(${comprobante.total} * ${comprobante.cotizacion})`;

const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

// ── getDashboardStats ──────────────────────────────────────────────────────

export const getDashboardStats = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const now = new Date();

    // Período actual
    const desde = parseDateParam(
      ctx.data.from,
      new Date(now.getFullYear(), now.getMonth(), 1)
    );
    const hasta = parseDateParam(
      ctx.data.to,
      new Date(now.getFullYear(), now.getMonth() + 1, 0)
    );

    // Período anterior: misma duración, terminando justo antes del actual.
    const rangoMs = hasta.getTime() - desde.getTime();
    const anteriorHasta = new Date(desde.getTime() - 86400000);
    const anteriorDesde = new Date(anteriorHasta.getTime() - rangoMs);

    const ventas = sql<number>`COALESCE(SUM(CASE WHEN ${comprobante.direccion} = 'emitido' THEN ${totalEnPesos} ELSE 0 END), 0)`;
    const compras = sql<number>`COALESCE(SUM(CASE WHEN ${comprobante.direccion} = 'recibido' THEN ${totalEnPesos} ELSE 0 END), 0)`;

    const [actual, anterior, total, clientes] = await Promise.all([
      db
        .select({
          ventas,
          compras,
          comprobantes: sql<number>`COUNT(*)`,
        })
        .from(comprobante)
        .where(
          and(
            eq(comprobante.orgId, orgId),
            gte(comprobante.fechaEmision, aFecha(desde)),
            lte(comprobante.fechaEmision, aFecha(hasta))
          )
        ),

      db
        .select({ ventas, compras })
        .from(comprobante)
        .where(
          and(
            eq(comprobante.orgId, orgId),
            gte(comprobante.fechaEmision, aFecha(anteriorDesde)),
            lte(comprobante.fechaEmision, aFecha(anteriorHasta))
          )
        ),

      db
        .select({
          ventas,
          compras,
          comprobantes: sql<number>`COUNT(*)`,
        })
        .from(comprobante)
        .where(eq(comprobante.orgId, orgId)),

      db
        .select({ count: sql<number>`count(*)` })
        .from(cliente)
        .where(and(eq(cliente.orgId, orgId), eq(cliente.estado, 'activo'))),
    ]);

    return {
      totalClientes: Number(clientes[0]?.count ?? 0),
      totalVentas: Number(total[0]?.ventas ?? 0),
      totalCompras: Number(total[0]?.compras ?? 0),
      totalComprobantes: Number(total[0]?.comprobantes ?? 0),
      ventasDelPeriodo: Number(actual[0]?.ventas ?? 0),
      comprasDelPeriodo: Number(actual[0]?.compras ?? 0),
      comprobantesDelPeriodo: Number(actual[0]?.comprobantes ?? 0),
      ventasPeriodoAnterior: Number(anterior[0]?.ventas ?? 0),
      comprasPeriodoAnterior: Number(anterior[0]?.compras ?? 0),
    };
  });

// ── getMonthlyEvolution ────────────────────────────────────────────────────

export const getMonthlyEvolution = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      months: z.number().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const now = new Date();
    const cantidadMeses = ctx.data.months ?? 6;

    const hasta = parseDateParam(
      ctx.data.to,
      new Date(now.getFullYear(), now.getMonth() + 1, 0)
    );
    const desde = parseDateParam(
      ctx.data.from,
      new Date(hasta.getFullYear(), hasta.getMonth() - (cantidadMeses - 1), 1)
    );

    // La agrupación la hace la BD: `periodo` es el mes de la fecha de emisión.
    const filas = await db
      .select({
        periodo: comprobante.periodo,
        emitido: sql<number>`COALESCE(SUM(CASE WHEN ${comprobante.direccion} = 'emitido' THEN ${totalEnPesos} ELSE 0 END), 0)`,
        recibido: sql<number>`COALESCE(SUM(CASE WHEN ${comprobante.direccion} = 'recibido' THEN ${totalEnPesos} ELSE 0 END), 0)`,
      })
      .from(comprobante)
      .where(
        and(
          eq(comprobante.orgId, orgId),
          gte(comprobante.fechaEmision, aFecha(desde)),
          lte(comprobante.fechaEmision, aFecha(hasta))
        )
      )
      .groupBy(comprobante.periodo);

    const porPeriodo = new Map(filas.map((f) => [f.periodo?.slice(0, 7), f]));

    // Se devuelven todos los meses del rango, incluso los que no tuvieron nada.
    const buckets: { mes: string; emitido: number; recibido: number }[] = [];
    const cursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
    const fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
    while (cursor <= fin) {
      const clave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const fila = porPeriodo.get(clave);
      buckets.push({
        mes: `${MESES[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`,
        emitido: Number(fila?.emitido ?? 0),
        recibido: Number(fila?.recibido ?? 0),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return buckets;
  });

// ── getUpcomingDueDates ────────────────────────────────────────────────────

export const getUpcomingDueDates = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      days: z.number().default(7),
      limit: z.number().default(5),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const hoy = new Date();
    const futuro = new Date(hoy);
    futuro.setDate(hoy.getDate() + ctx.data.days);

    return await db
      .select({
        id: vencimiento.id,
        impuesto: vencimiento.impuesto,
        concepto: vencimiento.concepto,
        venceAt: vencimiento.venceAt,
        clienteId: vencimiento.clienteId,
        clienteNombre: cliente.razonSocial,
      })
      .from(vencimiento)
      .leftJoin(cliente, eq(vencimiento.clienteId, cliente.id))
      .where(
        and(
          eq(vencimiento.orgId, orgId),
          gte(vencimiento.venceAt, aFecha(hoy)),
          lte(vencimiento.venceAt, aFecha(futuro))
        )
      )
      .orderBy(vencimiento.venceAt)
      .limit(ctx.data.limit);
  });

// ── getOverdueDebts ────────────────────────────────────────────────────────

export const getOverdueDebts = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      limit: z.number().default(5),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    return await db
      .select({
        id: deuda.id,
        impuesto: deuda.impuesto,
        concepto: deuda.concepto,
        venceAt: deuda.venceAt,
        saldo: deuda.saldo,
        clienteId: deuda.clienteId,
        clienteNombre: cliente.razonSocial,
      })
      .from(deuda)
      .leftJoin(cliente, eq(deuda.clienteId, cliente.id))
      .where(and(eq(deuda.orgId, orgId), lte(deuda.venceAt, aFecha(new Date()))))
      .orderBy(deuda.venceAt)
      .limit(ctx.data.limit);
  });

// ── getRecentInvoices ──────────────────────────────────────────────────────

export const getRecentInvoices = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      limit: z.number().default(5),
      from: z.string().optional(),
      to: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const condiciones = [eq(comprobante.orgId, orgId)];
    if (ctx.data.from) {
      condiciones.push(
        gte(comprobante.fechaEmision, aFecha(new Date(ctx.data.from)))
      );
    }
    if (ctx.data.to) {
      condiciones.push(
        lte(comprobante.fechaEmision, aFecha(new Date(ctx.data.to)))
      );
    }

    return await db
      .select({
        id: comprobante.id,
        tipo: comprobante.tipo,
        direccion: comprobante.direccion,
        total: comprobante.total,
        moneda: comprobante.moneda,
        fechaEmision: comprobante.fechaEmision,
        clienteId: comprobante.clienteId,
        clienteNombre: cliente.razonSocial,
      })
      .from(comprobante)
      .innerJoin(cliente, eq(comprobante.clienteId, cliente.id))
      .where(and(...condiciones))
      .orderBy(desc(comprobante.createdAt))
      .limit(ctx.data.limit);
  });

// ── getTopClientes ─────────────────────────────────────────────────────────

export const getTopClientes = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      limit: z.number().default(5),
      from: z.string().optional(),
      to: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const now = new Date();
    const desde = parseDateParam(
      ctx.data.from,
      new Date(now.getFullYear(), now.getMonth(), 1)
    );
    const hasta = parseDateParam(
      ctx.data.to,
      new Date(now.getFullYear(), now.getMonth() + 1, 0)
    );

    const facturado = await db
      .select({
        clienteId: comprobante.clienteId,
        nombre: cliente.razonSocial,
        cuit: cliente.cuit,
        total: sql<string>`SUM(${totalEnPesos})`,
        comprobantes: sql<number>`COUNT(*)::int`,
        ultimaActividad: sql<string>`MAX(${comprobante.createdAt})`,
      })
      .from(comprobante)
      .innerJoin(cliente, eq(comprobante.clienteId, cliente.id))
      .where(
        and(
          eq(comprobante.orgId, orgId),
          gte(comprobante.fechaEmision, aFecha(desde)),
          lte(comprobante.fechaEmision, aFecha(hasta))
        )
      )
      .groupBy(comprobante.clienteId, cliente.razonSocial, cliente.cuit)
      .orderBy(desc(sql`SUM(${totalEnPesos})`))
      .limit(ctx.data.limit);

    const vencidas = await db
      .select({
        clienteId: deuda.clienteId,
        cantidad: sql<number>`COUNT(*)::int`,
        diasMaximos: sql<number>`MAX(NOW()::date - ${deuda.venceAt})`,
      })
      .from(deuda)
      .where(
        and(
          eq(deuda.orgId, orgId),
          eq(deuda.estado, 'abierta'),
          lte(deuda.venceAt, aFecha(new Date()))
        )
      )
      .groupBy(deuda.clienteId);

    const porCliente = new Map(vencidas.map((d) => [d.clienteId, d]));

    return facturado.map((f) => {
      const atraso = porCliente.get(f.clienteId);
      let estado: 'ok' | 'pend' | 'late' = 'ok';
      let estadoLabel = 'Al día';
      if (atraso && atraso.cantidad > 0) {
        if (Number(atraso.diasMaximos) > 7) {
          estado = 'late';
          estadoLabel = `Vencido +${Math.round(Number(atraso.diasMaximos))}d`;
        } else {
          estado = 'pend';
          estadoLabel = 'Pendiente';
        }
      }

      return {
        clienteId: f.clienteId,
        nombre: f.nombre,
        cuit: f.cuit,
        total: Number(f.total ?? 0),
        comprobantes: f.comprobantes,
        ultimaActividad: f.ultimaActividad,
        estado,
        estadoLabel,
      };
    });
  });

// ── getPendingNotificationsCount ───────────────────────────────────────────

export const getPendingNotificationsCount = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notificacion)
    .where(
      and(eq(notificacion.orgId, orgId), eq(notificacion.leida, false))
    );

  return { count: Number(result?.count ?? 0) };
});

// ── getCalendarDueDates ──────────────────────────────────────────────────

export const getCalendarDueDates = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      from: z.string(),
      to: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const desde = aFecha(new Date(ctx.data.from));
    const hasta = aFecha(new Date(ctx.data.to));

    const [vencimientos, deudas] = await Promise.all([
      db
        .select({
          id: vencimiento.id,
          impuesto: vencimiento.impuesto,
          concepto: vencimiento.concepto,
          venceAt: vencimiento.venceAt,
          clienteId: vencimiento.clienteId,
          clienteNombre: cliente.razonSocial,
          completadoAt: vencimiento.completadoAt,
        })
        .from(vencimiento)
        .leftJoin(cliente, eq(vencimiento.clienteId, cliente.id))
        .where(
          and(
            eq(vencimiento.orgId, orgId),
            gte(vencimiento.venceAt, desde),
            lte(vencimiento.venceAt, hasta)
          )
        )
        .orderBy(vencimiento.venceAt),
      db
        .select({
          id: deuda.id,
          impuesto: deuda.impuesto,
          concepto: deuda.concepto,
          venceAt: deuda.venceAt,
          saldo: deuda.saldo,
          clienteId: deuda.clienteId,
          clienteNombre: cliente.razonSocial,
        })
        .from(deuda)
        .leftJoin(cliente, eq(deuda.clienteId, cliente.id))
        .where(
          and(
            eq(deuda.orgId, orgId),
            gte(deuda.venceAt, desde),
            lte(deuda.venceAt, hasta)
          )
        )
        .orderBy(deuda.venceAt),
    ]);

    return { vencimientos, deudas };
  });

// ── getExceptionsSummary ───────────────────────────────────────────────────

export const getExceptionsSummary = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();

    const hoy = aFecha(new Date());
    const enTresDias = new Date();
    enTresDias.setDate(enTresDias.getDate() + 3);

    const [deudasVencidas, urgentes, proximos, credenciales] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)` })
          .from(deuda)
          .where(
            and(
              eq(deuda.orgId, orgId),
              eq(deuda.estado, 'abierta'),
              lte(deuda.venceAt, hoy)
            )
          ),

        db
          .select({ count: sql<number>`count(*)` })
          .from(notificacion)
          .where(
            and(
              eq(notificacion.orgId, orgId),
              eq(notificacion.severidad, 'urgente'),
              isNull(notificacion.resueltaAt)
            )
          ),

        db
          .select({ count: sql<number>`count(*)` })
          .from(vencimiento)
          .where(
            and(
              eq(vencimiento.orgId, orgId),
              gte(vencimiento.venceAt, hoy),
              lte(vencimiento.venceAt, aFecha(enTresDias)),
              isNull(vencimiento.completadoAt)
            )
          ),

        db
          .select({
            count: sql<number>`count(DISTINCT ${alerta.credencialId})`,
          })
          .from(alerta)
          .where(
            and(
              eq(alerta.orgId, orgId),
              eq(alerta.tipo, 'error_scraping'),
              eq(alerta.estado, 'abierta')
            )
          ),
      ]);

    return {
      deudasVencidasCount: Number(deudasVencidas[0]?.count ?? 0),
      notificacionesUrgentesCount: Number(urgentes[0]?.count ?? 0),
      vencimientosProximosCount: Number(proximos[0]?.count ?? 0),
      credencialesConErrorCount: Number(credenciales[0]?.count ?? 0),
    };
  }
);

// ── getTodayScrapedCredenciales ────────────────────────────────────────────

export const getTodayScrapedCredenciales = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return await db
    .select({
      credencialId: job.credencialId,
      nombre: credencialAfip.nombre,
      cuit: credencialAfip.cuit,
      jobs: sql<number>`count(*)::int`,
      finalizados: sql<number>`count(*) filter (where ${job.status} = 'finished')::int`,
      fallidos: sql<number>`count(*) filter (where ${job.status} = 'failed')::int`,
      pendientes: sql<number>`count(*) filter (where ${job.status} in ('pending', 'running'))::int`,
    })
    .from(job)
    .innerJoin(credencialAfip, eq(job.credencialId, credencialAfip.id))
    .where(and(eq(job.orgId, orgId), gte(job.createdAt, hoy)))
    .groupBy(job.credencialId, credencialAfip.nombre, credencialAfip.cuit)
    .orderBy(desc(sql`max(${job.createdAt})`));
});

// ── getCredentialAlerts ──────────────────────────────────────────────────────

export const getCredentialAlerts = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();

    const filas = await db
      .select({
        alertaId: alerta.id,
        credencialId: alerta.credencialId,
        nombre: credencialAfip.nombre,
        cuit: credencialAfip.cuit,
        descripcion: alerta.descripcion,
        createdAt: alerta.createdAt,
      })
      .from(alerta)
      .innerJoin(credencialAfip, eq(alerta.credencialId, credencialAfip.id))
      .where(
        and(
          eq(alerta.orgId, orgId),
          eq(alerta.tipo, 'error_scraping'),
          eq(alerta.estado, 'abierta'),
          sql`${alerta.detalle}->>'errorCategory' = 'credentials'`
        )
      )
      .orderBy(desc(alerta.createdAt));

    // Una credencial puede tener alertas de varios tipos de job: se muestra una.
    const vistas = new Set<string>();
    return filas.filter((f) => {
      if (!f.credencialId || vistas.has(f.credencialId)) return false;
      vistas.add(f.credencialId);
      return true;
    });
  }
);

// ── getScheduleStatus ────────────────────────────────────────────────────────

const SCHEDULE_CONFIG = {
  daily: { modules: ['comprobantes', 'notificaciones'], freq: 'daily' },
  weekly: { modules: ['deuda', 'vencimientos'], freq: 'weekly' },
  monthly_iva: { modules: ['iva'], freq: 'monthly' },
} as const;

const MODULE_FREQ: Record<string, string> = {};
for (const cfg of Object.values(SCHEDULE_CONFIG)) {
  for (const mod of cfg.modules) {
    MODULE_FREQ[mod] = cfg.freq;
  }
}

const ALL_MODULES = Object.keys(MODULE_FREQ);

function getNextScheduledAfter(frequency: string, now: Date): string {
  const day = now.getDay();
  const date = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  if (frequency === 'daily') {
    let daysToAdd = 1;
    if (day === 5) daysToAdd = 3;
    if (day === 6) daysToAdd = 2;
    const next = new Date(year, month, date + daysToAdd);
    next.setHours(8, 0, 0, 0);
    return next.toISOString();
  }

  if (frequency === 'weekly') {
    const daysToMon = day === 0 ? 1 : 8 - day;
    const next = new Date(year, month, date + daysToMon);
    next.setHours(6, 0, 0, 0);
    return next.toISOString();
  }

  // monthly (IVA)
  if (date <= 28) {
    const startDay = Math.max(date + 1, 20);
    const next = new Date(year, month, startDay);
    const dow = next.getDay();
    if (dow === 0) next.setDate(next.getDate() + 1);
    if (dow === 6) next.setDate(next.getDate() + 2);
    if (next.getDate() <= 28) {
      next.setHours(8, 0, 0, 0);
      return next.toISOString();
    }
  }
  const next = new Date(year, month + 1, 20);
  const dow = next.getDay();
  if (dow === 0) next.setDate(next.getDate() + 1);
  if (dow === 6) next.setDate(next.getDate() + 2);
  next.setHours(8, 0, 0, 0);
  return next.toISOString();
}

export const getScheduleStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();

    // El scraping se agenda por credencial: un job es un login de AFIP.
    const credenciales = await db
      .select({
        id: credencialAfip.id,
        nombre: credencialAfip.nombre,
        cuit: credencialAfip.cuit,
      })
      .from(credencialAfip)
      .where(
        and(
          eq(credencialAfip.orgId, orgId),
          eq(credencialAfip.estado, 'activa')
        )
      );

    if (credenciales.length === 0) return [];

    const alertasClave = await db
      .select({ credencialId: alerta.credencialId })
      .from(alerta)
      .where(
        and(
          eq(alerta.orgId, orgId),
          eq(alerta.tipo, 'error_scraping'),
          eq(alerta.estado, 'abierta'),
          sql`${alerta.detalle}->>'errorCategory' = 'credentials'`
        )
      );
    const bloqueadas = new Set(alertasClave.map((a) => a.credencialId));

    const ultimos = await db
      .select({
        credencialId: job.credencialId,
        type: job.type,
        finishedAt: sql<string>`MAX(${job.finishedAt})`,
      })
      .from(job)
      .where(and(eq(job.orgId, orgId), eq(job.status, 'finished')))
      .groupBy(job.credencialId, job.type);

    const ultimoPor = new Map<string, string>();
    for (const fila of ultimos) {
      ultimoPor.set(`${fila.credencialId}:${fila.type}`, fila.finishedAt);
    }

    const now = new Date();

    return credenciales.map((cred) => {
      const modules: Record<
        string,
        {
          frequency: string;
          lastScrapedAt: string | null;
          nextScheduledAfter: string | null;
        }
      > = {};
      for (const mod of ALL_MODULES) {
        const freq = MODULE_FREQ[mod];
        modules[mod] = {
          frequency: freq,
          lastScrapedAt: ultimoPor.get(`${cred.id}:${mod}`) || null,
          nextScheduledAfter: bloqueadas.has(cred.id)
            ? null
            : getNextScheduledAfter(freq, now),
        };
      }
      return {
        credencialId: cred.id,
        nombre: cred.nombre,
        cuit: cred.cuit,
        tieneAlertaCredencial: bloqueadas.has(cred.id),
        modules,
      };
    });
  }
);
