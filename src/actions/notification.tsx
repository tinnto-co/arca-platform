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
  tarea,
  tareaNotificacion,
} from '@/drizzle/schema';
import { member, user } from '@/drizzle/auth';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import {
  eq,
  desc,
  and,
  gte,
  lte,
  sql,
  isNull,
  isNotNull,
  ilike,
  or,
  inArray,
} from 'drizzle-orm';

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
      /** Nivel de importancia. Enum `notificacion_severidad`. */
      severidad: z.string().optional(),
      onlyUnresolved: z.boolean().optional(),
      /** El inverso: sólo las ya resueltas. Es el tab `Resueltas`. */
      soloResueltas: z.boolean().optional(),
      /** Sólo las que traen archivo adjunto. */
      soloConAdjunto: z.boolean().optional(),
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
      severidad,
      onlyUnresolved,
      soloResueltas,
      search,
      soloConAdjunto,
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
    if (severidad && severidad !== 'all') {
      conditions.push(
        eq(
          notificacion.severidad,
          severidad as (typeof notificacion.severidad.enumValues)[number]
        )
      );
    }
    if (onlyUnresolved) {
      conditions.push(isNull(notificacion.resueltaAt));
    }
    if (soloResueltas) {
      conditions.push(isNotNull(notificacion.resueltaAt));
    }

    // El texto busca sobre el cuerpo, el resumen y la razón social. Estaba
    // declarado en el validator pero nunca se aplicaba: el buscador de la
    // pantalla devolvía la lista entera.
    const termino = search?.trim();
    if (termino) {
      const patron = `%${termino}%`;
      const porTexto = or(
        ilike(notificacion.mensaje, patron),
        ilike(notificacion.aiResumen, patron),
        ilike(cliente.razonSocial, patron),
        ilike(cliente.cuit, patron),
        ilike(credencialAfip.nombre, patron)
      );
      if (porTexto) conditions.push(porTexto);
    }

    if (soloConAdjunto) {
      conditions.push(
        sql`exists (select 1 from ${notificacionAdjunto} a where a.notificacion_id = ${notificacion.id})`
      );
    }

    const whereCondition = and(...conditions);

    // Los mismos joins que el listado: el filtro de texto toca `cliente` y
    // `credencial_afip`, así que sin ellos el count no compila.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notificacion)
      .innerJoin(
        credencialAfip,
        eq(notificacion.credencialId, credencialAfip.id)
      )
      .leftJoin(cliente, eq(notificacion.clienteId, cliente.id))
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

        // Subconsultas y no joins: con `left join` sobre dos hijas el conteo
        // de una multiplica al de la otra.
        adjuntos: sql<number>`(
          select count(*)::int from ${notificacionAdjunto} a
           where a.notificacion_id = ${notificacion.id}
        )`,
        tareas: sql<number>`(
          select count(*)::int from ${tareaNotificacion} tn
           where tn.notificacion_id = ${notificacion.id}
        )`,
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

/**
 * Marca leídas las no leídas. Con `ids`, sólo esas: la pantalla manda las del
 * resultado filtrado, porque "marcar todas" tiene que significar las que se
 * están viendo y no las mil de la bandeja entera.
 */
export const markAllNotificationsRead = createServerFn({
  method: 'POST',
})
  .validator(
    z.object({ ids: z.array(z.string().uuid()).optional() }).optional()
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const ids = ctx.data?.ids;

    const updated = await db
      .update(notificacion)
      .set({ leida: true, updatedAt: new Date() })
      .where(
        and(
          eq(notificacion.orgId, orgId),
          eq(notificacion.leida, false),
          ...(ids && ids.length > 0 ? [inArray(notificacion.id, ids)] : [])
        )
      )
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

/**
 * Los números del encabezado y las opciones de los filtros, en una sola ida.
 * El total y las no leídas son de la bandeja entera, no del recorte: son el
 * contexto contra el que se lee el conteo de resultados.
 */
export const getInboxResumen = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const [[totales], categorias] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        sinLeer: sql<number>`count(*) filter (where ${notificacion.leida} = false)::int`,
        // Mensajes distintos sin clasificar: es lo que cuesta, no las filas.
        sinClasificar: sql<number>`count(distinct ${notificacion.mensaje}) filter (where ${notificacion.aiClasificadaAt} is null)::int`,
        // Cuándo entró la última: es lo que el header muestra como
        // "última sincronización".
        ultima: sql<Date | null>`max(${notificacion.createdAt})`,
      })
      .from(notificacion)
      .where(eq(notificacion.orgId, orgId)),
    db
      .selectDistinct({ categoria: notificacion.categoria })
      .from(notificacion)
      .where(
        and(eq(notificacion.orgId, orgId), isNotNull(notificacion.categoria))
      )
      .orderBy(notificacion.categoria),
  ]);

  return {
    total: totales?.total ?? 0,
    sinLeer: totales?.sinLeer ?? 0,
    sinClasificar: totales?.sinClasificar ?? 0,
    ultimaSync: totales?.ultima ?? null,
    categorias: categorias
      .map((c) => c.categoria)
      .filter((c): c is string => c !== null),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Vínculo con tareas
// ─────────────────────────────────────────────────────────────────────────────

/** Las tareas que salieron de esta notificación, para la tira del panel. */
export const listTareasDeNotificacion = createServerFn({
  method: 'GET',
})
  .validator(z.object({ notificacionId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    return db
      .select({
        id: tarea.id,
        titulo: tarea.titulo,
        estado: tarea.estado,
        columnaId: tarea.columnaId,
        fuente: tareaNotificacion.fuente,
        vinculadaAt: tareaNotificacion.createdAt,
      })
      .from(tareaNotificacion)
      .innerJoin(tarea, eq(tarea.id, tareaNotificacion.tareaId))
      .where(
        and(
          eq(tareaNotificacion.notificacionId, ctx.data.notificacionId),
          eq(tarea.orgId, orgId)
        )
      )
      .orderBy(desc(tareaNotificacion.createdAt));
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

// ─────────────────────────────────────────────────────────────────────────────
// Clasificación automática
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Copia la clasificación entre notificaciones con el MISMO texto.
 *
 * Las de AFIP se repiten muchísimo: en la base de un estudio hay 1.006
 * notificaciones y 181 mensajes distintos; «SCT - Intimación» sola aparece 240
 * veces. Clasificar cada fila sería pagarle a Gemini 825 veces por leer un
 * texto que ya leyó.
 *
 * Corre antes de cualquier llamada al modelo y es sólo SQL.
 */
async function propagarClasificacion(orgId: string) {
  const r = await db.execute(sql`
    update notificacion n
       set severidad = f.severidad,
           categoria = f.categoria,
           ai_resumen = f.ai_resumen,
           ai_clasificada_at = f.ai_clasificada_at,
           updated_at = now()
      from (
        select distinct on (mensaje)
               mensaje, severidad, categoria, ai_resumen, ai_clasificada_at
          from notificacion
         where org_id = ${orgId} and ai_clasificada_at is not null
         order by mensaje, ai_clasificada_at desc
      ) f
     where n.org_id = ${orgId}
       and n.ai_clasificada_at is null
       and n.mensaje = f.mensaje
  `);
  return r.count ?? 0;
}

/**
 * Clasifica lo que quede pendiente, de a poco.
 *
 * Devuelve cuántas faltan para que la pantalla vuelva a llamar hasta llegar a
 * cero: así el trabajo se reparte en tandas cortas en vez de un request de
 * media hora que el servidor corta por timeout.
 *
 * Agrupa por texto: una llamada por mensaje distinto, aplicada a todas las
 * filas que lo comparten.
 */
export const clasificarPendientes = createServerFn({ method: 'POST' })
  .validator(
    z
      .object({ mensajes: z.number().int().min(1).max(20).default(8) })
      .optional()
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const copiadas = await propagarClasificacion(orgId);

    // Los textos distintos que siguen sin clasificar.
    const pendientes = await db
      .selectDistinct({ mensaje: notificacion.mensaje })
      .from(notificacion)
      .where(
        and(eq(notificacion.orgId, orgId), isNull(notificacion.aiClasificadaAt))
      )
      .limit(ctx.data?.mensajes ?? 8);

    let clasificados = 0;
    let errores = 0;

    // En paralelo: son pocas por tanda y el cuello es la latencia del modelo,
    // no el CPU.
    await Promise.all(
      pendientes.map(async ({ mensaje }) => {
        try {
          const r = await classifyWithGemini(mensaje);
          const now = new Date();
          await db
            .update(notificacion)
            .set({
              severidad: r.severidad,
              categoria: r.categoria,
              aiResumen: r.resumen,
              aiClasificadaAt: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(notificacion.orgId, orgId),
                eq(notificacion.mensaje, mensaje),
                isNull(notificacion.aiClasificadaAt)
              )
            );
          clasificados++;
        } catch {
          // Una falla no frena la tanda: la próxima vuelta lo reintenta.
          errores++;
        }
      })
    );

    const [{ faltan }] = (await db
      .select({
        faltan: sql<number>`count(distinct ${notificacion.mensaje})::int`,
      })
      .from(notificacion)
      .where(
        and(eq(notificacion.orgId, orgId), isNull(notificacion.aiClasificadaAt))
      )) as { faltan: number }[];

    return { copiadas, clasificados, errores, faltan };
  });

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
