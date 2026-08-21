import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { db } from '@/lib/db';
import { and, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import {
  tarea,
  tareaCliente,
  tareaComentario,
  tareaColumna,
  cliente,
} from '@/drizzle/schema';
import { autoGenerarTareasParaOrg } from '@/lib/tareas-batch';
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
      periodo: z.string().optional(),
      tipo: z.string().optional(),
      asignadoA: z.string().optional(),
      clienteId: z.string().uuid().optional(),
      vencimientoHasta: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const conditions = [eq(tarea.orgId, orgId)];
    if (ctx.data.periodo) {
      conditions.push(eq(tarea.periodo, ctx.data.periodo));
    }
    if (ctx.data.tipo) {
      conditions.push(eq(tarea.tipo, ctx.data.tipo));
    }
    if (ctx.data.asignadoA) {
      if (ctx.data.asignadoA === 'sin_asignar') {
        conditions.push(isNull(tarea.asignadoA));
      } else {
        conditions.push(eq(tarea.asignadoA, ctx.data.asignadoA));
      }
    }
    if (ctx.data.clienteId) {
      const taskIdsWithRep = await db
        .select({ tareaId: tareaCliente.tareaId })
        .from(tareaCliente)
        .where(eq(tareaCliente.clienteId, ctx.data.clienteId));
      const ids = taskIdsWithRep.map((r) => r.tareaId);
      if (ids.length === 0) return [];
      conditions.push(inArray(tarea.id, ids));
    }
    if (ctx.data.vencimientoHasta) {
      conditions.push(lte(tarea.venceAt, new Date(ctx.data.vencimientoHasta)));
    }

    const tareas = await db
      .select({
        id: tarea.id,
        titulo: tarea.titulo,
        descripcion: tarea.descripcion,
        tipo: tarea.tipo,
        estado: tarea.estado,
        columnaId: tarea.columnaId,
        asignadoA: tarea.asignadoA,
        asignadoNombre: user.name,
        periodo: tarea.periodo,
        venceAt: tarea.venceAt,
        fuente: tarea.fuente,
        estadoCambiadoAt: tarea.estadoCambiadoAt,
        estadoCambiadoPor: tarea.estadoCambiadoPor,
        creadoPor: tarea.creadoPor,
        createdAt: tarea.createdAt,
        updatedAt: tarea.updatedAt,
      })
      .from(tarea)
      .leftJoin(user, eq(tarea.asignadoA, user.id))
      .where(and(...conditions))
      .orderBy(tarea.venceAt, tarea.createdAt);

    if (tareas.length === 0) return [];

    const taskIds = tareas.map((t) => t.id);

    const [clientes, comments] = await Promise.all([
      db
        .select({
          tareaId: tareaCliente.tareaId,
          id: tareaCliente.id,
          clienteId: tareaCliente.clienteId,
          clienteNombre: cliente.razonSocial,
          completado: tareaCliente.completado,
          completadoAt: tareaCliente.completadoAt,
          completadoPor: tareaCliente.completadoPor,
        })
        .from(tareaCliente)
        .leftJoin(cliente, eq(tareaCliente.clienteId, cliente.id))
        .where(inArray(tareaCliente.tareaId, taskIds)),
      db
        .select({ tareaId: tareaComentario.tareaId, count: tareaComentario.id })
        .from(tareaComentario)
        .where(inArray(tareaComentario.tareaId, taskIds)),
    ]);

    const clientesByTarea = clientes.reduce<Record<string, typeof clientes>>(
      (acc, c) => {
        if (!acc[c.tareaId]) acc[c.tareaId] = [];
        acc[c.tareaId].push(c);
        return acc;
      },
      {}
    );

    const commentCountByTarea = comments.reduce<Record<string, number>>(
      (acc, c) => {
        acc[c.tareaId] = (acc[c.tareaId] ?? 0) + 1;
        return acc;
      },
      {}
    );

    return tareas.map((t) => ({
      ...t,
      clientes: clientesByTarea[t.id] ?? [],
      comentariosCount: commentCountByTarea[t.id] ?? 0,
    }));
  });

/** Devuelve los comentarios de una tarea específica. */
export const listTareaComments = createServerFn({ method: 'GET' })
  .validator(z.object({ tareaId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [task] = await db
      .select({ id: tarea.id })
      .from(tarea)
      .where(and(eq(tarea.id, ctx.data.tareaId), eq(tarea.orgId, orgId)))
      .limit(1);
    if (!task) throw new Error('Tarea no encontrada');

    return db
      .select({
        id: tareaComentario.id,
        contenido: tareaComentario.contenido,
        createdAt: tareaComentario.createdAt,
        autorId: tareaComentario.autorId,
        autorNombre: user.name,
      })
      .from(tareaComentario)
      .leftJoin(user, eq(tareaComentario.autorId, user.id))
      .where(eq(tareaComentario.tareaId, ctx.data.tareaId))
      .orderBy(tareaComentario.createdAt);
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
      asignadoA: z.string().optional().nullable(),
      periodo: z.string().optional().nullable(),
      venceAt: z.string().optional().nullable(),
      columnaId: z.string().uuid().optional().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [task] = await db
      .insert(tarea)
      .values({
        orgId,
        titulo: ctx.data.titulo.trim(),
        descripcion: ctx.data.descripcion?.trim() || null,
        tipo: ctx.data.tipo,
        estado: 'pendiente',
        columnaId: ctx.data.columnaId || null,
        asignadoA: ctx.data.asignadoA || null,
        periodo: ctx.data.periodo || null,
        venceAt: ctx.data.venceAt
          ? new Date(ctx.data.venceAt)
          : null,
        fuente: 'manual',
        creadoPor: userId,
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
      asignadoA: z.string().optional().nullable(),
      periodo: z.string().optional().nullable(),
      venceAt: z.string().optional().nullable(),
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
    if (ctx.data.asignadoA !== undefined) set.asignadoA = ctx.data.asignadoA || null;
    if (ctx.data.periodo !== undefined) set.periodo = ctx.data.periodo || null;
    if (ctx.data.venceAt !== undefined) {
      set.venceAt = ctx.data.venceAt
        ? new Date(ctx.data.venceAt)
        : null;
    }

    await db
      .update(tarea)
      .set(set)
      .where(and(eq(tarea.id, ctx.data.id), eq(tarea.orgId, orgId)));

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
      .update(tarea)
      .set({
        estado: ctx.data.estado,
        estadoCambiadoAt: new Date(),
        estadoCambiadoPor: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(tarea.id, ctx.data.id), eq(tarea.orgId, orgId)));

    return { ok: true };
  });

export const deleteTarea = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await db
      .delete(tarea)
      .where(and(eq(tarea.id, ctx.data.id), eq(tarea.orgId, orgId)));

    return { ok: true };
  });

// ─── Empresas dentro de una tarea ────────────────────────────────────────────

/** Marca o desmarca una empresa dentro de una tarea. Cuando todas quedan marcadas → pasa a "presentada". */
export const toggleTareaCliente = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      tareaClienteId: z.string().uuid(),
      completado: z.boolean(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Obtener la tarea para validar org
    const [tc] = await db
      .select({ tareaId: tareaCliente.tareaId })
      .from(tareaCliente)
      .where(eq(tareaCliente.id, ctx.data.tareaClienteId))
      .limit(1);
    if (!tc) throw new Error('Empresa no encontrada en esta tarea');

    const [task] = await db
      .select({ id: tarea.id, estado: tarea.estado })
      .from(tarea)
      .where(and(eq(tarea.id, tc.tareaId), eq(tarea.orgId, orgId)))
      .limit(1);
    if (!task) throw new Error('Tarea no encontrada');

    // Actualizar el check
    await db
      .update(tareaCliente)
      .set({
        completado: ctx.data.completado,
        completadoAt: ctx.data.completado ? new Date() : null,
        completadoPor: ctx.data.completado ? userId : null,
      })
      .where(eq(tareaCliente.id, ctx.data.tareaClienteId));

    return { ok: true };
  });

// ─── Comentarios ─────────────────────────────────────────────────────────────

export const addTareaComment = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      tareaId: z.string().uuid(),
      contenido: z.string().min(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [task] = await db
      .select({ id: tarea.id })
      .from(tarea)
      .where(and(eq(tarea.id, ctx.data.tareaId), eq(tarea.orgId, orgId)))
      .limit(1);
    if (!task) throw new Error('Tarea no encontrada');

    const [comment] = await db
      .insert(tareaComentario)
      .values({
        tareaId: ctx.data.tareaId,
        autorId: userId,
        contenido: ctx.data.contenido.trim(),
      })
      .returning();

    return comment;
  });

// ─── Columnas del kanban ──────────────────────────────────────────────────────

export const listColumnas = createServerFn({ method: 'GET' }).handler(async () => {
  const { orgId } = await getSessionWithOrg();
  return db
    .select()
    .from(tareaColumna)
    .where(eq(tareaColumna.orgId, orgId))
    .orderBy(tareaColumna.orden, tareaColumna.createdAt);
});

export const createColumna = createServerFn({ method: 'POST' })
  .validator(z.object({ nombre: z.string().min(1) }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [last] = await db
      .select({ orden: tareaColumna.orden })
      .from(tareaColumna)
      .where(eq(tareaColumna.orgId, orgId))
      .orderBy(desc(tareaColumna.orden))
      .limit(1);

    const nextOrden = last ? last.orden + 1 : 0;

    const [col] = await db
      .insert(tareaColumna)
      .values({ orgId, nombre: ctx.data.nombre.trim(), orden: nextOrden })
      .returning();
    return col;
  });

export const updateColumna = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), nombre: z.string().min(1) }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await db
      .update(tareaColumna)
      .set({ nombre: ctx.data.nombre.trim() })
      .where(and(eq(tareaColumna.id, ctx.data.id), eq(tareaColumna.orgId, orgId)));

    return { ok: true };
  });

export const deleteColumna = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Desasignar tareas de esta columna
    await db
      .update(tarea)
      .set({ columnaId: null })
      .where(and(eq(tarea.columnaId, ctx.data.id), eq(tarea.orgId, orgId)));

    await db
      .delete(tareaColumna)
      .where(and(eq(tareaColumna.id, ctx.data.id), eq(tareaColumna.orgId, orgId)));

    return { ok: true };
  });

export const reorderColumnas = createServerFn({ method: 'POST' })
  .validator(z.object({ ids: z.array(z.string().uuid()) }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await Promise.all(
      ctx.data.ids.map((id, orden) =>
        db
          .update(tareaColumna)
          .set({ orden })
          .where(and(eq(tareaColumna.id, id), eq(tareaColumna.orgId, orgId)))
      )
    );

    return { ok: true };
  });

export const moverTarea = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), columnaId: z.string().uuid().nullable() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await db
      .update(tarea)
      .set({ columnaId: ctx.data.columnaId, updatedAt: new Date() })
      .where(and(eq(tarea.id, ctx.data.id), eq(tarea.orgId, orgId)));

    return { ok: true };
  });

// ─── Auto-generación desde vencimientos ──────────────────────────────────────

export const autoGenerarTareas = createServerFn({ method: 'POST' })
  .validator(z.object({ periodo: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    return autoGenerarTareasParaOrg(orgId, ctx.data.periodo, userId);
  });
