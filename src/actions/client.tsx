import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import z from 'zod';
import axios from 'axios';
import { db } from '@/lib/db';
import {
  client,
  profile,
  debt,
  dueDate,
  ivaScrape,
  job,
} from '@/drizzle/schema';
import { auth } from '@/lib/auth';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { eq, and, inArray, desc, asc } from 'drizzle-orm';
const JOBS_API_URL =
  process.env.SCRAPPER_JOBS_URL ||
  process.env.BACKEND_API_URL ||
  'http://localhost:3002';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 300; // ~15 min max per job

const clientBaseSelect = {
  id: client.id,
  organizationId: client.organizationId,
  userId: client.userId,
  name: client.name,
  email: client.email,
  phone: client.phone,
  address: client.address,
  identityNumber: client.identityNumber,
  identityType: client.identityType,
  password: client.password,
  image: client.image,
  status: client.status,
  convenioMultilateral: client.convenioMultilateral,
  regimenLocal: client.regimenLocal,
  fiscalCondition: client.fiscalCondition,
  cuitEmpresa: client.cuitEmpresa,
  esPersonaFisica: client.esPersonaFisica,
  razonSocial: client.razonSocial,
  hasErrors: client.hasErrors,
  errorMessage: client.errorMessage,
  registeredAt: client.registeredAt,
  createdAt: client.createdAt,
  updatedAt: client.updatedAt,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error)
      return `${error.message} | cause: ${cause.message}`;
    if (typeof cause === 'string') return `${error.message} | cause: ${cause}`;
    return error.message;
  }
  return 'Unknown error';
}

export const createClient = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      firstName: z.string().min(1, 'El nombre es requerido'),
      lastName: z.string().min(1, 'El apellido es requerido'),
      name: z.string().min(1, 'El nombre completo es requerido'),
      cuit: z.string().min(1, 'El CUIT es requerido'),
      identityNumber: z.string().min(1, 'El número de identidad es requerido'),
      identityType: z.string().min(1, 'El tipo de identidad es requerido'),
      password: z.string().min(1, 'La contraseña es requerida'),
      email: z.string().email('Email inválido').optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      image: z.string().optional(),
      convenioMultilateral: z.boolean().optional(),
      regimenLocal: z.boolean().optional(),
      fiscalCondition: z
        .enum([
          'responsable_inscripto',
          'monotributista',
          'exento',
          'consumidor_final',
        ])
        .optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const {
      name,
      identityNumber,
      identityType,
      password,
      email,
      phone,
      address,
      image,
      convenioMultilateral,
      regimenLocal,
      fiscalCondition,
    } = ctx.data;

    const [newClient] = await db
      .insert(client)
      .values({
        userId: userId,
        organizationId: orgId,
        name,
        email: email || '',
        phone: phone || '',
        address: address || '',
        identityNumber,
        identityType,
        password,
        image: image || null,
        status: 'active',
        convenioMultilateral: convenioMultilateral ?? false,
        regimenLocal: regimenLocal ?? false,
        fiscalCondition: fiscalCondition ?? null,
        registeredAt: new Date(),
      })
      .returning();

    if (!newClient) throw new Error('Error al crear el cliente');

    return newClient;
  });

export const notifyBackendNewClient = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [clientData] = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(eq(client.id, ctx.data.clientId), eq(client.organizationId, orgId))
      )
      .limit(1);

    if (!clientData) {
      throw new Error('Cliente no encontrado o no autorizado');
    }

    try {
      await axios.post(`${JOBS_API_URL}/api/jobs`, {
        type: 'comprobantes',
        clientId: ctx.data.clientId,
      });
      return { success: true, type: 'comprobantes' };
    } catch (error) {
      throw new Error(
        'Error al crear el job de comprobantes para el nuevo cliente'
      );
    }
  });

export const updateOldClient = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [clientData] = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(eq(client.id, ctx.data.clientId), eq(client.organizationId, orgId))
      )
      .limit(1);

    if (!clientData) {
      throw new Error('Cliente no encontrado o no autorizado');
    }

    // Initiate scraping for old client
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';
    try {
      const response = await axios.post(`${backendUrl}/api/scrap/old-client`, {
        clientId: ctx.data.clientId,
      });
      return {
        success: true,
        message: response.data.message || 'Scraping iniciado',
        clientId: ctx.data.clientId,
      };
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error ||
          'Error al iniciar el scraping para el cliente'
      );
    }
  });

export const getClients = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    const clients = await db
      .select(clientBaseSelect)
      .from(client)
      .where(eq(client.organizationId, orgId))
      .orderBy(asc(client.name));

    return clients;
  } catch (error) {
    throw new Error(`Error loading clients: ${getErrorMessage(error)}`);
  }
});

/** Clientes habilitados para el módulo de liquidación de sueldos. */
export const getClientsForSueldos = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    const rows = await db
      .select({
        profileId: profile.id,
        profileName: profile.name,
        profileIdentityNumber: profile.identityNumber,
        clientId: client.id,
        clientIdentityNumber: client.identityNumber,
      })
      .from(profile)
      .innerJoin(client, eq(profile.client, client.id))
      .where(
        and(eq(client.organizationId, orgId), eq(profile.liquidaSueldos, true))
      )
      .orderBy(asc(profile.name));

    return rows.map((p) => ({
      id: `profile:${p.profileId}`,
      clientId: p.clientId,
      profileId: p.profileId,
      name: p.profileName,
      label: `${p.profileName}${
        p.profileIdentityNumber || p.clientIdentityNumber
          ? ` (${p.profileIdentityNumber ?? p.clientIdentityNumber})`
          : ''
      }`,
      type: 'profile' as const,
    }));
  } catch (error) {
    throw new Error(`Error loading clients: ${getErrorMessage(error)}`);
  }
});

export const getClientsWithProfiles = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    const clients = await db
      .select(clientBaseSelect)
      .from(client)
      .where(eq(client.organizationId, orgId))
      .orderBy(asc(client.name));
    const clientIds = clients.map((c) => c.id);
    if (clientIds.length === 0) {
      return clients.map((c) => ({
        ...c,
        profiles: [] as { id: string; name: string }[],
      }));
    }

    const profiles = await db
      .select({ clientId: profile.client, id: profile.id, name: profile.name, identityNumber: profile.identityNumber })
      .from(profile)
      .where(inArray(profile.client, clientIds));

    const profilesByClientId = new Map<
      string,
      { id: string; name: string; identityNumber: string }[]
    >();
    for (const p of profiles) {
      if (p.clientId) {
        const list = profilesByClientId.get(p.clientId) ?? [];
        list.push({ id: p.id, name: p.name, identityNumber: p.identityNumber });
        profilesByClientId.set(p.clientId, list);
      }
    }

    return clients.map((c) => ({
      ...c,
      profiles: profilesByClientId.get(c.id) ?? [],
    }));
  } catch (error) {
    throw new Error(
      `Error loading clients with profiles: ${getErrorMessage(error)}`
    );
  }
});

export const getClient = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error('Unauthorized');

    const [clientData] = await db
      .select(clientBaseSelect)
      .from(client)
      .where(eq(client.id, ctx.data.id))
      .limit(1);

    if (!clientData) throw new Error('Cliente no encontrado');

    return clientData;
  });

/**
 * Período fiscal del mes anterior en formato "MM/YYYY".
 * Ej: hoy 30/1/26 → "12/2025"
 */
function getPreviousMonthPeriodoFiscal(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = String(prev.getMonth() + 1).padStart(2, '0');
  const year = prev.getFullYear();
  return `${month}/${year}`;
}

/**
 * Dado un período fiscal "MM/YYYY" del resumen que ve el usuario, devuelve el período anterior
 * (el scrape que se usa para "saldo a favor" etc.). Ej: "01/2026" → "12/2025"
 */
function getPreviousMonthFromPeriod(periodoFiscalResumen: string): string {
  const parts = periodoFiscalResumen.trim().split('/');
  if (parts.length !== 2) return getPreviousMonthPeriodoFiscal();
  const mm = parseInt(parts[0], 10);
  const yyyy = parseInt(parts[1], 10);
  if (Number.isNaN(mm) || Number.isNaN(yyyy))
    return getPreviousMonthPeriodoFiscal();
  if (mm === 1) return `12/${yyyy - 1}`;
  return `${String(mm - 1).padStart(2, '0')}/${yyyy}`;
}

export const getClientIvaCredit = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      clientId: z.string(),
      /** Si se pasa, se devuelve IVA solo de este perfil (del mes anterior al indicado o al actual). */
      profileId: z.string().optional(),
      /** Período fiscal del resumen que ve el usuario ("MM/YYYY"). Si se pasa, se devuelve el scrape del período anterior a este. */
      periodoFiscalResumen: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [clientData] = await db
      .select(clientBaseSelect)
      .from(client)
      .where(
        and(eq(client.id, ctx.data.clientId), eq(client.organizationId, orgId))
      )
      .limit(1);

    if (!clientData) {
      throw new Error('Cliente no encontrado o no autorizado');
    }

    const periodoFiscal = ctx.data.periodoFiscalResumen
      ? getPreviousMonthFromPeriod(ctx.data.periodoFiscalResumen)
      : getPreviousMonthPeriodoFiscal();

    // Si hay profileId, validar que pertenezca al cliente
    if (ctx.data.profileId) {
      const [profileRow] = await db
        .select({ id: profile.id })
        .from(profile)
        .where(
          and(
            eq(profile.id, ctx.data.profileId),
            eq(profile.client, clientData.id)
          )
        )
        .limit(1);
      if (!profileRow) {
        return {
          cuit: clientData.identityNumber,
          data: null,
        };
      }
      // IVA scrape del período anterior (al resumen o al mes actual) para este perfil
      const [ivaRow] = await db
        .select()
        .from(ivaScrape)
        .where(
          and(
            eq(ivaScrape.profileId, ctx.data.profileId),
            eq(ivaScrape.periodoFiscal, periodoFiscal)
          )
        )
        .limit(1);
      if (!ivaRow) {
        return {
          cuit: clientData.identityNumber,
          data: null,
        };
      }
      return {
        cuit: clientData.identityNumber,
        data: {
          periodoFiscal: ivaRow.periodoFiscal,
          fechaPresentacion: ivaRow.fechaPresentacion ?? undefined,
          debitoFiscal: ivaRow.debitoFiscal,
          creditoFiscal: ivaRow.creditoFiscal,
          saldoMesPasado: ivaRow.saldoMesPasado,
          saldoArcaMes: ivaRow.saldoArcaMes,
          saldoTecnicoFavorContribuyente: ivaRow.saldoTecnicoFavorContribuyente,
          saldoTecnicoFavorContribuyentePosicionMensual:
            ivaRow.saldoTecnicoFavorContribuyentePosicionMensual,
          saldoLibreDisponibilidadPeriodoAnteriorNeto:
            ivaRow.saldoLibreDisponibilidadPeriodoAnteriorNeto,
          totalRetencionesPercepcionesPeriodo:
            ivaRow.totalRetencionesPercepcionesPeriodo,
          saldoLibreDisponibilidadFavorContribuyentePeriodo:
            ivaRow.saldoLibreDisponibilidadFavorContribuyentePeriodo,
          ok: ivaRow.ok,
        },
        message: 'Datos del período fiscal (scrape mensual).',
      };
    }

    // Sin profileId: sin datos (la UI debe elegir perfil)
    return {
      cuit: clientData.identityNumber,
      data: null,
    };
  });

export const updateClient = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().min(1, 'El nombre es requerido'),
      email: z.string().email('Email inválido').optional().or(z.literal('')),
      phone: z.string().optional().or(z.literal('')),
      address: z.string().optional().or(z.literal('')),
      image: z.string().optional(),
      convenioMultilateral: z.boolean().optional(),
      regimenLocal: z.boolean().optional(),
      fiscalCondition: z
        .enum([
          'responsable_inscripto',
          'monotributista',
          'exento',
          'consumidor_final',
        ])
        .optional()
        .or(z.literal('')),
    })
  )
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { id, ...updateData } = ctx.data;

    const [updatedClient] = await db
      .update(client)
      .set({
        name: updateData.name,
        email: updateData.email || '',
        phone: updateData.phone || '',
        address: updateData.address || '',
        image: updateData.image || null,
        convenioMultilateral:
          typeof updateData.convenioMultilateral === 'boolean'
            ? updateData.convenioMultilateral
            : undefined,
        regimenLocal:
          typeof updateData.regimenLocal === 'boolean'
            ? updateData.regimenLocal
            : undefined,
        fiscalCondition:
          updateData.fiscalCondition === ''
            ? null
            : (updateData.fiscalCondition ?? undefined),
        updatedAt: new Date(),
      })
      .where(eq(client.id, id))
      .returning();

    if (!updatedClient) throw new Error('Error al actualizar el cliente');

    return updatedClient;
  });

export const deleteClient = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [deletedClient] = await db
      .delete(client)
      .where(eq(client.id, ctx.data.id))
      .returning();

    if (!deletedClient) throw new Error('Error al eliminar el cliente');

    return { success: true };
  });

export const getClientProfiles = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error('Unauthorized');

    const profiles = await db
      .select()
      .from(profile)
      .where(eq(profile.client, ctx.data.clientId))
      .orderBy(profile.createdAt);

    return profiles;
  });

export const getClientDebts = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error('Unauthorized');

    const debts = await db
      .select()
      .from(debt)
      .where(eq(debt.client, ctx.data.clientId))
      .orderBy(debt.dueDate);

    return debts;
  });

export const getClientDueDates = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error('Unauthorized');

    const dueDates = await db
      .select()
      .from(dueDate)
      .where(eq(dueDate.client, ctx.data.clientId))
      .orderBy(dueDate.dueDate);

    return dueDates;
  });

export const scrapOldClient = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';
    try {
      const response = await axios.post(`${backendUrl}/api/scrap/old-client`, {
        clientId: ctx.data.clientId,
      });
      return {
        success: true,
        message: response.data.message || 'Scraping iniciado',
        clientId: ctx.data.clientId,
      };
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || 'Error al scrapear el cliente'
      );
    }
  });

/** Espera a que un job termine (finished o failed) haciendo polling */
async function waitForJob(
  baseUrl: string,
  jobId: string
): Promise<{ status: string; result?: unknown; failedReason?: string | null }> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const { data } = await axios.get(`${baseUrl}/api/jobs/${jobId}`);
    if (data.status === 'finished' || data.status === 'failed') {
      return data;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Tiempo de espera agotado esperando el job');
}

export const scrapUpdateClient = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const baseUrl = JOBS_API_URL;
    const { clientId } = ctx.data;

    try {
      // 1. Crear job comprobantes_full y esperar a que termine
      const { data: compJob } = await axios.post(`${baseUrl}/api/jobs`, {
        type: 'comprobantes_full',
        clientId,
      });

      const compResult = await waitForJob(baseUrl, compJob.id);
      if (compResult.status === 'failed') {
        throw new Error(
          compResult.failedReason || 'Error en el scrape de comprobantes'
        );
      }

      // 2. Crear job iva y esperar a que termine
      const { data: ivaJob } = await axios.post(`${baseUrl}/api/jobs`, {
        type: 'iva',
        clientId,
      });

      const ivaResult = await waitForJob(baseUrl, ivaJob.id);
      if (ivaResult.status === 'failed') {
        throw new Error(ivaResult.failedReason || 'Error en el scrape de IVA');
      }

      // 3. Crear job deuda y esperar a que termine
      const { data: deudaJob } = await axios.post(`${baseUrl}/api/jobs`, {
        type: 'deuda',
        clientId,
      });

      const deudaResult = await waitForJob(baseUrl, deudaJob.id);
      if (deudaResult.status === 'failed') {
        throw new Error(
          deudaResult.failedReason || 'Error en el scrape de deudas'
        );
      }

      return {
        success: true,
        message:
          'Cliente actualizado correctamente (comprobantes, IVA y deudas)',
        clientId,
        comprobantes: compResult.result ?? {},
        iva: ivaResult.result ?? {},
        deuda: deudaResult.result ?? {},
      };
    } catch (error: any) {
      console.error('[scrapUpdateClient]', error?.response?.data ?? error);
      const msg =
        error.response?.data?.error ||
        error.message ||
        'Error al actualizar el cliente';
      throw new Error(msg);
    }
  });

/** Encola la actualización de todos los módulos (deudas, vencimientos, novedades, facturas, IVA) para un cliente. */
export const updateClientModules = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { clientId } = ctx.data;

    const [clientData] = await db
      .select({ id: client.id })
      .from(client)
      .where(and(eq(client.id, clientId), eq(client.organizationId, orgId)))
      .limit(1);

    if (!clientData) {
      throw new Error('Cliente no encontrado o no autorizado');
    }

    const baseUrl = JOBS_API_URL;
    const types = [
      'deuda',
      'vencimientos',
      'notificaciones',
      'comprobantes_full',
      'iva',
    ] as const;
    const jobs = types.map((type) => ({ type, clientId }));

    try {
      await axios.post(`${baseUrl}/api/jobs/batch`, { jobs });
      return {
        success: true,
        message:
          'Actualización encolada: deudas, vencimientos, novedades, facturas e IVA',
        clientId,
      };
    } catch (error: any) {
      console.error('[updateClientModules]', error?.response?.data ?? error);
      const msg =
        error.response?.data?.error ||
        error.message ||
        'Error al encolar la actualización';
      throw new Error(msg);
    }
  });

/** [DEBUG] Ejecuta un solo job por tipo - temporal para debugear */
export const scrapSingleJob = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      clientId: z.string(),
      jobType: z.enum([
        'comprobantes_full',
        'comprobantes',
        'iva',
        'deuda',
        'notificaciones',
        'vencimientos',
      ]),
    })
  )
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const baseUrl = JOBS_API_URL;
    const { clientId, jobType } = ctx.data;

    try {
      const { data: job } = await axios.post(`${baseUrl}/api/jobs`, {
        type: jobType,
        clientId,
      });

      const result = await waitForJob(baseUrl, job.id);
      if (result.status === 'failed') {
        throw new Error(
          result.failedReason || `Error en el scrape de ${jobType}`
        );
      }

      return {
        success: true,
        jobType,
        clientId,
        result: result.result ?? {},
      };
    } catch (error: any) {
      console.error('[scrapSingleJob]', error?.response?.data ?? error);
      const msg =
        error.response?.data?.error ||
        error.message ||
        `Error al ejecutar job ${jobType}`;
      throw new Error(msg);
    }
  });

/** Último job comprobantes_full para un cliente (por created_at), con estado success/error. */
export const getLastComprobantesFullJob = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const { clientId } = ctx.data;

    const orgClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));
    const canAccess = orgClients.some((c) => c.id === clientId);
    if (!canAccess) return null;

    const [lastJob] = await db
      .select({
        createdAt: job.createdAt,
        failedReason: job.failedReason,
        status: job.status,
      })
      .from(job)
      .where(and(eq(job.clientId, clientId), eq(job.type, 'comprobantes')))
      .orderBy(desc(job.createdAt))
      .limit(1);

    if (!lastJob?.createdAt) return null;
    const success = lastJob.status !== 'failed' && lastJob.failedReason == null;
    return {
      createdAt: lastJob.createdAt.toISOString(),
      success,
      failedReason: lastJob.failedReason ?? undefined,
    };
  });

/** Último job de un tipo dado para un cliente (por created_at), con estado success/error. */
export const getLastJobByType = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      clientId: z.string(),
      jobType: z.enum([
        'iva',
        'comprobantes',
        'comprobantes_full',
        'notificaciones',
        'deuda',
        'vencimientos',
      ]),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const { clientId, jobType } = ctx.data;

    const orgClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));
    const canAccess = orgClients.some((c) => c.id === clientId);
    if (!canAccess) return null;

    const [lastJob] = await db
      .select({
        createdAt: job.createdAt,
        failedReason: job.failedReason,
        status: job.status,
        result: job.result,
      })
      .from(job)
      .where(and(eq(job.clientId, clientId), eq(job.type, jobType)))
      .orderBy(desc(job.createdAt))
      .limit(1);

    if (!lastJob?.createdAt) return null;
    // "success" debe reflejar el estado real del job (no solo failedReason).
    const success = lastJob.status !== 'failed' && lastJob.failedReason == null;
    const result = lastJob.result as {
      notificationFetchWarning?: string;
      notificationFetchWarningCuits?: string[];
    } | null;
    return {
      createdAt: lastJob.createdAt.toISOString(),
      success,
      status: lastJob.status,
      failedReason: lastJob.failedReason ?? undefined,
      ...(jobType === 'notificaciones' &&
        result?.notificationFetchWarning != null && {
          notificationFetchWarning: result.notificationFetchWarning,
          notificationFetchWarningCuits:
            result.notificationFetchWarningCuits ?? [],
        }),
    };
  });

/** Último job RUNNING de un tipo dado para un cliente (o null si no hay). */
export const getRunningJobByType = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      clientId: z.string(),
      jobType: z.enum([
        'iva',
        'comprobantes',
        'comprobantes_full',
        'notificaciones',
        'deuda',
        'vencimientos',
      ]),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const { clientId, jobType } = ctx.data;

    const orgClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));
    const canAccess = orgClients.some((c) => c.id === clientId);
    if (!canAccess) return null;

    const [runningJob] = await db
      .select({
        id: job.id,
        createdAt: job.createdAt,
        status: job.status,
        progress: job.progress,
      })
      .from(job)
      .where(
        and(
          eq(job.clientId, clientId),
          eq(job.type, jobType),
          eq(job.status, 'running')
        )
      )
      .orderBy(desc(job.createdAt))
      .limit(1);

    if (!runningJob) return null;

    return {
      id: runningJob.id,
      createdAt: runningJob.createdAt.toISOString(),
      status: runningJob.status,
      progress: runningJob.progress,
    };
  });
