/**
 * Analytics del estudio: proyección de impuestos, ratios por cliente y resumen
 * ejecutivo. Todo cuelga de `cliente`, que ya trae `org_id`: no hace falta
 * pasar por el login de AFIP para acotar por organización.
 */
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  cliente,
  ivaDeclaracion,
  proyeccionImpuesto,
  riesgoSnapshot,
  riesgoNivel,
  comprobante,
  deuda,
  notificacion,
  vencimiento,
} from '@/drizzle/schema';
import {
  eq,
  and,
  gte,
  lte,
  desc,
  sql,
  inArray,
  isNull,
} from 'drizzle-orm';
import { getSessionWithOrg } from '@/actions/helpers';

/** Cómo se llegó al monto proyectado, para poder auditarlo después. */
interface FactoresProyeccion {
  metodo: 'sin_datos' | 'promedio_historico';
  muestras: number;
  mensaje?: string;
  debitoPromedio?: number;
  creditoPromedio?: number;
  posicionPromedio?: number;
  periodos?: string[];
}

/** Lo que el motor de riesgo deja anotado: cada factor con su puntaje. */
type FactoresRiesgo = Record<string, number | string | boolean | null>;

/** "YYYY-MM" → primer día del mes, que es como se guardan los períodos. */
const periodoADate = (periodo: string) => `${periodo}-01`;

const soloFecha = (d: Date) => d.toISOString().slice(0, 10);

/** El cliente, validando que sea de la organización activa. */
async function getClienteDeOrg(clienteId: string, orgId: string) {
  const [row] = await db
    .select({ id: cliente.id, razonSocial: cliente.razonSocial })
    .from(cliente)
    .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Cliente no encontrado o no autorizado');
  return row;
}

/** Importe en pesos: las declaraciones en dólares traen su cotización. */
const totalEnPesos = sql<number>`(${comprobante.total} * ${comprobante.cotizacion})`;

// ── Proyección de IVA ────────────────────────────────────────────────────────

export const generateIvaProjection = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe ser YYYY-MM'),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await getClienteDeOrg(ctx.data.clienteId, orgId);

    const declaraciones = await db
      .select({
        periodo: ivaDeclaracion.periodo,
        debitoFiscal: ivaDeclaracion.debitoFiscal,
        creditoFiscal: ivaDeclaracion.creditoFiscal,
      })
      .from(ivaDeclaracion)
      .where(eq(ivaDeclaracion.clienteId, ctx.data.clienteId))
      .orderBy(desc(ivaDeclaracion.periodo))
      .limit(6);

    const conDato = declaraciones.filter((d) => d.debitoFiscal !== null);

    let montoProyectado = 0;
    let confianza: 'baja' | 'media' | 'alta';
    let factores: FactoresProyeccion;

    if (conDato.length === 0) {
      confianza = 'baja';
      factores = {
        metodo: 'sin_datos',
        muestras: 0,
        mensaje: 'Sin historial de declaraciones de IVA',
      };
    } else {
      // Posición del período: positiva = IVA a pagar, negativa = saldo a favor.
      const posiciones = conDato.map(
        (d) => Number(d.debitoFiscal ?? 0) - Number(d.creditoFiscal ?? 0)
      );
      const promedio =
        posiciones.reduce((sum, v) => sum + v, 0) / posiciones.length;

      montoProyectado = Math.max(0, promedio);
      confianza =
        conDato.length >= 5 ? 'alta' : conDato.length >= 3 ? 'media' : 'baja';

      factores = {
        metodo: 'promedio_historico',
        muestras: conDato.length,
        debitoPromedio:
          conDato.reduce((sum, d) => sum + Number(d.debitoFiscal ?? 0), 0) /
          conDato.length,
        creditoPromedio:
          conDato.reduce((sum, d) => sum + Number(d.creditoFiscal ?? 0), 0) /
          conDato.length,
        posicionPromedio: promedio,
        periodos: conDato.map((d) => d.periodo),
      };
    }

    const periodo = periodoADate(ctx.data.periodo);

    await db
      .insert(proyeccionImpuesto)
      .values({
        clienteId: ctx.data.clienteId,
        periodo,
        impuesto: 'iva',
        montoProyectado: montoProyectado.toFixed(2),
        confianza,
        factores,
      })
      .onConflictDoUpdate({
        target: [
          proyeccionImpuesto.clienteId,
          proyeccionImpuesto.periodo,
          proyeccionImpuesto.impuesto,
        ],
        set: {
          montoProyectado: montoProyectado.toFixed(2),
          confianza,
          factores,
          generadaAt: new Date(),
        },
      });

    return {
      clienteId: ctx.data.clienteId,
      periodo,
      impuesto: 'iva' as const,
      montoProyectado,
      confianza,
      factores,
    };
  });

// ── Ratios por cliente ───────────────────────────────────────────────────────

export const getRatios = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      from: z.string(),
      to: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const clienteRow = await getClienteDeOrg(ctx.data.clienteId, orgId);

    const desde = new Date(ctx.data.from);
    const hasta = new Date(ctx.data.to);

    // Período anterior del mismo largo, para comparar.
    const rango = hasta.getTime() - desde.getTime();
    const anteriorHasta = new Date(desde.getTime() - 24 * 60 * 60 * 1000);
    const anteriorDesde = new Date(anteriorHasta.getTime() - rango);

    const totales = (from: string, to: string) =>
      db
        .select({
          ventas: sql<number>`coalesce(sum(case when ${comprobante.direccion} = 'emitido' then ${totalEnPesos} else 0 end), 0)`,
          compras: sql<number>`coalesce(sum(case when ${comprobante.direccion} = 'recibido' then ${totalEnPesos} else 0 end), 0)`,
          cantidad: sql<number>`count(*)::int`,
        })
        .from(comprobante)
        .where(
          and(
            eq(comprobante.clienteId, ctx.data.clienteId),
            gte(comprobante.fechaEmision, from),
            lte(comprobante.fechaEmision, to)
          )
        );

    const [[actual], [anterior]] = await Promise.all([
      totales(ctx.data.from, ctx.data.to),
      totales(soloFecha(anteriorDesde), soloFecha(anteriorHasta)),
    ]);

    const ventas = Number(actual?.ventas ?? 0);
    const compras = Number(actual?.compras ?? 0);
    const ventasAnterior = Number(anterior?.ventas ?? 0);
    const comprasAnterior = Number(anterior?.compras ?? 0);

    return {
      clienteId: ctx.data.clienteId,
      razonSocial: clienteRow.razonSocial,
      from: ctx.data.from,
      to: ctx.data.to,
      ventas,
      compras,
      comprobantes: Number(actual?.cantidad ?? 0),
      posicionNeta: ventas - compras,
      ratioVentasCompras: compras > 0 ? ventas / compras : null,
      variacionVentasPct:
        ventasAnterior > 0
          ? ((ventas - ventasAnterior) / ventasAnterior) * 100
          : null,
      variacionComprasPct:
        comprasAnterior > 0
          ? ((compras - comprasAnterior) / comprasAnterior) * 100
          : null,
      ventasAnterior,
      comprasAnterior,
    };
  });

// ── Clientes en riesgo ───────────────────────────────────────────────────────

export const getClientesEnRiesgo = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      periodo: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
      nivelMinimo: z.enum(riesgoNivel.enumValues).optional().default('alto'),
      limit: z.number().int().min(1).max(100).default(20),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const now = new Date();
    const periodo = periodoADate(
      ctx.data.periodo ??
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    );

    // El filtro es "de este nivel para arriba".
    const niveles = riesgoNivel.enumValues.slice(
      riesgoNivel.enumValues.indexOf(ctx.data.nivelMinimo)
    );

    const snapshots = await db
      .select({
        snapshotId: riesgoSnapshot.id,
        clienteId: cliente.id,
        razonSocial: cliente.razonSocial,
        cuit: cliente.cuit,
        score: riesgoSnapshot.score,
        nivel: riesgoSnapshot.nivel,
        factores: sql<FactoresRiesgo | null>`${riesgoSnapshot.factores}`,
      })
      .from(riesgoSnapshot)
      .innerJoin(cliente, eq(riesgoSnapshot.clienteId, cliente.id))
      .where(
        and(
          eq(riesgoSnapshot.periodo, periodo),
          eq(cliente.orgId, orgId),
          inArray(riesgoSnapshot.nivel, niveles)
        )
      )
      .orderBy(desc(riesgoSnapshot.score))
      .limit(ctx.data.limit);

    return snapshots.map((s) => ({ ...s, score: Number(s.score) }));
  });

// ── Resumen ejecutivo ────────────────────────────────────────────────────────

export const getExecutiveSummary = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();

    const clientes = await db
      .select({ id: cliente.id })
      .from(cliente)
      .where(and(eq(cliente.orgId, orgId), eq(cliente.estado, 'activo')));

    if (clientes.length === 0) {
      return {
        totalClientes: 0,
        deudasAbiertas: 0,
        deudaTotal: 0,
        notificacionesUrgentes: 0,
        vencimientosProximos: 0,
        clientesRiesgoCritico: 0,
        clientesRiesgoAlto: 0,
        ventasDelMes: 0,
        comprasDelMes: 0,
      };
    }

    const clienteIds = clientes.map((c) => c.id);

    const now = new Date();
    const inicioMes = soloFecha(new Date(now.getFullYear(), now.getMonth(), 1));
    const finMes = soloFecha(
      new Date(now.getFullYear(), now.getMonth() + 1, 0)
    );
    const enSieteDias = soloFecha(
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    );
    const periodoActual = periodoADate(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    );

    const [deudas, urgentes, proximos, riesgo, movimiento] = await Promise.all([
      db
        .select({
          count: sql<number>`count(*)::int`,
          total: sql<number>`coalesce(sum(${deuda.saldo}), 0)`,
        })
        .from(deuda)
        .where(and(eq(deuda.orgId, orgId), eq(deuda.estado, 'abierta'))),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificacion)
        .where(
          and(
            eq(notificacion.orgId, orgId),
            eq(notificacion.severidad, 'urgente'),
            isNull(notificacion.resueltaAt)
          )
        ),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vencimiento)
        .where(
          and(
            eq(vencimiento.orgId, orgId),
            gte(vencimiento.venceAt, soloFecha(now)),
            lte(vencimiento.venceAt, enSieteDias),
            isNull(vencimiento.completadoAt)
          )
        ),

      db
        .select({
          nivel: riesgoSnapshot.nivel,
          count: sql<number>`count(*)::int`,
        })
        .from(riesgoSnapshot)
        .innerJoin(cliente, eq(riesgoSnapshot.clienteId, cliente.id))
        .where(
          and(
            eq(riesgoSnapshot.periodo, periodoActual),
            eq(cliente.orgId, orgId),
            inArray(riesgoSnapshot.nivel, ['alto', 'critico'])
          )
        )
        .groupBy(riesgoSnapshot.nivel),

      db
        .select({
          ventas: sql<number>`coalesce(sum(case when ${comprobante.direccion} = 'emitido' then ${totalEnPesos} else 0 end), 0)`,
          compras: sql<number>`coalesce(sum(case when ${comprobante.direccion} = 'recibido' then ${totalEnPesos} else 0 end), 0)`,
        })
        .from(comprobante)
        .where(
          and(
            inArray(comprobante.clienteId, clienteIds),
            gte(comprobante.fechaEmision, inicioMes),
            lte(comprobante.fechaEmision, finMes)
          )
        ),
    ]);

    const porNivel = Object.fromEntries(
      riesgo.map((r) => [r.nivel, Number(r.count)])
    );

    return {
      totalClientes: clientes.length,
      deudasAbiertas: Number(deudas[0]?.count ?? 0),
      deudaTotal: Number(deudas[0]?.total ?? 0),
      notificacionesUrgentes: Number(urgentes[0]?.count ?? 0),
      vencimientosProximos: Number(proximos[0]?.count ?? 0),
      clientesRiesgoCritico: porNivel.critico ?? 0,
      clientesRiesgoAlto: porNivel.alto ?? 0,
      ventasDelMes: Number(movimiento[0]?.ventas ?? 0),
      comprasDelMes: Number(movimiento[0]?.compras ?? 0),
    };
  }
);
