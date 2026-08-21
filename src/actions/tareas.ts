import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { generateKeyBetween } from 'fractional-indexing';
import { db } from '@/lib/db';
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
} from 'drizzle-orm';
import {
  tarea,
  tareaCliente,
  tareaComentario,
  tareaColumna,
  tareaPaso,
  cliente,
} from '@/drizzle/schema';
import { autoGenerarTareasParaOrg } from '@/lib/tareas-batch';
import { user, member } from '@/drizzle/auth';
import { getSessionWithOrg, getMemberRole, assertCanWrite } from './helpers';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export const TIPOS_TAREA = [
  'iva',
  'iibb',
  'ddjj',
  'sueldos',
  'convenios',
  'otro',
] as const;
export const ESTADOS_TAREA = ['pendiente', 'presentada', 'verificada'] as const;

export type TipoTarea = (typeof TIPOS_TAREA)[number];
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

// ─── Listado ─────────────────────────────────────────────────────────────────

/** Devuelve todas las tareas del estudio con sus empresas y comentarios agregados. */
export const listTareas = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      periodo: z.string().optional(),
      tipo: z.enum(TIPOS_TAREA).optional(),
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
        posicion: tarea.posicion,
        createdAt: tarea.createdAt,
        updatedAt: tarea.updatedAt,
      })
      .from(tarea)
      .leftJoin(user, eq(tarea.asignadoA, user.id))
      .where(and(...conditions))
      // `posicion` es un índice fraccional: una clave de texto que ordena
      // entre sus vecinas. La columna es `collate "C"` para que el orden sea
      // por bytes — glibc y musl ordenan distinto y el tablero saldría
      // desordenado en producción pero no en desarrollo.
      // Las que todavía no tienen posición caen al final con el orden viejo.
      .orderBy(
        sql`${tarea.posicion} asc nulls last`,
        tarea.venceAt,
        tarea.createdAt
      );

    if (tareas.length === 0) return [];

    const taskIds = tareas.map((t) => t.id);

    const [clientes, pasos, comments] = await Promise.all([
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
        .select({
          tareaId: tareaPaso.tareaId,
          id: tareaPaso.id,
          titulo: tareaPaso.titulo,
          completado: tareaPaso.completado,
          completadoAt: tareaPaso.completadoAt,
          posicion: tareaPaso.posicion,
        })
        .from(tareaPaso)
        .where(inArray(tareaPaso.tareaId, taskIds))
        .orderBy(
          sql`${tareaPaso.posicion} asc nulls last`,
          tareaPaso.createdAt
        ),
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

    const pasosByTarea = pasos.reduce<Record<string, typeof pasos>>(
      (acc, p) => {
        if (!acc[p.tareaId]) acc[p.tareaId] = [];
        acc[p.tareaId].push(p);
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
      pasos: pasosByTarea[t.id] ?? [],
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
export const listOrgMembers = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();
    return db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .innerJoin(member, eq(user.id, member.userId))
      .where(eq(member.organizationId, orgId))
      .orderBy(user.name);
  }
);

/** Devuelve los clientes (empresas) de la org para el filtro. */
export const listOrgRepresentatives = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();
    return db
      .select({ id: cliente.id, name: cliente.razonSocial })
      .from(cliente)
      .where(eq(cliente.orgId, orgId))
      .orderBy(cliente.razonSocial);
  }
);

// ─── Posicionamiento ─────────────────────────────────────────────────────────

/**
 * Serializa a quienes calculan una posición sobre la misma lista.
 *
 * Generar una clave fraccional es leer la vecina y escribir entre medio, y eso
 * es una carrera: dos altas seguidas leen el mismo máximo y generan la misma
 * clave. Se reproduce sin querer al cargar un checklist, porque el composer
 * queda abierto y se tipean varios ítems en un segundo.
 *
 * El lock es de transacción: se libera solo al commitear, y sólo bloquea a
 * quien toca la misma lista.
 */
async function conListaBloqueada<T>(
  clave: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${clave}))`);
    return fn(tx);
  });
}

/**
 * Devuelve una clave fraccional anterior a la primera tarea de la columna, o
 * sea: la posición para entrar arriba de todo. `excluirId` saca a la propia
 * tarea del cálculo cuando se la está moviendo.
 */
async function posicionAlPrincipio(
  ejecutor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  orgId: string,
  columnaId: string | null,
  excluirId?: string
): Promise<string> {
  const [primera] = await ejecutor
    .select({ posicion: tarea.posicion })
    .from(tarea)
    .where(
      and(
        eq(tarea.orgId, orgId),
        columnaId === null
          ? isNull(tarea.columnaId)
          : eq(tarea.columnaId, columnaId),
        isNotNull(tarea.posicion),
        ...(excluirId ? [ne(tarea.id, excluirId)] : [])
      )
    )
    .orderBy(sql`${tarea.posicion} asc`)
    .limit(1);

  return generateKeyBetween(null, primera?.posicion ?? null);
}

// ─── Creación ─────────────────────────────────────────────────────────────────

export const createTarea = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      titulo: z.string().min(1),
      descripcion: z.string().optional(),
      tipo: z.enum(TIPOS_TAREA),
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

    // La tarea nueva entra PRIMERA en su columna. Sin esto nacía con
    // `posicion` en null y caía al fondo hasta que alguien la arrastrara.
    const columnaId = ctx.data.columnaId ?? null;
    const task = await conListaBloqueada(
      `tarea:${orgId}:${columnaId ?? ''}`,
      async (tx) => {
        const posicion = await posicionAlPrincipio(tx, orgId, columnaId);
        const [creada] = await tx
          .insert(tarea)
          .values({
            orgId,
            posicion,
            titulo: ctx.data.titulo.trim(),
            descripcion: ctx.data.descripcion?.trim() || null,
            tipo: ctx.data.tipo,
            estado: 'pendiente',
            columnaId,
            asignadoA: ctx.data.asignadoA || null,
            periodo: ctx.data.periodo || null,
            venceAt: ctx.data.venceAt ? new Date(ctx.data.venceAt) : null,
            fuente: 'manual',
            creadoPor: userId,
          })
          .returning();
        return creada;
      }
    );

    return task;
  });

// ─── Actualización ───────────────────────────────────────────────────────────

export const updateTarea = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      titulo: z.string().min(1).optional(),
      descripcion: z.string().optional().nullable(),
      tipo: z.enum(TIPOS_TAREA).optional(),
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
    if (ctx.data.descripcion !== undefined)
      set.descripcion = ctx.data.descripcion?.trim() || null;
    if (ctx.data.tipo !== undefined) set.tipo = ctx.data.tipo;
    if (ctx.data.asignadoA !== undefined)
      set.asignadoA = ctx.data.asignadoA || null;
    if (ctx.data.periodo !== undefined) set.periodo = ctx.data.periodo || null;
    if (ctx.data.venceAt !== undefined) {
      set.venceAt = ctx.data.venceAt ? new Date(ctx.data.venceAt) : null;
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
      estado: z.enum(ESTADOS_TAREA),
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

export const listColumnas = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();
    return db
      .select()
      .from(tareaColumna)
      .where(eq(tareaColumna.orgId, orgId))
      .orderBy(tareaColumna.orden, tareaColumna.createdAt);
  }
);

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
      .where(
        and(eq(tareaColumna.id, ctx.data.id), eq(tareaColumna.orgId, orgId))
      );

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
      .where(
        and(eq(tareaColumna.id, ctx.data.id), eq(tareaColumna.orgId, orgId))
      );

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

/**
 * Mueve una tarea de columna. La posición viaja en la misma escritura: si se
 * mandan las dos por separado la tarjeta aparece un instante en el lugar que
 * tenía en la columna vieja. Sin `posicion` explícita entra primera, igual que
 * una tarea recién creada — es lo que pasa cuando se cambia la columna desde
 * el detalle, donde no hay un punto de drop.
 */
export const moverTarea = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      columnaId: z.string().uuid().nullable(),
      posicion: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await conListaBloqueada(
      `tarea:${orgId}:${ctx.data.columnaId ?? ''}`,
      async (tx) => {
        const posicion =
          ctx.data.posicion ??
          (await posicionAlPrincipio(
            tx,
            orgId,
            ctx.data.columnaId,
            ctx.data.id
          ));

        await tx
          .update(tarea)
          .set({
            columnaId: ctx.data.columnaId,
            posicion,
            updatedAt: new Date(),
          })
          .where(and(eq(tarea.id, ctx.data.id), eq(tarea.orgId, orgId)));
      }
    );

    return { ok: true };
  });

export const reorderTarea = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), posicion: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await db
      .update(tarea)
      .set({ posicion: ctx.data.posicion, updatedAt: new Date() })
      .where(and(eq(tarea.id, ctx.data.id), eq(tarea.orgId, orgId)));
    return { ok: true };
  });

// ─── Checklist (pasos de la tarea) ───────────────────────────────────────────

/**
 * Los pasos son lo que hay que hacer DENTRO de una tarea. No confundir con
 * `tarea_cliente`, que dice a qué empresas alcanza la obligación: esa la llena
 * el generador desde vencimientos y puede estar vacía en una tarea manual.
 */

/** Verifica que la tarea sea de la org antes de tocarle un paso. */
async function tareaDeLaOrg(tareaId: string, orgId: string) {
  const [t] = await db
    .select({ id: tarea.id })
    .from(tarea)
    .where(and(eq(tarea.id, tareaId), eq(tarea.orgId, orgId)))
    .limit(1);
  if (!t) throw new Error('Tarea no encontrada');
  return t;
}

/** Resuelve la tarea de un paso, comprobando de paso que sea de la org. */
async function tareaDelPaso(pasoId: string, orgId: string) {
  const [fila] = await db
    .select({ tareaId: tareaPaso.tareaId })
    .from(tareaPaso)
    .innerJoin(tarea, eq(tarea.id, tareaPaso.tareaId))
    .where(and(eq(tareaPaso.id, pasoId), eq(tarea.orgId, orgId)))
    .limit(1);
  if (!fila) throw new Error('Paso no encontrado');
  return fila.tareaId;
}

export const addTareaPaso = createServerFn({ method: 'POST' })
  .validator(
    z.object({ tareaId: z.string().uuid(), titulo: z.string().min(1) })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await tareaDeLaOrg(ctx.data.tareaId, orgId);

    // Al final de la lista: un checklist se lee de arriba abajo y el paso
    // nuevo es el próximo, no el primero. Al revés que las tarjetas.
    return conListaBloqueada(`tarea_paso:${ctx.data.tareaId}`, async (tx) => {
      const [ultimo] = await tx
        .select({ posicion: tareaPaso.posicion })
        .from(tareaPaso)
        .where(
          and(
            eq(tareaPaso.tareaId, ctx.data.tareaId),
            isNotNull(tareaPaso.posicion)
          )
        )
        .orderBy(sql`${tareaPaso.posicion} desc`)
        .limit(1);

      const [paso] = await tx
        .insert(tareaPaso)
        .values({
          tareaId: ctx.data.tareaId,
          titulo: ctx.data.titulo.trim(),
          posicion: generateKeyBetween(ultimo?.posicion ?? null, null),
        })
        .returning();

      return paso;
    });
  });

export const toggleTareaPaso = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), completado: z.boolean() }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await tareaDelPaso(ctx.data.id, orgId);

    await db
      .update(tareaPaso)
      .set({
        completado: ctx.data.completado,
        completadoAt: ctx.data.completado ? new Date() : null,
        completadoPor: ctx.data.completado ? userId : null,
      })
      .where(eq(tareaPaso.id, ctx.data.id));

    return { ok: true };
  });

export const updateTareaPaso = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), titulo: z.string().min(1) }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await tareaDelPaso(ctx.data.id, orgId);

    await db
      .update(tareaPaso)
      .set({ titulo: ctx.data.titulo.trim() })
      .where(eq(tareaPaso.id, ctx.data.id));

    return { ok: true };
  });

export const deleteTareaPaso = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await tareaDelPaso(ctx.data.id, orgId);

    await db.delete(tareaPaso).where(eq(tareaPaso.id, ctx.data.id));
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
