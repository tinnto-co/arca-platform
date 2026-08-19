import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { db } from '@/lib/db';
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import {
  studioTask,
  studioTaskClient,
  studioTaskComment,
  cliente,
  vencimiento,
} from '@/drizzle/schema';
import { user, member } from '@/drizzle/auth';
import { getSessionWithOrg, getMemberRole, assertCanWrite } from './helpers';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoTarea = 'iva' | 'iibb' | 'ddjj' | 'sueldos' | 'convenios' | 'otro';
export type EstadoTarea = 'pendiente' | 'presentada' | 'verificada';

// ─── Listado ─────────────────────────────────────────────────────────────────

/** Devuelve todas las tareas del estudio con sus empresas y comentarios agregados. */
export const listTareas = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      periodoMes: z.string().optional(),
      tipo: z.string().optional(),
      asignadoAUserId: z.string().optional(),
      representativeId: z.string().uuid().optional(),
      vencimientoHasta: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const conditions = [eq(studioTask.organizationId, orgId)];
    if (ctx.data.periodoMes) {
      conditions.push(eq(studioTask.periodoMes, ctx.data.periodoMes));
    }
    if (ctx.data.tipo) {
      conditions.push(eq(studioTask.tipo, ctx.data.tipo));
    }
    if (ctx.data.asignadoAUserId) {
      if (ctx.data.asignadoAUserId === 'sin_asignar') {
        conditions.push(isNull(studioTask.asignadoAUserId));
      } else {
        conditions.push(eq(studioTask.asignadoAUserId, ctx.data.asignadoAUserId));
      }
    }
    if (ctx.data.representativeId) {
      const taskIdsWithRep = await db
        .select({ taskId: studioTaskClient.taskId })
        .from(studioTaskClient)
        .where(eq(studioTaskClient.representativeId, ctx.data.representativeId!));
      const ids = taskIdsWithRep.map((r) => r.taskId);
      if (ids.length === 0) return [];
      conditions.push(inArray(studioTask.id, ids));
    }
    if (ctx.data.vencimientoHasta) {
      conditions.push(lte(studioTask.fechaVencimiento, new Date(ctx.data.vencimientoHasta)));
    }

    const tareas = await db
      .select({
        id: studioTask.id,
        titulo: studioTask.titulo,
        descripcion: studioTask.descripcion,
        tipo: studioTask.tipo,
        estado: studioTask.estado,
        asignadoAUserId: studioTask.asignadoAUserId,
        asignadoNombre: user.name,
        periodoMes: studioTask.periodoMes,
        fechaVencimiento: studioTask.fechaVencimiento,
        esAutoGenerada: studioTask.esAutoGenerada,
        estadoChangedAt: studioTask.estadoChangedAt,
        estadoChangedByUserId: studioTask.estadoChangedByUserId,
        createdByUserId: studioTask.createdByUserId,
        createdAt: studioTask.createdAt,
        updatedAt: studioTask.updatedAt,
      })
      .from(studioTask)
      .leftJoin(user, eq(studioTask.asignadoAUserId, user.id))
      .where(and(...conditions))
      .orderBy(studioTask.fechaVencimiento, studioTask.createdAt);

    if (tareas.length === 0) return [];

    const taskIds = tareas.map((t) => t.id);

    const [clientes, comments] = await Promise.all([
      db
        .select({
          taskId: studioTaskClient.taskId,
          id: studioTaskClient.id,
          representativeId: studioTaskClient.representativeId,
          representativeNombre: cliente.razonSocial,
          completado: studioTaskClient.completado,
          completadoAt: studioTaskClient.completadoAt,
          completadoByUserId: studioTaskClient.completadoByUserId,
        })
        .from(studioTaskClient)
        .leftJoin(cliente, eq(studioTaskClient.representativeId, cliente.id))
        .where(inArray(studioTaskClient.taskId, taskIds)),
      db
        .select({ taskId: studioTaskComment.taskId, count: studioTaskComment.id })
        .from(studioTaskComment)
        .where(inArray(studioTaskComment.taskId, taskIds)),
    ]);

    const clientesByTask = clientes.reduce<Record<string, typeof clientes>>(
      (acc, c) => {
        if (!acc[c.taskId]) acc[c.taskId] = [];
        acc[c.taskId].push(c);
        return acc;
      },
      {}
    );

    const commentCountByTask = comments.reduce<Record<string, number>>(
      (acc, c) => {
        acc[c.taskId] = (acc[c.taskId] ?? 0) + 1;
        return acc;
      },
      {}
    );

    return tareas.map((t) => ({
      ...t,
      clientes: clientesByTask[t.id] ?? [],
      comentariosCount: commentCountByTask[t.id] ?? 0,
    }));
  });

/** Devuelve los comentarios de una tarea específica. */
export const listTareaComments = createServerFn({ method: 'GET' })
  .validator(z.object({ taskId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [task] = await db
      .select({ id: studioTask.id })
      .from(studioTask)
      .where(and(eq(studioTask.id, ctx.data.taskId), eq(studioTask.organizationId, orgId)))
      .limit(1);
    if (!task) throw new Error('Tarea no encontrada');

    return db
      .select({
        id: studioTaskComment.id,
        contenido: studioTaskComment.contenido,
        createdAt: studioTaskComment.createdAt,
        userId: studioTaskComment.userId,
        userName: user.name,
      })
      .from(studioTaskComment)
      .leftJoin(user, eq(studioTaskComment.userId, user.id))
      .where(eq(studioTaskComment.taskId, ctx.data.taskId))
      .orderBy(studioTaskComment.createdAt);
  });

/** Devuelve los miembros de la org para el selector de asignados. */
export const listOrgMembers = createServerFn({ method: 'GET' }).handler(async () => {
  const { orgId } = await getSessionWithOrg();
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .innerJoin(member, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(user.name);
});

/** Devuelve los clientes (empresas) de la org para el filtro. */
export const listOrgRepresentatives = createServerFn({ method: 'GET' }).handler(async () => {
  const { orgId } = await getSessionWithOrg();
  return db
    .select({ id: cliente.id, name: cliente.razonSocial })
    .from(cliente)
    .where(eq(cliente.orgId, orgId))
    .orderBy(cliente.razonSocial);
});

// ─── Creación ─────────────────────────────────────────────────────────────────

export const createTarea = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      titulo: z.string().min(1),
      descripcion: z.string().optional(),
      tipo: z.enum(['iva', 'iibb', 'ddjj', 'sueldos', 'convenios', 'otro']),
      asignadoAUserId: z.string().optional().nullable(),
      periodoMes: z.string().optional().nullable(),
      fechaVencimiento: z.string().optional().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [task] = await db
      .insert(studioTask)
      .values({
        organizationId: orgId,
        titulo: ctx.data.titulo.trim(),
        descripcion: ctx.data.descripcion?.trim() || null,
        tipo: ctx.data.tipo,
        estado: 'pendiente',
        asignadoAUserId: ctx.data.asignadoAUserId || null,
        periodoMes: ctx.data.periodoMes || null,
        fechaVencimiento: ctx.data.fechaVencimiento
          ? new Date(ctx.data.fechaVencimiento)
          : null,
        esAutoGenerada: false,
        createdByUserId: userId,
      })
      .returning();

    return task;
  });

// ─── Actualización ───────────────────────────────────────────────────────────

export const updateTarea = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      titulo: z.string().min(1).optional(),
      descripcion: z.string().optional().nullable(),
      tipo: z.enum(['iva', 'iibb', 'ddjj', 'sueldos', 'convenios', 'otro']).optional(),
      asignadoAUserId: z.string().optional().nullable(),
      periodoMes: z.string().optional().nullable(),
      fechaVencimiento: z.string().optional().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (ctx.data.titulo !== undefined) set.titulo = ctx.data.titulo.trim();
    if (ctx.data.descripcion !== undefined) set.descripcion = ctx.data.descripcion?.trim() || null;
    if (ctx.data.tipo !== undefined) set.tipo = ctx.data.tipo;
    if (ctx.data.asignadoAUserId !== undefined) set.asignadoAUserId = ctx.data.asignadoAUserId || null;
    if (ctx.data.periodoMes !== undefined) set.periodoMes = ctx.data.periodoMes || null;
    if (ctx.data.fechaVencimiento !== undefined) {
      set.fechaVencimiento = ctx.data.fechaVencimiento
        ? new Date(ctx.data.fechaVencimiento)
        : null;
    }

    await db
      .update(studioTask)
      .set(set)
      .where(and(eq(studioTask.id, ctx.data.id), eq(studioTask.organizationId, orgId)));

    return { ok: true };
  });

/** Cambia el estado de una tarea y registra quién y cuándo lo hizo. */
export const updateEstadoTarea = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      estado: z.enum(['pendiente', 'presentada', 'verificada']),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await db
      .update(studioTask)
      .set({
        estado: ctx.data.estado,
        estadoChangedAt: new Date(),
        estadoChangedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(studioTask.id, ctx.data.id), eq(studioTask.organizationId, orgId)));

    return { ok: true };
  });

export const deleteTarea = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await db
      .delete(studioTask)
      .where(and(eq(studioTask.id, ctx.data.id), eq(studioTask.organizationId, orgId)));

    return { ok: true };
  });

// ─── Empresas dentro de una tarea ────────────────────────────────────────────

/** Marca o desmarca una empresa dentro de una tarea. Cuando todas quedan marcadas → pasa a "presentada". */
export const toggleTareaCliente = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      taskClientId: z.string().uuid(),
      completado: z.boolean(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Obtener la tarea para validar org
    const [tc] = await db
      .select({ taskId: studioTaskClient.taskId })
      .from(studioTaskClient)
      .where(eq(studioTaskClient.id, ctx.data.taskClientId))
      .limit(1);
    if (!tc) throw new Error('Empresa no encontrada en esta tarea');

    const [task] = await db
      .select({ id: studioTask.id, estado: studioTask.estado })
      .from(studioTask)
      .where(and(eq(studioTask.id, tc.taskId), eq(studioTask.organizationId, orgId)))
      .limit(1);
    if (!task) throw new Error('Tarea no encontrada');

    // Actualizar el check
    await db
      .update(studioTaskClient)
      .set({
        completado: ctx.data.completado,
        completadoAt: ctx.data.completado ? new Date() : null,
        completadoByUserId: ctx.data.completado ? userId : null,
      })
      .where(eq(studioTaskClient.id, ctx.data.taskClientId));

    // Si se marcó como completado, verificar si todas las empresas están completas
    if (ctx.data.completado && task.estado === 'pendiente') {
      const pendientes = await db
        .select({ id: studioTaskClient.id })
        .from(studioTaskClient)
        .where(
          and(
            eq(studioTaskClient.taskId, tc.taskId),
            eq(studioTaskClient.completado, false)
          )
        )
        .limit(1);

      if (pendientes.length === 0) {
        await db
          .update(studioTask)
          .set({
            estado: 'presentada',
            estadoChangedAt: new Date(),
            estadoChangedByUserId: userId,
            updatedAt: new Date(),
          })
          .where(eq(studioTask.id, tc.taskId));
      }
    }

    return { ok: true };
  });

// ─── Comentarios ─────────────────────────────────────────────────────────────

export const addTareaComment = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      taskId: z.string().uuid(),
      contenido: z.string().min(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [task] = await db
      .select({ id: studioTask.id })
      .from(studioTask)
      .where(and(eq(studioTask.id, ctx.data.taskId), eq(studioTask.organizationId, orgId)))
      .limit(1);
    if (!task) throw new Error('Tarea no encontrada');

    const [comment] = await db
      .insert(studioTaskComment)
      .values({
        taskId: ctx.data.taskId,
        userId,
        contenido: ctx.data.contenido.trim(),
      })
      .returning();

    return comment;
  });

// ─── Auto-generación desde vencimientos ──────────────────────────────────────

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

/**
 * Auto-genera tareas para un período dado a partir de los vencimientos scrapeados.
 * Agrupa por (tax + fecha) → mismo impuesto y misma fecha = una sola tarea con N empresas.
 * No duplica tareas que ya existen para el mismo período/tipo/fecha.
 */
export const autoGenerarTareas = createServerFn({ method: 'POST' })
  .validator(z.object({ periodoMes: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [year, month] = ctx.data.periodoMes.split('-').map(Number) as [number, number];
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59, 999);

    // Traer todos los vencimientos del período para esta org
    const orgReps = await db
      .select({ id: cliente.id, name: cliente.razonSocial })
      .from(cliente)
      .where(eq(cliente.orgId, orgId));

    if (orgReps.length === 0) return { creadas: 0, omitidas: 0 };

    const repIds = orgReps.map((r) => r.id);
    const repMap = Object.fromEntries(orgReps.map((r) => [r.id, r.name]));

    const vencimientos = await db
      .select({
        id: vencimiento.id,
        tax: vencimiento.impuesto,
        concept: vencimiento.concepto,
        dueDate: vencimiento.venceAt,
        representativeId: vencimiento.clienteId,
      })
      .from(vencimiento)
      .where(
        and(
          inArray(vencimiento.clienteId, repIds),
          gte(vencimiento.venceAt, from.toISOString().split('T')[0]),
          lte(vencimiento.venceAt, to.toISOString().split('T')[0])
        )
      );

    if (vencimientos.length === 0) return { creadas: 0, omitidas: 0 };

    // Traer tareas auto-generadas existentes para este período (evitar duplicados)
    const existentes = await db
      .select({
        tipo: studioTask.tipo,
        fechaVencimiento: studioTask.fechaVencimiento,
      })
      .from(studioTask)
      .where(
        and(
          eq(studioTask.organizationId, orgId),
          eq(studioTask.periodoMes, ctx.data.periodoMes),
          eq(studioTask.esAutoGenerada, true)
        )
      );

    const existenteKeys = new Set(
      existentes.map(
        (e) =>
          `${e.tipo}|${e.fechaVencimiento ? new Date(e.fechaVencimiento).toDateString() : ''}`
      )
    );

    // Agrupar vencimientos por (tipo + fecha)
    const grupos = new Map<
      string,
      {
        tipo: TipoTarea;
        taxLabel: string;
        concept: string;
        fecha: Date;
        reps: { id: string; nombre: string }[];
      }
    >();

    for (const v of vencimientos) {
      if (!v.representativeId) continue;
      const tipo = taxToTipo(v.tax);
      const fecha = new Date(v.dueDate);
      const key = `${tipo}|${fecha.toDateString()}`;

      if (!grupos.has(key)) {
        grupos.set(key, {
          tipo,
          taxLabel: v.tax,
          concept: v.concept,
          fecha,
          reps: [],
        });
      }
      grupos.get(key)!.reps.push({
        id: v.representativeId,
        nombre: repMap[v.representativeId] ?? v.representativeId,
      });
    }

    let creadas = 0;
    let omitidas = 0;

    for (const [key, grupo] of grupos) {
      if (existenteKeys.has(key)) {
        omitidas++;
        continue;
      }

      const fechaStr = grupo.fecha.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
      });
      const titulo = `${grupo.taxLabel}${grupo.concept ? ` — ${grupo.concept}` : ''} · vence ${fechaStr}`;

      const [task] = await db
        .insert(studioTask)
        .values({
          organizationId: orgId,
          titulo,
          tipo: grupo.tipo,
          estado: 'pendiente',
          periodoMes: ctx.data.periodoMes,
          fechaVencimiento: grupo.fecha,
          esAutoGenerada: true,
          createdByUserId: userId,
        })
        .returning();

      if (task && grupo.reps.length > 0) {
        await db.insert(studioTaskClient).values(
          grupo.reps.map((r) => ({
            taskId: task.id,
            representativeId: r.id,
            completado: false,
          }))
        );
      }

      creadas++;
    }

    return { creadas, omitidas };
  });
