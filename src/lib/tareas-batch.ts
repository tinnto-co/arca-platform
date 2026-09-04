/**
 * Lógica de auto-generación de tareas sin dependencia de sesión HTTP.
 * Puede ser invocada tanto desde server actions como desde crons.
 */
import { and, asc, eq, gte, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  tarea,
  tareaCliente,
  tareaColumna,
  tareaNotificacion,
  cliente,
  notificacion,
  vencimiento,
} from '@/drizzle/schema';

export type TipoTarea =
  | 'iva'
  | 'iibb'
  | 'ddjj'
  | 'sueldos'
  | 'convenios'
  | 'otro';

const TAX_TO_TIPO: Record<string, TipoTarea> = {
  iva: 'iva',
  'i.v.a': 'iva',
  iibb: 'iibb',
  'ingresos brutos': 'iibb',
  ganancias: 'ddjj',
  ddjj: 'ddjj',
  sueldos: 'sueldos',
  convenios: 'convenios',
};

function taxToTipo(tax: string): TipoTarea {
  const normalized = tax.toLowerCase().trim();
  for (const [key, tipo] of Object.entries(TAX_TO_TIPO)) {
    if (normalized.includes(key)) return tipo;
  }
  return 'otro';
}

export interface AutoGenResult {
  creadas: number;
  omitidas: number;
  /**
   * Vencimientos cuyo CUIT no es cliente de la plataforma. Ya no se
   * descartan: generan su tarea igual y caen en la columna «Sin cliente»
   * del tablero, donde el usuario puede verlos uno por uno.
   */
  sinCliente: number;
  /**
   * Vencimientos sumados a tareas EXISTENTES en esta corrida. Sin este
   * numero, cubrir 100 vencimientos sin crear tareas nuevas se reportaba
   * como que no hubo nada que hacer.
   */
  itemsAgregados: number;
  /** Notificaciones críticas (intimaciones/fiscalizaciones) que quedaron
   * vinculadas a una tarea en esta corrida. */
  notificacionesCubiertas: number;
  /** Tareas creadas por período (YYYY-MM), para poder contarlo en la UI. */
  porPeriodo: Record<string, number>;
}

export const CLAVE_SIN_CLIENTE = 'sin_cliente';

/**
 * Devuelve la columna «Sin cliente», creándola si falta. Mismo patrón que
 * Archivadas: columna de sistema (clave no nula, el usuario no la renombra ni
 * la borra), idempotente por el índice único (org_id, clave). Se crea recién
 * cuando hay algo que poner adentro, no como seed.
 */
async function asegurarColumnaSinCliente(orgId: string): Promise<string> {
  const buscar = () =>
    db
      .select({ id: tareaColumna.id })
      .from(tareaColumna)
      .where(
        and(
          eq(tareaColumna.orgId, orgId),
          eq(tareaColumna.clave, CLAVE_SIN_CLIENTE)
        )
      )
      .limit(1);

  const [existente] = await buscar();
  if (existente) return existente.id;

  const [creada] = await db
    .insert(tareaColumna)
    .values({
      orgId,
      nombre: 'Sin cliente',
      clave: CLAVE_SIN_CLIENTE,
      color: 'oro',
      // A la derecha de las columnas del estudio, antes de Archivadas (9999).
      orden: 9000,
    })
    .onConflictDoNothing()
    .returning({ id: tareaColumna.id });
  if (creada) return creada.id;

  const [ganadora] = await buscar();
  if (!ganadora) throw new Error('No se pudo crear la columna Sin cliente');
  return ganadora.id;
}

const MESES_TITULO = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Qué categorías de notificación generan tarea. Los requerimientos de DDJJ
 * quedan afuera a propósito: su resolución real es presentar la declaración,
 * y eso ya lo cubre el flujo vencimiento→tarea — una segunda tarea sería el
 * mismo trabajo con otro nombre. */
const CATEGORIAS_NOTIF_TAREA: Record<string, string> = {
  intimacion: 'Intimaciones AFIP',
  inspeccion: 'Fiscalización / inspección',
};

/**
 * Convierte en tareas las notificaciones críticas (mismas condiciones que la
 * card de Riesgos del Inicio: sin resolver, del mes pasado en adelante o sin
 * leer — lo que nadie vio no prescribe). Una tarea por categoría y mes, con
 * las empresas como checklist; el dedup va por tarea_notificacion, así cada
 * notificación se vincula una sola vez y las corridas siguientes solo suman
 * lo nuevo.
 */
async function cubrirNotificacionesCriticas(
  orgId: string,
  creadoPor: string | null,
  mesPasado: string
): Promise<{
  creadas: number;
  cubiertas: number;
  porPeriodo: Record<string, number>;
}> {
  const notifs = await db
    .select({
      id: notificacion.id,
      clienteId: notificacion.clienteId,
      categoria: notificacion.categoria,
      venceAt: notificacion.venceAt,
      publicada: sql<string>`coalesce(${notificacion.publicadaAt}, ${notificacion.createdAt})::date::text`,
    })
    .from(notificacion)
    .where(
      and(
        eq(notificacion.orgId, orgId),
        sql`${notificacion.resueltaAt} is null`,
        sql`${notificacion.categoria} in ('intimacion', 'inspeccion')`,
        sql`(coalesce(${notificacion.publicadaAt}, ${notificacion.createdAt}) >= ${mesPasado}::date
             or not ${notificacion.leida})`
      )
    );
  if (notifs.length === 0) return { creadas: 0, cubiertas: 0, porPeriodo: {} };

  const ya = await db
    .select({ notificacionId: tareaNotificacion.notificacionId })
    .from(tareaNotificacion)
    .where(
      inArray(
        tareaNotificacion.notificacionId,
        notifs.map((n) => n.id)
      )
    );
  const vinculadas = new Set(ya.map((r) => r.notificacionId));
  const pendientes = notifs.filter((n) => !vinculadas.has(n.id));
  if (pendientes.length === 0)
    return { creadas: 0, cubiertas: 0, porPeriodo: {} };

  const [primeraColumna] = await db
    .select({ id: tareaColumna.id })
    .from(tareaColumna)
    .where(
      sql`${tareaColumna.orgId} = ${orgId} and coalesce(${tareaColumna.clave}, '') <> 'archivadas'`
    )
    .orderBy(asc(tareaColumna.orden), asc(tareaColumna.createdAt))
    .limit(1);

  const grupos = new Map<
    string,
    { categoria: string; periodo: string; items: typeof pendientes }
  >();
  for (const n of pendientes) {
    const periodo = n.publicada.slice(0, 7);
    const key = `${n.categoria}|${periodo}`;
    if (!grupos.has(key))
      grupos.set(key, { categoria: n.categoria ?? '', periodo, items: [] });
    grupos.get(key)!.items.push(n);
  }

  let creadas = 0;
  let cubiertas = 0;
  const porPeriodo: Record<string, number> = {};

  for (const grupo of grupos.values()) {
    // Fuente distinta por categoría: es la clave del dedup de la tarea.
    const fuente = `automatica_notif_${grupo.categoria}`;
    const [anio, mes] = grupo.periodo.split('-');
    const titulo = `${CATEGORIAS_NOTIF_TAREA[grupo.categoria]} · ${MESES_TITULO[Number(mes) - 1]} ${anio}`;

    const [existing] = await db
      .select({ id: tarea.id })
      .from(tarea)
      .where(
        and(
          eq(tarea.orgId, orgId),
          eq(tarea.periodo, grupo.periodo),
          eq(tarea.fuente, fuente)
        )
      )
      .limit(1);

    const vences = grupo.items
      .map((i) => (i.venceAt ? new Date(i.venceAt).getTime() : null))
      .filter((v): v is number => v !== null);
    const venceMin = vences.length > 0 ? new Date(Math.min(...vences)) : null;

    const tareaId = existing
      ? existing.id
      : await db
          .insert(tarea)
          .values({
            orgId,
            titulo,
            descripcion:
              'Generada desde las notificaciones críticas de AFIP. Cada empresa del checklist tiene al menos una notificación de esta categoría sin resolver — el detalle está en la bandeja de Notificaciones.',
            tipo: 'otro',
            estado: 'pendiente',
            periodo: grupo.periodo,
            venceAt: venceMin,
            fuente,
            creadoPor,
            columnaId: primeraColumna?.id ?? null,
          })
          .returning()
          .then((r) => r[0].id);

    if (!existing) {
      creadas++;
      porPeriodo[grupo.periodo] = (porPeriodo[grupo.periodo] ?? 0) + 1;
    }

    for (const n of grupo.items) {
      const ins = await db
        .insert(tareaNotificacion)
        .values({ tareaId, notificacionId: n.id, fuente: 'automatica' })
        .onConflictDoNothing()
        .returning({ id: tareaNotificacion.id });
      cubiertas += ins.length;
      // Checklist por empresa (una fila por cliente; la segunda notificación
      // del mismo cliente cae en el onConflict). Sin cliente no hay fila: el
      // vínculo queda igual registrado en tarea_notificacion.
      if (n.clienteId) {
        await db
          .insert(tareaCliente)
          .values({ tareaId, clienteId: n.clienteId, completado: false })
          .onConflictDoNothing();
      }
    }
  }

  return { creadas, cubiertas, porPeriodo };
}

/**
 * Auto-genera tareas para una org y período dados, sin requerir sesión HTTP.
 *
 * @param orgId  - ID de la organización
 * @param periodo - Período en formato YYYY-MM
 * @param creadoPor - user_id que figura como creador (null para tareas de sistema)
 */
export async function autoGenerarTareasParaOrg(
  orgId: string,
  creadoPor: string | null = null
): Promise<AutoGenResult> {
  /**
   * El alcance es «todo lo vigente»: desde el primer día del mes actual en
   * hora argentina, sin tope hacia adelante. No se pide un período porque el
   * período no es una decisión del usuario — cada vencimiento ya trae el suyo
   * y la tarea se agrupa en ese. Los meses pasados quedan afuera a propósito:
   * convertirlos en tareas resucitaría trabajo ya hecho fuera del sistema.
   */
  const hoyAR = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
  const fromStr = `${hoyAR.slice(0, 7)}-01`;
  const [anioHoy, mesHoy] = hoyAR.split('-').map(Number);
  const mesPasadoStr = `${mesHoy === 1 ? anioHoy - 1 : anioHoy}-${String(
    mesHoy === 1 ? 12 : mesHoy - 1
  ).padStart(2, '0')}-01`;

  // Las notificaciones críticas se cubren SIEMPRE, haya o no vencimientos:
  // por eso todos los retornos pasan por acá.
  const finalizar = async (
    parcial: Omit<AutoGenResult, 'notificacionesCubiertas'>
  ): Promise<AutoGenResult> => {
    const n = await cubrirNotificacionesCriticas(
      orgId,
      creadoPor,
      mesPasadoStr
    );
    const porPeriodo = { ...parcial.porPeriodo };
    for (const [p, c] of Object.entries(n.porPeriodo))
      porPeriodo[p] = (porPeriodo[p] ?? 0) + c;
    return {
      ...parcial,
      creadas: parcial.creadas + n.creadas,
      porPeriodo,
      notificacionesCubiertas: n.cubiertas,
    };
  };

  const orgClientes = await db
    .select({ id: cliente.id, cuit: cliente.cuit, name: cliente.razonSocial })
    .from(cliente)
    .where(eq(cliente.orgId, orgId));

  const clienteById = Object.fromEntries(orgClientes.map((c) => [c.id, c]));
  const clienteByCuit = Object.fromEntries(orgClientes.map((c) => [c.cuit, c]));

  const vencimientosRaw = await db
    .select({
      id: vencimiento.id,
      tax: vencimiento.impuesto,
      concept: vencimiento.concepto,
      dueDate: vencimiento.venceAt,
      clienteId: vencimiento.clienteId,
      cuit: vencimiento.cuit,
    })
    .from(vencimiento)
    .where(
      and(
        eq(vencimiento.orgId, orgId),
        gte(vencimiento.venceAt, fromStr),
        or(isNotNull(vencimiento.clienteId), isNotNull(vencimiento.cuit))
      )
    );

  if (vencimientosRaw.length === 0)
    return finalizar({
      creadas: 0,
      omitidas: 0,
      sinCliente: 0,
      itemsAgregados: 0,
      porPeriodo: {},
    });

  const vencimientoIds = vencimientosRaw.map((v) => v.id);
  const yaAsignados = await db
    .select({ vencimientoId: tareaCliente.vencimientoId })
    .from(tareaCliente)
    .where(inArray(tareaCliente.vencimientoId, vencimientoIds));

  const cubiertos = new Set(
    yaAsignados.map((r) => r.vencimientoId).filter(Boolean) as string[]
  );

  const resueltos: {
    id: string;
    tax: string;
    concept: string;
    dueDate: string;
    /** Null: el CUIT no es cliente — la tarea va a la columna «Sin cliente». */
    clienteId: string | null;
    clienteNombre: string;
  }[] = [];

  let sinCliente = 0;
  for (const v of vencimientosRaw) {
    if (cubiertos.has(v.id)) continue;
    const resolved = v.clienteId
      ? clienteById[v.clienteId]
      : clienteByCuit[v.cuit];
    if (!resolved) sinCliente++;
    resueltos.push({
      id: v.id,
      tax: v.tax,
      concept: v.concept,
      dueDate: v.dueDate,
      clienteId: resolved?.id ?? null,
      clienteNombre: resolved?.name ?? `CUIT ${v.cuit}`,
    });
  }

  if (resueltos.length === 0)
    return finalizar({
      creadas: 0,
      omitidas: cubiertos.size,
      sinCliente: 0,
      itemsAgregados: 0,
      porPeriodo: {},
    });

  const grupos = new Map<
    string,
    {
      tipo: TipoTarea;
      taxLabel: string;
      concept: string;
      fecha: string;
      periodo: string;
      /** El grupo entero va a la columna «Sin cliente» del tablero. */
      sinCliente: boolean;
      items: { clienteId: string | null; vencimientoId: string }[];
    }
  >();

  for (const v of resueltos) {
    const tipo = taxToTipo(v.tax);
    const esSinCliente = v.clienteId === null;
    // Los sin cliente se agrupan aparte: son otra tarea, en otra columna.
    const key = `${tipo}|${v.dueDate}|${esSinCliente ? 'sc' : 'ok'}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        tipo,
        taxLabel: v.tax,
        concept: v.concept,
        fecha: v.dueDate,
        // El período sale del vencimiento, no de la corrida: una misma tanda
        // puede crear tareas de septiembre y de octubre.
        periodo: v.dueDate.slice(0, 7),
        sinCliente: esSinCliente,
        items: [],
      });
    }
    grupos
      .get(key)!
      .items.push({ clienteId: v.clienteId, vencimientoId: v.id });
  }

  /**
   * Las tareas nuevas entran por la primera columna del tablero — la de más a
   * la izquierda según el orden del estudio, salvo Archivadas. Sin esto caían
   * con columna null en el carril «Sin columna», que existe para huérfanas,
   * no como bandeja de entrada. Si el estudio no armó columnas todavía, null
   * sigue siendo el fallback correcto.
   */
  const [primeraColumna] = await db
    .select({ id: tareaColumna.id })
    .from(tareaColumna)
    .where(
      sql`${tareaColumna.orgId} = ${orgId} and coalesce(${tareaColumna.clave}, '') <> 'archivadas'`
    )
    .orderBy(asc(tareaColumna.orden), asc(tareaColumna.createdAt))
    .limit(1);

  // La columna «Sin cliente» se crea recién si esta corrida la necesita.
  const columnaSinClienteId = [...grupos.values()].some((g) => g.sinCliente)
    ? await asegurarColumnaSinCliente(orgId)
    : null;

  let creadas = 0;
  let itemsAgregados = 0;
  const porPeriodo: Record<string, number> = {};

  for (const grupo of grupos.values()) {
    const fechaDate = new Date(grupo.fecha + 'T12:00:00Z');
    const fechaStr = fechaDate.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const titulo = `${grupo.taxLabel}${grupo.concept ? ` — ${grupo.concept}` : ''} · vence ${fechaStr}`;
    // Fuente distinta a propósito: si compartieran 'automatica', la búsqueda
    // de abajo fusionaría los sin-cliente con la tarea normal del período.
    const fuente = grupo.sinCliente ? 'automatica_sin_cliente' : 'automatica';

    const [existing] = await db
      .select({ id: tarea.id })
      .from(tarea)
      .where(
        and(
          eq(tarea.orgId, orgId),
          eq(tarea.tipo, grupo.tipo),
          eq(tarea.periodo, grupo.periodo),
          eq(tarea.fuente, fuente)
        )
      )
      .limit(1);

    const tareaId = existing
      ? existing.id
      : await db
          .insert(tarea)
          .values({
            orgId,
            titulo,
            descripcion: grupo.sinCliente
              ? 'Vencimientos de CUITs que no corresponden a ningún cliente cargado. Al dar de alta el cliente, movela a su columna o reasignala.'
              : null,
            tipo: grupo.tipo,
            estado: 'pendiente',
            periodo: grupo.periodo,
            venceAt: fechaDate,
            fuente,
            creadoPor,
            columnaId: grupo.sinCliente
              ? columnaSinClienteId
              : (primeraColumna?.id ?? null),
          })
          .returning()
          .then((r) => r[0].id);

    if (!existing) {
      creadas++;
      porPeriodo[grupo.periodo] = (porPeriodo[grupo.periodo] ?? 0) + 1;
    }

    for (const item of grupo.items) {
      const insertadas = await db
        .insert(tareaCliente)
        .values({
          tareaId,
          clienteId: item.clienteId,
          vencimientoId: item.vencimientoId,
          completado: false,
        })
        .onConflictDoNothing()
        .returning({ id: tareaCliente.id });
      itemsAgregados += insertadas.length;
    }
  }

  return finalizar({
    creadas,
    omitidas: cubiertos.size,
    sinCliente,
    itemsAgregados,
    porPeriodo,
  });
}
