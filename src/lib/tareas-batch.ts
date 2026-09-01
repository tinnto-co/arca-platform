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
  sinCliente: number;
  /** Tareas creadas por período (YYYY-MM), para poder contarlo en la UI. */
  porPeriodo: Record<string, number>;
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

  if (orgClientes.length === 0)
    return { creadas: 0, omitidas: 0, sinCliente: 0, porPeriodo: {} };

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
    return { creadas: 0, omitidas: 0, sinCliente: 0, porPeriodo: {} };

  const vencimientoIds = vencimientosRaw.map((v) => v.id);
  const yaAsignados = await db
    .select({ vencimientoId: tareaCliente.vencimientoId })
    .from(tareaCliente)
    .where(inArray(tareaCliente.vencimientoId, vencimientoIds));

  const cubiertos = new Set(
    yaAsignados.map((r) => r.vencimientoId).filter(Boolean) as string[]
  );

  let sinCliente = 0;
  const resueltos: {
    id: string;
    tax: string;
    concept: string;
    dueDate: string;
    clienteId: string;
    clienteNombre: string;
  }[] = [];

  for (const v of vencimientosRaw) {
    if (cubiertos.has(v.id)) continue;
    const resolved = v.clienteId
      ? clienteById[v.clienteId]
      : clienteByCuit[v.cuit];
    if (!resolved) {
      sinCliente++;
      continue;
    }
    resueltos.push({
      id: v.id,
      tax: v.tax,
      concept: v.concept,
      dueDate: v.dueDate,
      clienteId: resolved.id,
      clienteNombre: resolved.name,
    });
  }

  if (resueltos.length === 0)
    return {
      creadas: 0,
      omitidas: cubiertos.size,
      sinCliente,
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
      items: { clienteId: string; vencimientoId: string }[];
    }
  >();

  for (const v of resueltos) {
    const tipo = taxToTipo(v.tax);
    const key = `${tipo}|${v.dueDate}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        tipo,
        taxLabel: v.tax,
        concept: v.concept,
        fecha: v.dueDate,
        // El período sale del vencimiento, no de la corrida: una misma tanda
        // puede crear tareas de septiembre y de octubre.
        periodo: v.dueDate.slice(0, 7),
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

  let creadas = 0;
  const porPeriodo: Record<string, number> = {};

  for (const grupo of grupos.values()) {
    const fechaDate = new Date(grupo.fecha + 'T12:00:00Z');
    const fechaStr = fechaDate.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    const titulo = `${grupo.taxLabel}${grupo.concept ? ` — ${grupo.concept}` : ''} · vence ${fechaStr}`;

    const [existing] = await db
      .select({ id: tarea.id })
      .from(tarea)
      .where(
        and(
          eq(tarea.orgId, orgId),
          eq(tarea.tipo, grupo.tipo),
          eq(tarea.periodo, grupo.periodo),
          eq(tarea.fuente, 'automatica')
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
            tipo: grupo.tipo,
            estado: 'pendiente',
            periodo: grupo.periodo,
            venceAt: fechaDate,
            fuente: 'automatica',
            creadoPor,
            columnaId: primeraColumna?.id ?? null,
          })
          .returning()
          .then((r) => r[0]!.id);

    if (!existing) {
      creadas++;
      porPeriodo[grupo.periodo] = (porPeriodo[grupo.periodo] ?? 0) + 1;
    }

    for (const item of grupo.items) {
      await db
        .insert(tareaCliente)
        .values({
          tareaId,
          clienteId: item.clienteId,
          vencimientoId: item.vencimientoId,
          completado: false,
        })
        .onConflictDoNothing();
    }
  }

  return { creadas, omitidas: cubiertos.size, sinCliente, porPeriodo };
}
