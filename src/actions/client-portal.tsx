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
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { user as userTable } from '@/drizzle/auth';
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
} from '@/drizzle/schema';
import {
  getAuthSession,
  getClientePortalSession,
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import { eq, and, isNull, gte, asc, desc, sql } from 'drizzle-orm';
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

export const getPortalSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { userId, clienteId, access } = await getClientePortalSession();
    return { userId, clienteId, access };
  }
);

/** El acceso del usuario a ese cliente, con sus permisos. Tira si no lo tiene. */
async function getAccesoPortal(userId: string, clienteId: string) {
  const [access] = await db
    .select()
    .from(accesoUsuarioCliente)
    .where(
      and(
        eq(accesoUsuarioCliente.userId, userId),
        eq(accesoUsuarioCliente.clienteId, clienteId)
      )
    )
    .limit(1);

  if (!access) throw new Error('Acceso denegado al portal del cliente');
  return access;
}

export const getClientePortalDashboard = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clienteId: z.string().uuid() }))
  .handler(async (ctx) => {
    const session = await getAuthSession();
    const access = await getAccesoPortal(session.user.id, ctx.data.clienteId);

    const [clienteData] = await db
      .select({
        id: cliente.id,
        razonSocial: cliente.razonSocial,
        cuit: cliente.cuit,
        condicionIva: cliente.condicionIva,
        estado: cliente.estado,
      })
      .from(cliente)
      .where(eq(cliente.id, ctx.data.clienteId))
      .limit(1);

    if (!clienteData) throw new Error('Cliente no encontrado');

    const [proximosVencimientos, deudasAbiertas, sinLeer, solicitudesAbiertas] =
      await Promise.all([
        db
          .select({
            id: vencimiento.id,
            impuesto: vencimiento.impuesto,
            concepto: vencimiento.concepto,
            venceAt: vencimiento.venceAt,
            completadoAt: vencimiento.completadoAt,
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

        access.puedeVerDeudas
          ? db
              .select({
                id: deuda.id,
                impuesto: deuda.impuesto,
                concepto: deuda.concepto,
                saldo: deuda.saldo,
                venceAt: deuda.venceAt,
                estado: deuda.estado,
              })
              .from(deuda)
              .where(
                and(
                  eq(deuda.clienteId, ctx.data.clienteId),
                  eq(deuda.estado, 'abierta')
                )
              )
              .orderBy(desc(deuda.venceAt))
              .limit(5)
          : Promise.resolve([]),

        db
          .select({ id: notificacion.id })
          .from(notificacion)
          .where(
            and(
              eq(notificacion.clienteId, ctx.data.clienteId),
              eq(notificacion.leida, false),
              isNull(notificacion.resueltaAt)
            )
          ),

        db
          .select({
            id: solicitud.id,
            titulo: solicitud.titulo,
            tipo: solicitud.tipo,
            estado: solicitud.estado,
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
      ]);

    return {
      cliente: clienteData,
      proximosVencimientos,
      deudasAbiertas: access.puedeVerDeudas ? deudasAbiertas : null,
      notificacionesSinLeer: sinLeer.length,
      solicitudesAbiertas,
      permisos: {
        puedeVerDeudas: access.puedeVerDeudas,
        puedeVerIva: access.puedeVerIva,
        puedeVerSueldos: access.puedeVerSueldos,
        puedeSubirDocumentos: access.puedeSubirDocumentos,
        puedeChatearIa: access.puedeChatearIa,
      },
    };
  });

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
    const session = await getAuthSession();

    const [row] = await db
      .select({ id: solicitud.id, clienteId: solicitud.clienteId })
      .from(solicitud)
      .where(eq(solicitud.id, ctx.data.solicitudId))
      .limit(1);

    if (!row) throw new Error('Solicitud no encontrada');
    await getAccesoPortal(session.user.id, row.clienteId);

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
    const session = await getAuthSession();
    const userId = session.user.id;

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
    if (row.estado !== 'abierta') throw new Error('La solicitud no está abierta');

    const access = await getAccesoPortal(userId, row.clienteId);
    if (!access.puedeSubirDocumentos) {
      throw new Error('No tenés permiso para subir documentos');
    }

    // `documento` cuelga del login de AFIP (los documentos nacieron del scraping),
    // así que un archivo subido por el portal se archiva bajo el login con el que
    // el estudio administra a ese cliente.
    const [rel] = await db
      .select({ credencialId: clienteCredencial.credencialId })
      .from(clienteCredencial)
      .where(eq(clienteCredencial.clienteId, row.clienteId))
      .limit(1);
    if (!rel) throw new Error('El cliente no tiene una credencial de AFIP asociada');

    const buffer = Buffer.from(ctx.data.base64Data, 'base64');
    // El id se genera acá para poder armar la key de R2 antes de insertar.
    const documentoId = randomUUID();
    const storageKey = r2.documentKey({
      orgId: row.orgId,
      clienteId: row.clienteId,
      documentId: documentoId,
      extension: r2.extensionFor(ctx.data.fileName, ctx.data.mimeType),
    });
    await r2.upload(storageKey, buffer, ctx.data.mimeType);

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

    const created = await auth.api.createUser({
      headers: getRequestHeaders(),
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
