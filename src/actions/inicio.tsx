/**
 * Datos de la pantalla de Inicio.
 *
 * Un solo server function con todas las consultas en una tanda de
 * `Promise.all`: contra una base remota cada consulta secuencial cuesta un
 * viaje entero (~300 ms medidos contra staging), y el inicio es la primera
 * pantalla que ve el usuario. La franja de credenciales carga aparte
 * (`getCredentialAlerts`), como pide el diseño.
 *
 * La regla de la pantalla vive en el cliente (crítico, sin tarea, % del
 * tope): acá se devuelven hechos, no juicios.
 */
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  cliente,
  clienteMonotributo,
  comprobante,
  comprobanteTipo,
  notificacion,
  tarea,
  tareaCliente,
  vencimiento,
} from '@/drizzle/schema';
import { user } from '@/drizzle/auth';
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { getSessionWithOrg } from '@/actions/helpers';

/** `YYYY-MM-DD` local: las columnas `date` son strings y UTC correría un día. */
function aFecha(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Las categorías de notificación que son riesgo fiscal, en orden de gravedad. */
export const CATEGORIAS_RIESGO = [
  'intimacion',
  'inspeccion',
  'requerimiento',
] as const;

export const getInicio = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      /** Rango visible de la agenda y la franja de días (YYYY-MM-DD). */
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const hoy = new Date();
    const hoyStr = aFecha(hoy);
    const mesDesde = aFecha(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    // Vencidos: solo desde el mes pasado. Lo más viejo quedó resuelto fuera
    // del sistema (mismo criterio que la autogeneración de tareas) y sumarlo
    // convierte el chip en un número de terror sin acción posible.
    const vencidosDesde = aFecha(
      new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    );
    const mesHasta = aFecha(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));

    // La tarea de un vencimiento se llega por tarea_cliente.vencimiento_id
    // (la que crea "Autogenerar" o la que alguien vinculó a mano).
    const vencimientosPeriodo = db
      .select({
        id: vencimiento.id,
        impuesto: vencimiento.impuesto,
        concepto: vencimiento.concepto,
        venceAt: vencimiento.venceAt,
        completado: sql<boolean>`${vencimiento.completadoAt} is not null`,
        clienteId: vencimiento.clienteId,
        clienteNombre: cliente.razonSocial,
        cuit: vencimiento.cuit,
        tareaId: tareaCliente.tareaId,
        asignadoNombre: user.name,
      })
      .from(vencimiento)
      .leftJoin(cliente, eq(vencimiento.clienteId, cliente.id))
      .leftJoin(tareaCliente, eq(tareaCliente.vencimientoId, vencimiento.id))
      .leftJoin(tarea, eq(tarea.id, tareaCliente.tareaId))
      .leftJoin(user, eq(user.id, tarea.asignadoA))
      .where(
        and(
          eq(vencimiento.orgId, orgId),
          gte(vencimiento.venceAt, ctx.data.desde),
          lte(vencimiento.venceAt, ctx.data.hasta)
        )
      )
      .orderBy(asc(vencimiento.venceAt), asc(vencimiento.impuesto));

    // La lista detrás del chip «vencidos»: el chip la despliega en la misma
    // agenda — mandarte al calendario del mes, donde lo pasado no se ve, era
    // una promesa rota.
    const vencidosLista = db
      .select({
        id: vencimiento.id,
        impuesto: vencimiento.impuesto,
        concepto: vencimiento.concepto,
        venceAt: vencimiento.venceAt,
        completado: sql<boolean>`false`,
        clienteId: vencimiento.clienteId,
        clienteNombre: cliente.razonSocial,
        cuit: vencimiento.cuit,
        tareaId: tareaCliente.tareaId,
        asignadoNombre: user.name,
      })
      .from(vencimiento)
      .leftJoin(cliente, eq(vencimiento.clienteId, cliente.id))
      .leftJoin(tareaCliente, eq(tareaCliente.vencimientoId, vencimiento.id))
      .leftJoin(tarea, eq(tarea.id, tareaCliente.tareaId))
      .leftJoin(user, eq(user.id, tarea.asignadoA))
      .where(
        and(
          eq(vencimiento.orgId, orgId),
          gte(vencimiento.venceAt, vencidosDesde),
          sql`${vencimiento.venceAt} < ${hoyStr}`,
          isNull(vencimiento.completadoAt)
        )
      )
      .orderBy(desc(vencimiento.venceAt), asc(vencimiento.impuesto))
      .limit(400);

    const resumen = db
      .select({
        delMes: sql<number>`count(*) filter (where ${vencimiento.venceAt} >= ${mesDesde} and ${vencimiento.venceAt} <= ${mesHasta})::int`,
        empresasMes: sql<number>`count(distinct coalesce(${vencimiento.clienteId}::text, ${vencimiento.cuit})) filter (where ${vencimiento.venceAt} >= ${mesDesde} and ${vencimiento.venceAt} <= ${mesHasta})::int`,
        vencidos: sql<number>`count(*) filter (where ${vencimiento.venceAt} >= ${vencidosDesde} and ${vencimiento.venceAt} < ${hoyStr} and ${vencimiento.completadoAt} is null)::int`,
      })
      .from(vencimiento)
      .where(eq(vencimiento.orgId, orgId));

    // Mismo criterio que autoGenerarTareas: vigente = del 1° del mes actual
    // en adelante, sin completar. Los de CUITs que no son cliente también
    // cuentan — Autogenerar los manda a la columna «Sin cliente» del tablero.
    const sinTarea = db
      .select({
        id: vencimiento.id,
        impuesto: vencimiento.impuesto,
        concepto: vencimiento.concepto,
        venceAt: vencimiento.venceAt,
        clienteNombre: sql<string>`coalesce(${cliente.razonSocial}, 'CUIT ' || ${vencimiento.cuit})`,
      })
      .from(vencimiento)
      .leftJoin(
        cliente,
        or(
          eq(cliente.id, vencimiento.clienteId),
          and(
            isNull(vencimiento.clienteId),
            eq(cliente.orgId, orgId),
            eq(cliente.cuit, vencimiento.cuit)
          )
        )
      )
      .leftJoin(tareaCliente, eq(tareaCliente.vencimientoId, vencimiento.id))
      .where(
        and(
          eq(vencimiento.orgId, orgId),
          gte(vencimiento.venceAt, mesDesde),
          isNull(vencimiento.completadoAt),
          isNull(tareaCliente.id)
        )
      )
      .orderBy(asc(vencimiento.venceAt));

    // "Sin responder" = sin resolver; la antigüedad la juzga el cliente con
    // la regla escrita en la card (hoy: +7 días).
    const notificacionesRiesgo = db
      .select({
        categoria: notificacion.categoria,
        total: sql<number>`count(*)::int`,
        sinLeer: sql<number>`count(*) filter (where not ${notificacion.leida})::int`,
        empresas: sql<number>`count(distinct coalesce(${notificacion.clienteId}::text, ${notificacion.credencialId}::text))::int`,
        masViejaAt: sql<
          string | null
        >`min(coalesce(${notificacion.publicadaAt}, ${notificacion.createdAt}))::text`,
        proximoVenceAt: sql<
          string | null
        >`min(${notificacion.venceAt}) filter (where ${notificacion.venceAt} >= now())::text`,
        criticas: sql<number>`count(*) filter (where coalesce(${notificacion.publicadaAt}, ${notificacion.createdAt}) < now() - interval '7 days')::int`,
      })
      .from(notificacion)
      .where(
        and(
          eq(notificacion.orgId, orgId),
          isNull(notificacion.resueltaAt),
          sql`${notificacion.categoria} in ('intimacion', 'inspeccion', 'requerimiento')`
        )
      )
      .groupBy(notificacion.categoria);

    // Facturación de 12 meses cerrados, notas de crédito restando — el mismo
    // cálculo de la solapa de IVA. La categoría real (si el scrapper ya la
    // trajo) viene de cliente_monotributo; el % contra el tope se arma en el
    // cliente con la escala de src/lib/monotributo-escala.ts.
    const facturado = sql`coalesce(sum(
      case when ${comprobanteTipo.esNc} then -${comprobante.total} else ${comprobante.total} end
    ), 0)`;
    const monotributistas = db
      .select({
        clienteId: cliente.id,
        razonSocial: cliente.razonSocial,
        categoria: clienteMonotributo.categoria,
        facturacion12m: sql<string>`${facturado}::text`,
      })
      .from(cliente)
      .leftJoin(
        comprobante,
        and(
          eq(comprobante.clienteId, cliente.id),
          eq(comprobante.direccion, 'emitido'),
          sql`${comprobante.fechaEmision} >= date_trunc('month', now()) - interval '12 months'`
        )
      )
      .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
      .leftJoin(
        clienteMonotributo,
        eq(clienteMonotributo.clienteId, cliente.id)
      )
      .where(
        and(
          eq(cliente.orgId, orgId),
          eq(cliente.condicionIva, 'monotributista'),
          eq(cliente.estado, 'activo')
        )
      )
      .groupBy(cliente.id, cliente.razonSocial, clienteMonotributo.categoria)
      .orderBy(desc(facturado));

    // Abierta = en el tablero (sin archivar, sin verificar). Vencida además
    // pasó su fecha. Las sin responsable van a la fila "sin asignar".
    const equipo = db
      .select({
        asignadoA: tarea.asignadoA,
        nombre: user.name,
        abiertas: sql<number>`count(*)::int`,
        vencidas: sql<number>`count(*) filter (where ${tarea.venceAt} < now())::int`,
      })
      .from(tarea)
      .leftJoin(user, eq(user.id, tarea.asignadoA))
      .where(
        and(
          eq(tarea.orgId, orgId),
          isNull(tarea.archivadaAt),
          sql`${tarea.estado} <> 'verificada'`
        )
      )
      .groupBy(tarea.asignadoA, user.name)
      .orderBy(desc(sql`count(*)`));

    const [
      vencs,
      vencidosRows,
      [res],
      sinTareaRows,
      notifs,
      monos,
      equipoRows,
    ] = await Promise.all([
      vencimientosPeriodo,
      vencidosLista,
      resumen,
      sinTarea,
      notificacionesRiesgo,
      monotributistas,
      equipo,
    ]);

    return {
      vencimientos: vencs,
      vencidos: vencidosRows,
      resumen: {
        delMes: res?.delMes ?? 0,
        empresasMes: res?.empresasMes ?? 0,
        vencidos: res?.vencidos ?? 0,
      },
      sinTarea: sinTareaRows,
      notificaciones: notifs,
      monotributo: monos,
      equipo: equipoRows,
    };
  });
