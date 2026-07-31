/**
 * Perfiles AFIP de una credencial (login).
 *
 * Regla del modelo: solo se scrapea lo que existe como `cliente`. AFIP siempre lista al propio
 * titular del login y relaciones que el estudio no administra; el scrapper las saltea y las deja
 * anotadas en `job.result.discovery` para que el estudio decida darlas de alta o no.
 */
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import axios from 'axios';
import { db } from '@/lib/db';
import {
  credencialAfip,
  cliente,
  clienteCredencial,
  job,
  comprobante,
  deuda,
  ivaDeclaracion,
  notificacion,
  empleado,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { tipoPersonaDeCuit } from '@/actions/client';
import { eq, and, desc, sql, inArray, asc } from 'drizzle-orm';

const JOBS_API_URL =
  process.env.SCRAPPER_JOBS_URL ??
  process.env.BACKEND_API_URL ??
  'http://localhost:3002';

const normCuit = (s: string) => (s ?? '').replace(/\D/g, '');

interface DiscoveryProfile {
  cuit: string;
  name: string;
  afipContribuyenteId: number;
  enrolled: boolean;
}

/** Carga la credencial validando que pertenezca a la organización activa. */
async function getCredencialDeOrg(credencialId: string, orgId: string) {
  const [cred] = await db
    .select({
      id: credencialAfip.id,
      nombre: credencialAfip.nombre,
      cuit: credencialAfip.cuit,
    })
    .from(credencialAfip)
    .where(
      and(eq(credencialAfip.id, credencialId), eq(credencialAfip.orgId, orgId))
    )
    .limit(1);
  if (!cred) throw new Error('Credencial no encontrada');
  return cred;
}

export const getCredencialProfiles = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ credencialId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const cred = await getCredencialDeOrg(ctx.data.credencialId, orgId);

    const enrolled = await db
      .select({
        id: cliente.id,
        razonSocial: cliente.razonSocial,
        cuit: cliente.cuit,
        afipContribuyenteId: clienteCredencial.afipContribuyenteId,
        // No existe un `scraped_at` por cliente: el dato honesto es cuándo
        // entró el último comprobante suyo.
        ultimoDatoAt: sql<string | null>`(
          select max(${comprobante.updatedAt})::text
          from ${comprobante} where ${comprobante.clienteId} = ${cliente.id}
        )`,
      })
      .from(clienteCredencial)
      .innerJoin(cliente, eq(cliente.id, clienteCredencial.clienteId))
      .where(eq(clienteCredencial.credencialId, cred.id))
      .orderBy(asc(cliente.razonSocial));

    // Último job de comprobantes que haya corrido discovery contra AFIP.
    const [lastDiscovery] = await db
      .select({ result: job.result })
      .from(job)
      .where(
        and(
          eq(job.credencialId, cred.id),
          inArray(job.type, ['comprobantes', 'comprobantes_full']),
          sql`${job.result} -> 'discovery' -> 'profiles' is not null`
        )
      )
      .orderBy(desc(job.createdAt))
      .limit(1);

    const discovery = (
      lastDiscovery?.result as {
        discovery?: { ranAt?: string; profiles?: DiscoveryProfile[] };
      } | null
    )?.discovery;

    // El flag `enrolled` guardado en el job puede estar viejo: se recalcula contra `cliente`.
    const enrolledCuits = new Set(enrolled.map((c) => normCuit(c.cuit)));
    const notEnrolled = (discovery?.profiles ?? [])
      .filter((p) => !enrolledCuits.has(normCuit(p.cuit)))
      .map((p) => ({
        cuit: p.cuit,
        name: p.name,
        afipContribuyenteId: p.afipContribuyenteId,
      }));

    return {
      credencialNombre: cred.nombre,
      credencialCuit: cred.cuit,
      enrolled,
      notEnrolled,
      discoveredAt: discovery?.ranAt ?? null,
    };
  });

export const addProfileAsCliente = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      credencialId: z.string(),
      cuit: z.string().min(11, 'El CUIT debe tener al menos 11 dígitos'),
      razonSocial: z.string().min(1, 'El nombre es requerido'),
      afipContribuyenteId: z.number().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const cred = await getCredencialDeOrg(ctx.data.credencialId, orgId);

    const cuit = normCuit(ctx.data.cuit);

    const created = await db.transaction(async (tx) => {
      // El CUIT puede ya existir como cliente (lo ve otro login): en ese caso
      // solo se agrega la relación con esta credencial.
      const [nuevo] = await tx
        .insert(cliente)
        .values({
          orgId,
          cuit,
          razonSocial: ctx.data.razonSocial,
          tipoPersona: tipoPersonaDeCuit(cuit),
        })
        .onConflictDoUpdate({
          target: [cliente.orgId, cliente.cuit],
          set: { razonSocial: ctx.data.razonSocial },
        })
        .returning();

      await tx
        .insert(clienteCredencial)
        .values({
          clienteId: nuevo.id,
          credencialId: cred.id,
          fuente: 'manual',
          afipContribuyenteId: ctx.data.afipContribuyenteId ?? null,
        })
        .onConflictDoNothing();

      return nuevo;
    });

    // Primer scrapeo del perfil recién habilitado.
    try {
      await axios.post(`${JOBS_API_URL}/api/jobs`, {
        type: 'comprobantes',
        credencialId: cred.id,
      });
    } catch (error) {
      console.error('[addProfileAsCliente] Error encolando job inicial:', error);
    }

    return created;
  });

/** Cuánto dato hay cargado del cliente, para avisar antes de borrarlo. */
export const getClienteDataCounts = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clienteId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId } = ctx.data;

    const [counts] = await db
      .select({
        comprobantes: sql<number>`(select count(*)::int from ${comprobante} where ${comprobante.clienteId} = ${cliente.id})`,
        deudas: sql<number>`(select count(*)::int from ${deuda} where ${deuda.clienteId} = ${cliente.id})`,
        declaracionesIva: sql<number>`(select count(*)::int from ${ivaDeclaracion} where ${ivaDeclaracion.clienteId} = ${cliente.id})`,
        notificaciones: sql<number>`(select count(*)::int from ${notificacion} where ${notificacion.clienteId} = ${cliente.id})`,
        empleados: sql<number>`(select count(*)::int from ${empleado} where ${empleado.clienteId} = ${cliente.id})`,
      })
      .from(cliente)
      .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId)));

    if (!counts) throw new Error('Cliente no encontrado');
    return counts;
  });

export const deleteCliente = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ clienteId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const [borrado] = await db
      .delete(cliente)
      .where(and(eq(cliente.id, ctx.data.clienteId), eq(cliente.orgId, orgId)))
      .returning({ razonSocial: cliente.razonSocial });

    if (!borrado) throw new Error('Cliente no encontrado');
    return { deleted: borrado.razonSocial };
  });
