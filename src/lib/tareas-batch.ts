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
  cliente,
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
    return {
      creadas: 0,
      omitidas: 0,
      sinCliente: 0,
      itemsAgregados: 0,
      porPeriodo: {},
    };

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
    return {
      creadas: 0,
      omitidas: cubiertos.size,
      sinCliente: 0,
      itemsAgregados: 0,
      porPeriodo: {},
    };

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

  return {
    creadas,
    omitidas: cubiertos.size,
    sinCliente,
    itemsAgregados,
    porPeriodo,
  };
}
