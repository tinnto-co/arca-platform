import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { GoogleGenAI } from '@google/genai';
import { db } from '@/lib/db';
import {
  notificacion,
  notificacionAdjunto,
  credencialAfip,
  cliente,
  documento,
  evento,
  notificacionSeveridad,
} from '@/drizzle/schema';
import { member, user } from '@/drizzle/auth';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { eq, desc, and, gte, lte, sql, isNull } from 'drizzle-orm';

/**
 * Las notificaciones cuelgan del login de AFIP (`credencial_afip`), no del
 * cliente: AFIP las publica por CUIT del representante y recién después se
 * atribuyen a un cliente, si se puede. `notificacion.org_id` resuelve el
 * multi-tenancy sin pasar por ninguna tabla intermedia.
 */

export const getNotifications = createServerFn({
  method: 'GET',
})
  .validator(
    z.object({
      page: z.number().default(1),
      limit: z.number().default(10),
      credencialFilter: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      clienteId: z.string().optional(),
      search: z.string().optional(),
      leida: z.boolean().optional(),
      categoria: z.string().optional(),
      onlyUnresolved: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const {
      page,
      limit,
      credencialFilter,
      dateFrom,
      dateTo,
      clienteId,
      leida,
      categoria,
      onlyUnresolved,
    } = ctx.data;
    const offset = (page - 1) * limit;

    const conditions = [eq(notificacion.orgId, orgId)];

    if (credencialFilter && credencialFilter !== 'all') {
      conditions.push(eq(notificacion.credencialId, credencialFilter));
    }
    if (clienteId && clienteId !== 'all') {
      conditions.push(eq(notificacion.clienteId, clienteId));
    }
    if (dateFrom) {
      conditions.push(gte(notificacion.publicadaAt, new Date(dateFrom)));
    }
    if (dateTo) {
      conditions.push(lte(notificacion.publicadaAt, new Date(dateTo)));
    }
    if (leida !== undefined) {
      conditions.push(eq(notificacion.leida, leida));
    }
    if (categoria && categoria !== 'all') {
      conditions.push(eq(notificacion.categoria, categoria));
    }
    if (onlyUnresolved) {
      conditions.push(isNull(notificacion.resueltaAt));
    }

    const whereCondition = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notificacion)
      .where(whereCondition);

    const notifications = await db
      .select({
        id: notificacion.id,
        externalId: notificacion.externalId,
        mensaje: notificacion.mensaje,
        publicadaAt: notificacion.publicadaAt,
        venceAt: notificacion.venceAt,
        leida: notificacion.leida,
        credencialId: notificacion.credencialId,
        credencialNombre: credencialAfip.nombre,
        credencialCuit: credencialAfip.cuit,
        credencialEmail: credencialAfip.email,
        clienteId: notificacion.clienteId,
        clienteRazonSocial: cliente.razonSocial,
        clienteCuit: cliente.cuit,
        severidad: notificacion.severidad,
        categoria: notificacion.categoria,
        aiResumen: notificacion.aiResumen,
        asignadaA: notificacion.asignadaA,
        resueltaAt: notificacion.resueltaAt,
        resueltaPor: notificacion.resueltaPor,
        createdAt: notificacion.createdAt,
        updatedAt: notificacion.updatedAt,
      })
      .from(notificacion)
      .innerJoin(
        credencialAfip,
        eq(notificacion.credencialId, credencialAfip.id)
      )
      .leftJoin(cliente, eq(notificacion.clienteId, cliente.id))
      .where(whereCondition)
      .orderBy(desc(notificacion.publicadaAt))
      .limit(limit)
      .offset(offset);

    return {
      notifications,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };
  });

export const getNotification = createServerFn({
  method: 'GET',
})
  .validator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [notificationData] = await db
      .select({
        id: notificacion.id,
        externalId: notificacion.externalId,
        mensaje: notificacion.mensaje,
        publicadaAt: notificacion.publicadaAt,
        venceAt: notificacion.venceAt,
        leida: notificacion.leida,
        credencialId: notificacion.credencialId,
        credencialNombre: credencialAfip.nombre,
        credencialCuit: credencialAfip.cuit,
        credencialEmail: credencialAfip.email,
        clienteId: notificacion.clienteId,
        clienteRazonSocial: cliente.razonSocial,
        clienteCuit: cliente.cuit,
        severidad: notificacion.severidad,
        categoria: notificacion.categoria,
        aiResumen: notificacion.aiResumen,
        asignadaA: notificacion.asignadaA,
        resueltaAt: notificacion.resueltaAt,
        resueltaPor: notificacion.resueltaPor,
        createdAt: notificacion.createdAt,
        updatedAt: notificacion.updatedAt,
      })
      .from(notificacion)
      .innerJoin(
        credencialAfip,
        eq(notificacion.credencialId, credencialAfip.id)
      )
      .leftJoin(cliente, eq(notificacion.clienteId, cliente.id))
      .where(
        and(eq(notificacion.id, ctx.data.id), eq(notificacion.orgId, orgId))
      )
      .limit(1);

    if (!notificationData) throw new Error('Notificación no encontrada');

    const adjuntos = await db
      .select({
        id: notificacionAdjunto.id,
        externalId: notificacionAdjunto.externalId,
        documentoId: notificacionAdjunto.documentoId,
        nombre: documento.nombre,
        mimeType: documento.mimeType,
        tamanoBytes: documento.tamanoBytes,
        createdAt: notificacionAdjunto.createdAt,
      })
      .from(notificacionAdjunto)
      .innerJoin(documento, eq(notificacionAdjunto.documentoId, documento.id))
      .where(eq(notificacionAdjunto.notificacionId, ctx.data.id));

    return {
      ...notificationData,
      adjuntos: adjuntos.map((a) => ({
        ...a,
        // El archivo vive en R2 (bucket privado): se sirve por endpoint autenticado.
        url: `/api/documents/${a.documentoId}`,
      })),
    };
  });

export const markNotificationOpened = createServerFn({
  method: 'POST',
})
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [updated] = await db
      .update(notificacion)
      .set({ leida: true, updatedAt: new Date() })
      .where(
        and(eq(notificacion.id, ctx.data.id), eq(notificacion.orgId, orgId))
      )
      .returning();

    if (!updated) throw new Error('Notificación no encontrada o sin acceso');
    return { leida: true };
  });

export const markNotificationUnread = createServerFn({
  method: 'POST',
})
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [updated] = await db
      .update(notificacion)
      .set({ leida: false, updatedAt: new Date() })
      .where(
        and(eq(notificacion.id, ctx.data.id), eq(notificacion.orgId, orgId))
      )
      .returning();

    if (!updated) throw new Error('Notificación no encontrada o sin acceso');
    return { leida: false };
  });

export const markAllNotificationsRead = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const updated = await db
    .update(notificacion)
    .set({ leida: true, updatedAt: new Date() })
    .where(and(eq(notificacion.orgId, orgId), eq(notificacion.leida, false)))
    .returning({ id: notificacion.id });

  return { count: updated.length };
});

export const deleteNotification = createServerFn({
  method: 'POST',
})
  .validator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [deleted] = await db
      .delete(notificacion)
      .where(
        and(eq(notificacion.id, ctx.data.id), eq(notificacion.orgId, orgId))
      )
      .returning();

    if (!deleted) throw new Error('Error al eliminar la notificación');

    return { success: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Asignación y resolución
// ─────────────────────────────────────────────────────────────────────────────

export const listOrgMembersForAssignment = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const members = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, orgId));

  return members;
});

export const assignNotification = createServerFn({
  method: 'POST',
})
  .validator(
    z.object({
      id: z.string().uuid(),
      userId: z.string().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [updated] = await db
      .update(notificacion)
      .set({ asignadaA: ctx.data.userId, updatedAt: new Date() })
      .where(
        and(eq(notificacion.id, ctx.data.id), eq(notificacion.orgId, orgId))
      )
      .returning();

    if (!updated) throw new Error('Notificación no encontrada');
    return updated;
  });

export const resolveNotification = createServerFn({
  method: 'POST',
})
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const now = new Date();
    const [updated] = await db
      .update(notificacion)
      .set({ resueltaAt: now, resueltaPor: userId, updatedAt: now })
      .where(
        and(eq(notificacion.id, ctx.data.id), eq(notificacion.orgId, orgId))
      )
      .returning();

    if (!updated) throw new Error('Notificación no encontrada');
    return updated;
  });

export const unresolveNotification = createServerFn({
  method: 'POST',
})
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [updated] = await db
      .update(notificacion)
      .set({ resueltaAt: null, resueltaPor: null, updatedAt: new Date() })
      .where(
        and(eq(notificacion.id, ctx.data.id), eq(notificacion.orgId, orgId))
      )
      .returning();

    if (!updated) throw new Error('Notificación no encontrada');
    return updated;
  });

// ─────────────────────────────────────────────────────────────────────────────
// Clasificación con IA
// ─────────────────────────────────────────────────────────────────────────────

type Severidad = (typeof notificacionSeveridad.enumValues)[number];

interface ClassificationResult {
  severidad: Severidad;
  categoria: string;
  resumen: string;
}

async function classifyWithGemini(
  mensaje: string
): Promise<ClassificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Sos un clasificador de notificaciones fiscales de AFIP Argentina.
Analizá el siguiente mensaje de notificación y determiná su severidad, categoría y generá un resumen breve en español.

Severidades disponibles:
- urgente: requiere acción inmediata (intimaciones, inspecciones activas, deudas con embargo)
- accion_requerida: hay que hacer algo en los próximos días (requerimientos, vencimientos próximos)
- informativa: no requiere acción (acuses de recibo, confirmaciones, comunicaciones generales)

Categorías disponibles:
- requerimiento: AFIP requiere documentación o información
- inspeccion: proceso de inspección o auditoría
- deuda: deuda impositiva o previsional
- intimacion: intimación formal o carta documento
- comunicacion_general: comunicación informativa general
- vencimiento: aviso de vencimiento de obligación
- otro: no encaja en ninguna categoría anterior

Mensaje de notificación:
${mensaje}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          severidad: {
            type: 'STRING',
            enum: ['urgente', 'accion_requerida', 'informativa'],
          },
          categoria: { type: 'STRING' },
          resumen: { type: 'STRING' },
        },
        required: ['severidad', 'categoria', 'resumen'],
      },
    },
  });

  const text = response.text ?? '';
  if (!text) throw new Error('Gemini no devolvió respuesta');

  const parsed = JSON.parse(text) as ClassificationResult;
  if (!notificacionSeveridad.enumValues.includes(parsed.severidad)) {
    throw new Error(`Severidad no reconocida: ${parsed.severidad}`);
  }
  return parsed;
}

/** Deja el rastro de que la clasificación la hizo la IA, no una persona. */
async function registrarEventoClasificacion(
  orgId: string,
  notif: { id: string; clienteId: string | null },
  result: ClassificationResult
) {
  await db.insert(evento).values({
    orgId,
    clienteId: notif.clienteId,
    entidad: 'notificacion',
    entidadId: notif.id,
    tipo: 'cambio',
    actorTipo: 'agent',
    detalle: { severidad: result.severidad, categoria: result.categoria },
  });
}

export const classifyNotification = createServerFn({
  method: 'POST',
})
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [notif] = await db
      .select({
        id: notificacion.id,
        mensaje: notificacion.mensaje,
        clienteId: notificacion.clienteId,
      })
      .from(notificacion)
      .where(
        and(eq(notificacion.id, ctx.data.id), eq(notificacion.orgId, orgId))
      )
      .limit(1);

    if (!notif) throw new Error('Notificación no encontrada');

    const result = await classifyWithGemini(notif.mensaje);

    const now = new Date();
    const [updated] = await db
      .update(notificacion)
      .set({
        severidad: result.severidad,
        categoria: result.categoria,
        aiResumen: result.resumen,
        aiClasificadaAt: now,
        updatedAt: now,
      })
      .where(eq(notificacion.id, notif.id))
      .returning();

    await registrarEventoClasificacion(orgId, notif, result);

    return updated;
  });

export const classifyUnclassifiedNotifications = createServerFn({
  method: 'POST',
})
  .validator(
    z
      .object({ limit: z.number().int().positive().max(500).optional() })
      .optional()
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const limit = ctx.data?.limit;
    const baseQuery = db
      .select({
        id: notificacion.id,
        mensaje: notificacion.mensaje,
        clienteId: notificacion.clienteId,
      })
      .from(notificacion)
      .where(
        and(
          eq(notificacion.orgId, orgId),
          eq(notificacion.severidad, 'sin_clasificar'),
          isNull(notificacion.aiClasificadaAt)
        )
      );
    const unclassified = limit ? await baseQuery.limit(limit) : await baseQuery;

    let classified = 0;
    let errors = 0;
    const now = new Date();

    for (const notif of unclassified) {
      try {
        const result = await classifyWithGemini(notif.mensaje);

        await db
          .update(notificacion)
          .set({
            severidad: result.severidad,
            categoria: result.categoria,
            aiResumen: result.resumen,
            aiClasificadaAt: now,
            updatedAt: now,
          })
          .where(eq(notificacion.id, notif.id));

        await registrarEventoClasificacion(orgId, notif, result);

        classified++;
      } catch {
        errors++;
      }
    }

    return { classified, errors };
  });
