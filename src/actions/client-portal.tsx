/**
 * Portal del cliente.
 *
 * El acceso es **por cliente** (entidad fiscal), no por login de AFIP: un
 * usuario del portal ve su empresa, no todo lo que declara el representante.
 * Las deudas, vencimientos y notificaciones se filtran por `cliente_id`, que
 * queda vacío cuando el dato es del CUIT del login y no de una empresa.
 */
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import z from 'zod';
import { db, withUserContext, withOrgContext } from '@/lib/db';
import { setDbContext } from '@/lib/db-context';
import { auth } from '@/lib/auth';
import { user as userTable, organization, member } from '@/drizzle/auth';
import {
  cliente,
  clienteCredencial,
  accesoUsuarioCliente,
  solicitud,
  solicitudTipo,
  solicitudEstado,
  deuda,
  vencimiento,
  notificacion,
  documento,
  ivaDeclaracion,
  comprobante,
} from '@/drizzle/schema';
import {
  getAuthSession,
  getClientePortalSession,
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import { eq, and, isNull, isNotNull, gte, asc, desc, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import * as r2 from '@/lib/r2';

/** Lo que queda guardado en `solicitud.detalle` cuando el cliente sube un archivo. */
export interface SolicitudDetalle {
  documentoId?: string;
  documentoNombre?: string;
  documentoMimeType?: string;
  subidoAt?: string;
  subidoPor?: string;
}

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * `max(<timestamptz>)` de un fragmento `sql` crudo NO vuelve como `Date`: el
 * driver de drizzle desactiva los parsers de postgres-js y sólo mapea las
 * columnas que conoce, así que un agregado llega como el texto de Postgres
 * ("2026-03-03 18:46:51.376+00"), que no es ISO. Se pide el ISO desde la base
 * y se trata como string en todo el camino.
 */
function isoDe(columna: PgColumn) {
  return sql<string | null>`to_json(max(${columna}))#>>'{}'`;
}

export const getPortalSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { session, userId, clienteId, access } =
      await getClientePortalSession();

    // La cabecera del portal muestra la identidad en todas las pantallas, así
    // que viaja con la sesión y no se vuelve a pedir en cada vista.
    const [datos] = await db
      .select({
        razonSocial: cliente.razonSocial,
        cuit: cliente.cuit,
        orgId: cliente.orgId,
      })
      .from(cliente)
      .where(eq(cliente.id, clienteId))
      .limit(1);

    // `organization` está fuera del alcance del rol del portal: se lee con
    // `app.user_id`, igual que la fila de acceso.
    const [estudio] = datos
      ? await withUserContext(userId, (tx) =>
          tx
            .select({ nombre: organization.name })
            .from(organization)
            .where(eq(organization.id, datos.orgId))
            .limit(1)
        )
      : [];

    return {
      userId,
      clienteId,
      access,
      usuario: session.user.name,
      estudio: estudio?.nombre ?? null,
      cliente: {
        razonSocial: datos?.razonSocial ?? '',
        cuit: datos?.cuit ?? '',
      },
    };
  }
);

/**
 * El acceso del usuario a ese cliente, con sus permisos. Tira si no lo tiene.
 *
 * Mismo huevo y gallina que `getClientePortalSession`: la fila de acceso se lee
 * con `app.user_id` porque una sesión de portal no tiene organización, y recién
 * después se abre el contexto del cliente para que el resto de las consultas del
 * request salgan por `arca_portal`. Sin esto el RLS devuelve 0 filas y todo el
 * portal responde "Acceso denegado".
 */
async function getAccesoPortal(userId: string, clienteId: string) {
  const [access] = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(accesoUsuarioCliente)
      .where(
        and(
          eq(accesoUsuarioCliente.userId, userId),
          eq(accesoUsuarioCliente.clienteId, clienteId)
        )
      )
      .limit(1)
  );

  if (!access) throw new Error('Acceso denegado al portal del cliente');

  setDbContext({ clienteId });
  return access;
}

/** Cuántas deudas de la lista se mandan al inicio: 4 visibles + las del "Ver N más". */
const DEUDAS_EN_PORTADA = 10;

export const getClientePortalDashboard = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clienteId: z.string().uuid() }))
  .handler(async (ctx) => {
    const session = await getAuthSession();
    const access = await getAccesoPortal(session.user.id, ctx.data.clienteId);

    const [clienteData] = await db
      .select({
        id: cliente.id,
        orgId: cliente.orgId,
        razonSocial: cliente.razonSocial,
        cuit: cliente.cuit,
        condicionIva: cliente.condicionIva,
        estado: cliente.estado,
      })
      .from(cliente)
      .where(eq(cliente.id, ctx.data.clienteId))
      .limit(1);

    if (!clienteData) throw new Error('Cliente no encontrado');

    const soloAbierta = and(
      eq(deuda.clienteId, ctx.data.clienteId),
      eq(deuda.estado, 'abierta')
    );

    const [
      proximosVencimientos,
      deudasAbiertas,
      resumenDeuda,
      resumenNotificaciones,
      solicitudesAbiertas,
      presentaciones,
      ultimasNotificaciones,
      comprobantesRecientes,
    ] = await Promise.all([
      db
        .select({
          id: vencimiento.id,
          impuesto: vencimiento.impuesto,
          concepto: vencimiento.concepto,
          venceAt: vencimiento.venceAt,
        })
        .from(vencimiento)
        .where(
          and(
            eq(vencimiento.clienteId, ctx.data.clienteId),
            isNull(vencimiento.completadoAt),
            gte(vencimiento.venceAt, hoy())
          )
        )
        .orderBy(asc(vencimiento.venceAt))
        .limit(3),

      // Las de mayor saldo primero: es lo que el cliente mira cuando abre.
      access.puedeVerDeudas
        ? db
            .select({
              id: deuda.id,
              impuesto: deuda.impuesto,
              concepto: deuda.concepto,
              subConcepto: deuda.subConcepto,
              periodo: deuda.periodo,
              saldo: deuda.saldo,
              venceAt: deuda.venceAt,
              intimada: deuda.intimada,
            })
            .from(deuda)
            .where(soloAbierta)
            .orderBy(desc(deuda.saldo))
            .limit(DEUDAS_EN_PORTADA)
        : Promise.resolve([]),

      // El total y los conteos van aparte: la lista está cortada y sumarla
      // mostraría menos deuda de la que el cliente realmente tiene.
      access.puedeVerDeudas
        ? db
            .select({
              total: sql<string>`coalesce(sum(${deuda.saldo}), 0)::text`,
              cantidad: sql<number>`count(*)::int`,
              vencidas: sql<number>`count(*) filter (where ${deuda.venceAt} < current_date)::int`,
              ultimaSync: isoDe(deuda.createdAt),
            })
            .from(deuda)
            .where(soloAbierta)
        : Promise.resolve([]),

      db
        .select({
          sinLeer: sql<number>`count(*) filter (where not ${notificacion.leida} and ${notificacion.resueltaAt} is null)::int`,
          ultimaSync: isoDe(notificacion.createdAt),
        })
        .from(notificacion)
        .where(eq(notificacion.clienteId, ctx.data.clienteId)),

      db
        .select({
          id: solicitud.id,
          titulo: solicitud.titulo,
          tipo: solicitud.tipo,
          venceAt: solicitud.venceAt,
          createdAt: solicitud.createdAt,
        })
        .from(solicitud)
        .where(
          and(
            eq(solicitud.clienteId, ctx.data.clienteId),
            eq(solicitud.estado, 'abierta')
          )
        )
        .orderBy(asc(solicitud.venceAt))
        .limit(10),

      // Las tres consultas que siguen alimentan "Actividad reciente". No hay
      // una tabla de actividad del cliente: se arma con los hechos que ya
      // existen (presentaciones, notificaciones y comprobantes sincronizados).
      db
        .select({
          periodo: ivaDeclaracion.periodo,
          presentadaAt: ivaDeclaracion.presentadaAt,
        })
        .from(ivaDeclaracion)
        .where(
          and(
            eq(ivaDeclaracion.clienteId, ctx.data.clienteId),
            isNotNull(ivaDeclaracion.presentadaAt)
          )
        )
        .orderBy(desc(ivaDeclaracion.presentadaAt))
        .limit(3),

      db
        .select({
          id: notificacion.id,
          mensaje: notificacion.mensaje,
          publicadaAt: notificacion.publicadaAt,
        })
        .from(notificacion)
        .where(
          and(
            eq(notificacion.clienteId, ctx.data.clienteId),
            isNotNull(notificacion.publicadaAt)
          )
        )
        .orderBy(desc(notificacion.publicadaAt))
        .limit(3),

      db
        .select({
          cantidad: sql<number>`count(*)::int`,
          ultimo: isoDe(comprobante.createdAt),
        })
        .from(comprobante)
        .where(
          and(
            eq(comprobante.clienteId, ctx.data.clienteId),
            gte(comprobante.createdAt, sql`now() - interval '30 days'`)
          )
        ),
    ]);

    const contador = await getContadorDelEstudio(
      session.user.id,
      clienteData.orgId
    );

    const deudaResumen = resumenDeuda[0];
    const notis = resumenNotificaciones[0];
    const compros = comprobantesRecientes[0];

    const actividad = [
      ...presentaciones.map((p) => ({
        tipo: 'presentacion' as const,
        at: p.presentadaAt!,
        periodo: p.periodo,
        detalle: null as string | null,
        cantidad: null as number | null,
      })),
      ...ultimasNotificaciones.map((n) => ({
        tipo: 'notificacion' as const,
        at: n.publicadaAt!.toISOString(),
        periodo: null,
        detalle: n.mensaje.trim(),
        cantidad: null as number | null,
      })),
      ...(compros?.cantidad && compros.ultimo
        ? [
            {
              tipo: 'comprobantes' as const,
              at: compros.ultimo,
              periodo: null,
              detalle: null,
              cantidad: compros.cantidad,
            },
          ]
        : []),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 4);

    // No hay marca de "último scrapeo" por cliente (la tabla `job` no es
    // legible desde el portal y sus filas no tienen cliente), así que la fecha
    // de corte se aproxima con lo último que entró de AFIP.
    const cortes = [deudaResumen?.ultimaSync, notis?.ultimaSync].filter(
      (x): x is string => !!x
    );

    return {
      cliente: {
        id: clienteData.id,
        razonSocial: clienteData.razonSocial,
        cuit: clienteData.cuit,
        condicionIva: clienteData.condicionIva,
        estado: clienteData.estado,
      },
      usuario: session.user.name,
      contador,
      proximosVencimientos,
      deudasAbiertas: access.puedeVerDeudas ? deudasAbiertas : null,
      deudaAbiertaTotal: access.puedeVerDeudas
        ? (deudaResumen?.total ?? '0')
        : null,
      deudasAbiertasCantidad: deudaResumen?.cantidad ?? 0,
      deudasVencidas: deudaResumen?.vencidas ?? 0,
      notificacionesSinLeer: notis?.sinLeer ?? 0,
      solicitudesAbiertas,
      actividad,
      ultimaPresentacion: presentaciones[0]?.presentadaAt ?? null,
      datosAfipAt: cortes.sort().at(-1) ?? null,
      permisos: {
        puedeVerDeudas: access.puedeVerDeudas,
        puedeVerIva: access.puedeVerIva,
        puedeVerSueldos: access.puedeVerSueldos,
        puedeSubirDocumentos: access.puedeSubirDocumentos,
        puedeChatearIa: access.puedeChatearIa,
      },
    };
  });

/**
 * El contacto del estudio que se muestra en el portal.
 *
 * Todavía no existe un contador asignado por cliente, así que se usa el dueño
 * de la organización. Se lee con `app.user_id` porque `organization`/`member`
 * están fuera del alcance del rol del portal.
 */
async function getContadorDelEstudio(userId: string, orgId: string) {
  const [row] = await withUserContext(userId, (tx) =>
    tx
      .select({
        estudio: organization.name,
        nombre: userTable.name,
        email: userTable.email,
      })
      .from(member)
      .innerJoin(userTable, eq(userTable.id, member.userId))
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(and(eq(member.organizationId, orgId), eq(member.role, 'owner')))
      .orderBy(asc(member.createdAt))
      .limit(1)
  );

  return row ?? null;
}

export const getClientePortalDeudas = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clienteId: z.string().uuid() }))
  .handler(async (ctx) => {
    const session = await getAuthSession();
    const access = await getAccesoPortal(session.user.id, ctx.data.clienteId);

    if (!access.puedeVerDeudas) {
      throw new Error('No tenés permiso para ver las deudas');
    }

    return db
      .select({
        id: deuda.id,
        impuesto: deuda.impuesto,
        concepto: deuda.concepto,
        subConcepto: deuda.subConcepto,
        periodo: deuda.periodo,
        venceAt: deuda.venceAt,
        saldo: deuda.saldo,
        interesResarcitorio: deuda.interesResarcitorio,
        interesPunitorio: deuda.interesPunitorio,
        estado: deuda.estado,
        intimada: deuda.intimada,
        createdAt: deuda.createdAt,
      })
      .from(deuda)
      .where(eq(deuda.clienteId, ctx.data.clienteId))
      .orderBy(desc(deuda.venceAt));
  });

export const getClientePortalVencimientos = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clienteId: z.string().uuid(),
      incluirCompletados: z.boolean().optional().default(false),
    })
  )
  .handler(async (ctx) => {
    const session = await getAuthSession();
    await getAccesoPortal(session.user.id, ctx.data.clienteId);

    const conditions = [eq(vencimiento.clienteId, ctx.data.clienteId)];
    if (!ctx.data.incluirCompletados) {
      conditions.push(isNull(vencimiento.completadoAt));
    }

    return db
      .select({
        id: vencimiento.id,
        impuesto: vencimiento.impuesto,
        concepto: vencimiento.concepto,
        subConcepto: vencimiento.subConcepto,
        periodo: vencimiento.periodo,
        venceAt: vencimiento.venceAt,
        completadoAt: vencimiento.completadoAt,
        createdAt: vencimiento.createdAt,
      })
      .from(vencimiento)
      .where(and(...conditions))
      .orderBy(asc(vencimiento.venceAt));
  });

export const getClientePortalNotificaciones = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clienteId: z.string().uuid(),
      limit: z.number().optional().default(50),
    })
  )
  .handler(async (ctx) => {
    const session = await getAuthSession();
    await getAccesoPortal(session.user.id, ctx.data.clienteId);

    return db
      .select({
        id: notificacion.id,
        mensaje: notificacion.mensaje,
        severidad: notificacion.severidad,
        categoria: notificacion.categoria,
        aiResumen: notificacion.aiResumen,
        leida: notificacion.leida,
        publicadaAt: notificacion.publicadaAt,
        resueltaAt: notificacion.resueltaAt,
        createdAt: notificacion.createdAt,
      })
      .from(notificacion)
      .where(
        and(
          eq(notificacion.clienteId, ctx.data.clienteId),
          isNull(notificacion.resueltaAt)
        )
      )
      .orderBy(desc(notificacion.publicadaAt))
      .limit(ctx.data.limit);
  });

export const getClientePortalSolicitudes = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clienteId: z.string().uuid(),
      estado: z.enum(solicitudEstado.enumValues).optional(),
    })
  )
  .handler(async (ctx) => {
    const session = await getAuthSession();
    await getAccesoPortal(session.user.id, ctx.data.clienteId);

    const conditions = [eq(solicitud.clienteId, ctx.data.clienteId)];
    if (ctx.data.estado) conditions.push(eq(solicitud.estado, ctx.data.estado));

    return db
      .select({
        id: solicitud.id,
        titulo: solicitud.titulo,
        descripcion: solicitud.descripcion,
        tipo: solicitud.tipo,
        estado: solicitud.estado,
        venceAt: solicitud.venceAt,
        completadaAt: solicitud.completadaAt,
        detalle: sql<SolicitudDetalle | null>`${solicitud.detalle}`,
        createdAt: solicitud.createdAt,
      })
      .from(solicitud)
      .where(and(...conditions))
      .orderBy(desc(solicitud.createdAt));
  });

export const completarSolicitud = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ solicitudId: z.string().uuid() }))
  .handler(async (ctx) => {
    // La sesión va primero: es la que abre el contexto del cliente. Leer la
    // solicitud antes la deja fuera del alcance del RLS y no devuelve nada.
    await getClientePortalSession();

    const [row] = await db
      .select({ id: solicitud.id })
      .from(solicitud)
      .where(eq(solicitud.id, ctx.data.solicitudId))
      .limit(1);

    if (!row) throw new Error('Solicitud no encontrada');

    await db
      .update(solicitud)
      .set({ estado: 'completada', completadaAt: new Date() })
      .where(eq(solicitud.id, ctx.data.solicitudId));

    return { success: true };
  });

export const uploadDocumentoSolicitud = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      solicitudId: z.string().uuid(),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      sizeBytes: z.number().int().positive(),
      base64Data: z.string().min(1),
    })
  )
  .handler(async (ctx) => {
    // La sesión va primero: es la que abre el contexto del cliente. Leer la
    // solicitud antes la deja fuera del alcance del RLS y no devuelve nada.
    const { userId, access } = await getClientePortalSession();
    if (!access.puedeSubirDocumentos) {
      throw new Error('No tenés permiso para subir documentos');
    }

    const [row] = await db
      .select({
        id: solicitud.id,
        orgId: solicitud.orgId,
        clienteId: solicitud.clienteId,
        estado: solicitud.estado,
      })
      .from(solicitud)
      .where(eq(solicitud.id, ctx.data.solicitudId))
      .limit(1);

    if (!row) throw new Error('Solicitud no encontrada');
    if (row.estado !== 'abierta')
      throw new Error('La solicitud no está abierta');

    // `documento` cuelga del login de AFIP (los documentos nacieron del scraping),
    // así que un archivo subido por el portal se archiva bajo el login con el que
    // el estudio administra a ese cliente. `cliente_credencial` está fuera del
    // alcance del rol del portal, como todo lo que huele a credencial.
    const [rel] = await withOrgContext(row.orgId, (tx) =>
      tx
        .select({ credencialId: clienteCredencial.credencialId })
        .from(clienteCredencial)
        .where(eq(clienteCredencial.clienteId, row.clienteId))
        .limit(1)
    );
    if (!rel)
      throw new Error('El cliente no tiene una credencial de AFIP asociada');

    const buffer = Buffer.from(ctx.data.base64Data, 'base64');
    // El id se genera acá para poder armar la key de R2 antes de insertar.
    const documentoId = randomUUID();
    const storageKey = r2.documentKey({
      orgId: row.orgId,
      clienteId: row.clienteId,
      documentId: documentoId,
      extension: r2.extensionFor(ctx.data.fileName, ctx.data.mimeType),
    });
    // Que el almacenamiento falle es un problema nuestro, no del cliente: el
    // detalle queda en el log del server y afuera sale algo accionable. Nunca
    // se filtra el mensaje interno a la pantalla de un cliente.
    try {
      await r2.upload(storageKey, buffer, ctx.data.mimeType);
    } catch (error) {
      console.error('[portal] falló la subida a R2', {
        solicitudId: ctx.data.solicitudId,
        storageKey,
        error,
      });
      throw new Error(
        'No pudimos guardar el archivo. Probá de nuevo en unos minutos o escribile a tu contador.'
      );
    }

    const [doc] = await db
      .insert(documento)
      .values({
        id: documentoId,
        orgId: row.orgId,
        credencialId: rel.credencialId,
        clienteId: row.clienteId,
        nombre: ctx.data.fileName,
        storageKey,
        mimeType: ctx.data.mimeType,
        tamanoBytes: buffer.length,
        checksum: r2.checksum(buffer),
        fuente: 'manual',
      })
      .returning({ id: documento.id });

    const detalle: SolicitudDetalle = {
      documentoId: doc.id,
      documentoNombre: ctx.data.fileName,
      documentoMimeType: ctx.data.mimeType,
      subidoAt: new Date().toISOString(),
      subidoPor: userId,
    };
    await db
      .update(solicitud)
      .set({ detalle })
      .where(eq(solicitud.id, ctx.data.solicitudId));

    return { documentoId: doc.id, success: true };
  });

// ── Lado estudio ─────────────────────────────────────────────────────────────

/** Valida que el cliente sea de la organización activa. */
async function assertClienteDeOrg(clienteId: string, orgId: string) {
  const [row] = await db
    .select({ id: cliente.id })
    .from(cliente)
    .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Cliente no encontrado');
  return row;
}

export const listSolicitudes = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clienteId: z.string().uuid(),
      estado: z.enum(solicitudEstado.enumValues).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await assertClienteDeOrg(ctx.data.clienteId, orgId);

    const conditions = [eq(solicitud.clienteId, ctx.data.clienteId)];
    if (ctx.data.estado) conditions.push(eq(solicitud.estado, ctx.data.estado));

    return db
      .select({
        id: solicitud.id,
        orgId: solicitud.orgId,
        clienteId: solicitud.clienteId,
        pedidaPor: solicitud.pedidaPor,
        titulo: solicitud.titulo,
        descripcion: solicitud.descripcion,
        tipo: solicitud.tipo,
        estado: solicitud.estado,
        venceAt: solicitud.venceAt,
        completadaAt: solicitud.completadaAt,
        detalle: sql<SolicitudDetalle | null>`${solicitud.detalle}`,
        createdAt: solicitud.createdAt,
      })
      .from(solicitud)
      .where(and(...conditions))
      .orderBy(desc(solicitud.createdAt));
  });

export const createSolicitud = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clienteId: z.string().uuid(),
      titulo: z.string().min(1),
      descripcion: z.string().optional(),
      tipo: z.enum(solicitudTipo.enumValues),
      venceAt: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    await assertClienteDeOrg(ctx.data.clienteId, orgId);

    const [created] = await db
      .insert(solicitud)
      .values({
        orgId,
        clienteId: ctx.data.clienteId,
        pedidaPor: userId,
        titulo: ctx.data.titulo,
        descripcion: ctx.data.descripcion ?? null,
        tipo: ctx.data.tipo,
        estado: 'abierta',
        venceAt: ctx.data.venceAt ? new Date(ctx.data.venceAt) : null,
      })
      .returning({
        id: solicitud.id,
        orgId: solicitud.orgId,
        clienteId: solicitud.clienteId,
        pedidaPor: solicitud.pedidaPor,
        titulo: solicitud.titulo,
        descripcion: solicitud.descripcion,
        tipo: solicitud.tipo,
        estado: solicitud.estado,
        venceAt: solicitud.venceAt,
        completadaAt: solicitud.completadaAt,
        createdAt: solicitud.createdAt,
      });

    return created;
  });

export const getDocumentoSolicitud = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ solicitudId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [row] = await db
      .select({ detalle: sql<SolicitudDetalle | null>`${solicitud.detalle}` })
      .from(solicitud)
      .where(
        and(eq(solicitud.id, ctx.data.solicitudId), eq(solicitud.orgId, orgId))
      )
      .limit(1);

    if (!row) throw new Error('Solicitud no encontrada');
    if (!row.detalle?.documentoId) return null;

    const [doc] = await db
      .select({
        id: documento.id,
        nombre: documento.nombre,
        mimeType: documento.mimeType,
        tamanoBytes: documento.tamanoBytes,
        createdAt: documento.createdAt,
      })
      .from(documento)
      .where(eq(documento.id, row.detalle.documentoId))
      .limit(1);

    if (!doc) return null;
    // El archivo vive en R2 (bucket privado): se sirve por endpoint autenticado.
    return { ...doc, url: `/api/documents/${doc.id}` };
  });

export const updateSolicitudEstado = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      solicitudId: z.string().uuid(),
      estado: z.enum(solicitudEstado.enumValues),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    // `solicitud_completada_coherente`: la fecha de completado va de la mano del estado.
    const [row] = await db
      .update(solicitud)
      .set({
        estado: ctx.data.estado,
        completadaAt: ctx.data.estado === 'completada' ? new Date() : null,
      })
      .where(
        and(eq(solicitud.id, ctx.data.solicitudId), eq(solicitud.orgId, orgId))
      )
      .returning({ id: solicitud.id });

    if (!row) throw new Error('Solicitud no encontrada');
    return { success: true };
  });

// ── Usuarios del portal (lado estudio) ──────────────────────────────────────

export const listPortalUsers = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clienteId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await assertClienteDeOrg(ctx.data.clienteId, orgId);

    return db
      .select({
        accessId: accesoUsuarioCliente.id,
        userId: accesoUsuarioCliente.userId,
        rol: accesoUsuarioCliente.rol,
        puedeVerDeudas: accesoUsuarioCliente.puedeVerDeudas,
        puedeVerIva: accesoUsuarioCliente.puedeVerIva,
        puedeVerSueldos: accesoUsuarioCliente.puedeVerSueldos,
        puedeSubirDocumentos: accesoUsuarioCliente.puedeSubirDocumentos,
        puedeChatearIa: accesoUsuarioCliente.puedeChatearIa,
        createdAt: accesoUsuarioCliente.createdAt,
        name: userTable.name,
        email: userTable.email,
      })
      .from(accesoUsuarioCliente)
      .innerJoin(userTable, eq(userTable.id, accesoUsuarioCliente.userId))
      .where(eq(accesoUsuarioCliente.clienteId, ctx.data.clienteId));
  });

const permisosSchema = z.object({
  puedeVerDeudas: z.boolean().default(true),
  puedeVerIva: z.boolean().default(true),
  puedeVerSueldos: z.boolean().default(false),
  puedeSubirDocumentos: z.boolean().default(true),
  puedeChatearIa: z.boolean().default(true),
});

export const createPortalUser = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clienteId: z.string().uuid(),
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      permisos: permisosSchema,
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    await assertClienteDeOrg(ctx.data.clienteId, orgId);

    const [existing] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, ctx.data.email))
      .limit(1);
    if (existing) throw new Error('Ya existe un usuario con ese email');

    // Sin `headers` a propósito: con sesión, el plugin admin de Better Auth exige
    // `user.role = 'admin'`, y el contador es owner del estudio, no admin de la
    // plataforma. La autorización real ya la hicieron `assertCanWrite` y
    // `assertClienteDeOrg` acá arriba.
    const created = await auth.api.createUser({
      body: {
        name: ctx.data.name,
        email: ctx.data.email,
        password: ctx.data.password,
        role: 'user',
      },
    });

    const [access] = await db
      .insert(accesoUsuarioCliente)
      .values({
        clienteId: ctx.data.clienteId,
        userId: created.user.id,
        rol: 'cliente_lector',
        ...ctx.data.permisos,
      })
      .returning();

    return access;
  });

/** El acceso, validando que su cliente sea de la organización activa. */
async function getAccesoDeOrg(accessId: string, orgId: string) {
  const [row] = await db
    .select({ id: accesoUsuarioCliente.id })
    .from(accesoUsuarioCliente)
    .innerJoin(cliente, eq(cliente.id, accesoUsuarioCliente.clienteId))
    .where(and(eq(accesoUsuarioCliente.id, accessId), eq(cliente.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Acceso no encontrado');
  return row;
}

export const updatePortalUserPermissions = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      accessId: z.string().uuid(),
      permisos: permisosSchema,
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    await getAccesoDeOrg(ctx.data.accessId, orgId);

    await db
      .update(accesoUsuarioCliente)
      .set(ctx.data.permisos)
      .where(eq(accesoUsuarioCliente.id, ctx.data.accessId));

    return { success: true };
  });

export const resetPortalUserPassword = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      userId: z.string(),
      newPassword: z.string().min(8),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    // Solo se puede tocar a un usuario que acceda a un cliente del estudio.
    const [owned] = await db
      .select({ id: accesoUsuarioCliente.id })
      .from(accesoUsuarioCliente)
      .innerJoin(cliente, eq(cliente.id, accesoUsuarioCliente.clienteId))
      .where(
        and(
          eq(accesoUsuarioCliente.userId, ctx.data.userId),
          eq(cliente.orgId, orgId)
        )
      )
      .limit(1);
    if (!owned) throw new Error('Sin permisos para modificar este usuario');

    await auth.api.setUserPassword({
      headers: getRequestHeaders(),
      body: { userId: ctx.data.userId, newPassword: ctx.data.newPassword },
    });

    return { success: true };
  });

export const revokePortalAccess = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ accessId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    await getAccesoDeOrg(ctx.data.accessId, orgId);

    await db
      .delete(accesoUsuarioCliente)
      .where(eq(accesoUsuarioCliente.id, ctx.data.accessId));

    return { success: true };
  });
