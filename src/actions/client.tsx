import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import z from 'zod';
import axios from 'axios';
import { db } from '@/lib/db';
import {
  representative,
  client,
  debt,
  dueDate,
  ivaScrape,
  job,
  representativeBalanceConfig,
  alert,
} from '@/drizzle/schema';
import { auth } from '@/lib/auth';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { encrypt, safeDecrypt } from '@/lib/crypto';
import { eq, and, inArray, desc, asc, or, sql } from 'drizzle-orm';
const JOBS_API_URL =
  process.env.SCRAPPER_JOBS_URL ||
  process.env.BACKEND_API_URL ||
  'http://localhost:3002';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 300; // ~15 min max per job

const representativeBaseSelect = {
  id: representative.id,
  organizationId: representative.organizationId,
  userId: representative.userId,
  name: representative.name,
  email: representative.email,
  phone: representative.phone,
  address: representative.address,
  cuit: representative.cuit,
  image: representative.image,
  status: representative.status,
  convenioMultilateral: representative.convenioMultilateral,
  regimenLocal: representative.regimenLocal,
  fiscalCondition: representative.fiscalCondition,
  registeredAt: representative.registeredAt,
  createdAt: representative.createdAt,
  updatedAt: representative.updatedAt,
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

export const createRepresentative = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      firstName: z.string().min(1, 'El nombre es requerido'),
      lastName: z.string().min(1, 'El apellido es requerido'),
      name: z.string().min(1, 'El nombre completo es requerido'),
      cuit: z.string().min(1, 'El CUIT es requerido'),
      identityNumber: z.string().min(1, 'El numero de identidad es requerido'),
      password: z.string().min(1, 'La contrasena es requerida'),
      email: z.string().email('Email invalido').optional(),
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
      password,
      email,
      phone,
      address,
      image,
      convenioMultilateral,
      regimenLocal,
      fiscalCondition,
    } = ctx.data;

    const [newRepresentative] = await db
      .insert(representative)
      .values({
        userId: userId,
        organizationId: orgId,
        name,
        cuit: identityNumber,
        afipPassword: password ? encrypt(password) : '',
        email: email || '',
        phone: phone || '',
        address: address || '',
        image: image || null,
        status: 'active',
        convenioMultilateral: convenioMultilateral ?? false,
        regimenLocal: regimenLocal ?? false,
        fiscalCondition: fiscalCondition ?? null,
        registeredAt: new Date(),
      })
      .returning();

    if (!newRepresentative) throw new Error('Error al crear el cliente');

    return newRepresentative;
  });

/**
 * Creates a representative + selected clients in one transaction.
 * Called from the new 2-step creation dialog after profile discovery.
 */
export const createRepresentativeWithClients = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      cuit: z.string().min(1),
      password: z.string().min(1),
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      clients: z.array(z.object({
        cuit: z.string().min(1),
        name: z.string().min(1),
      })).min(1, 'Debe seleccionar al menos un cliente'),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { cuit, password, name, email, phone, clients: selectedClients } = ctx.data;

    const result = await db.transaction(async (tx) => {
      // 1. Create representative
      const [rep] = await tx
        .insert(representative)
        .values({
          userId,
          organizationId: orgId,
          name: name || null,
          cuit,
          afipPassword: encrypt(password),
          email: email || '',
          phone: phone || '',
          status: 'active',
          registeredAt: new Date(),
        })
        .returning();

      if (!rep) throw new Error('Error al crear el representante');

      // 2. Create selected clients
      const createdClients = [];
      for (const cl of selectedClients) {
        const [newClient] = await tx
          .insert(client)
          .values({
            representativeId: rep.id,
            name: cl.name,
            identityNumber: cl.cuit,
            identityType: 'cuit',
            address: '',
            phone: '',
            email: '',
            status: 'active',
          })
          .returning();
        if (newClient) createdClients.push(newClient);
      }

      return { representative: rep, clients: createdClients };
    });

    // 3. Trigger initial scraping
    try {
      await axios.post(`${JOBS_API_URL}/api/jobs`, {
        type: 'comprobantes',
        representativeId: result.representative.id,
      });
    } catch (error) {
      console.error('Error triggering initial scraping:', error);
    }

    return result;
  });

export const notifyBackendNewRepresentative = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ representativeId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [representativeData] = await db
      .select({ id: representative.id })
      .from(representative)
      .where(
        and(eq(representative.id, ctx.data.representativeId), eq(representative.organizationId, orgId))
      )
      .limit(1);

    if (!representativeData) {
      throw new Error('Cliente no encontrado o no autorizado');
    }

    try {
      await axios.post(`${JOBS_API_URL}/api/jobs`, {
        type: 'comprobantes',
        representativeId: ctx.data.representativeId,
      });
      return { success: true, type: 'comprobantes' };
    } catch (error) {
      throw new Error(
        'Error al crear el job de comprobantes para el nuevo cliente'
      );
    }
  });

export const updateOldRepresentative = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ representativeId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [representativeData] = await db
      .select({ id: representative.id })
      .from(representative)
      .where(
        and(eq(representative.id, ctx.data.representativeId), eq(representative.organizationId, orgId))
      )
      .limit(1);

    if (!representativeData) {
      throw new Error('Cliente no encontrado o no autorizado');
    }

    // Initiate scraping for old representative
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';
    try {
      const response = await axios.post(`${backendUrl}/api/scrap/old-client`, {
        clientId: ctx.data.representativeId,
      });
      return {
        success: true,
        message: response.data.message || 'Scraping iniciado',
        representativeId: ctx.data.representativeId,
      };
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error ||
        'Error al iniciar el scraping para el cliente'
      );
    }
  });

export const getRepresentatives = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    const representatives = await db
      .select(representativeBaseSelect)
      .from(representative)
      .where(eq(representative.organizationId, orgId))
      .orderBy(asc(representative.name));

    return representatives;
  } catch (error) {
    throw new Error(`Error loading clients: ${getErrorMessage(error)}`);
  }
});

/** Clientes con régimen local o convenio multilateral (módulo IIBB). */
export const getRepresentativesForIIBB = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    const rows = await db
      .select({
        ...representativeBaseSelect,
        clientId: client.id,
        clientName: client.name,
        clientIdentityNumber: client.identityNumber,
      })
      .from(representative)
      .leftJoin(client, eq(client.representativeId, representative.id))
      .where(
        and(
          eq(representative.organizationId, orgId),
          or(eq(representative.convenioMultilateral, true), eq(representative.regimenLocal, true))
        )
      )
      .orderBy(asc(representative.name));

    const grouped = Map.groupBy(rows, (r) => r.id);
    return [...grouped.values()].map((repRows) => {
      const { clientId, clientName, clientIdentityNumber, ...rep } = repRows[0];
      return {
        ...rep,
        clients: repRows
          .filter((r) => r.clientId !== null)
          .map((r) => ({ id: r.clientId!, name: r.clientName, identityNumber: r.clientIdentityNumber })),
      };
    });
  } catch (error) {
    throw new Error(`Error loading IIBB clients: ${getErrorMessage(error)}`);
  }
});

/** Clientes habilitados para el modulo de liquidacion de sueldos. */
export const getRepresentativesForSueldos = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    const rows = await db
      .select({
        clientId: client.id,
        clientName: client.name,
        clientIdentityNumber: client.identityNumber,
        representativeId: representative.id,
        representativeIdentityNumber: representative.cuit,
      })
      .from(client)
      .innerJoin(representative, eq(client.representativeId, representative.id))
      .where(
        and(eq(representative.organizationId, orgId), eq(client.liquidaSueldos, true))
      )
      .orderBy(asc(client.name));

    return rows.map((p) => ({
      id: `client:${p.clientId}`,
      representativeId: p.representativeId,
      clientId: p.clientId,
      name: p.clientName,
      label: `${p.clientName}${p.clientIdentityNumber || p.representativeIdentityNumber
        ? ` (${p.clientIdentityNumber ?? p.representativeIdentityNumber})`
        : ''
        }`,
      type: 'client' as const,
    }));
  } catch (error) {
    throw new Error(`Error loading clients: ${getErrorMessage(error)}`);
  }
});

export const getClientsWithRepresentative = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  return await db
    .select({
      id: client.id,
      name: client.name,
      identityNumber: client.identityNumber,
      status: client.status,
      representativeId: client.representativeId,
      representativeName: representative.name,
      createdAt: client.createdAt,
    })
    .from(client)
    .innerJoin(representative, eq(client.representativeId, representative.id))
    .where(eq(representative.organizationId, orgId))
    .orderBy(asc(client.name));
});

export const getRepresentativesWithClients = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const rows = await db
    .select({
      ...representativeBaseSelect,
      clientId: client.id,
      clientName: client.name,
      clientIdentityNumber: client.identityNumber,
    })
    .from(representative)
    .leftJoin(client, eq(client.representativeId, representative.id))
    .where(eq(representative.organizationId, orgId))
    .orderBy(asc(representative.name));

  const grouped = Map.groupBy(rows, (r) => r.id);

  return [...grouped.values()].map((rows) => {
    const { clientId, clientName, clientIdentityNumber, ...rep } = rows[0];
    return {
      ...rep,
      clients: rows
        .filter((r) => r.clientId !== null)
        .map((r) => ({ id: r.clientId!, name: r.clientName, identityNumber: r.clientIdentityNumber })),
    };
  });
});

export const getClients = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    const [rows, credAlerts] = await Promise.all([
      db
        .select({
          id: client.id,
          name: client.name,
          identityNumber: client.identityNumber,
          status: client.status,
          createdAt: client.createdAt,
          representativeId: client.representativeId,
          representativeName: representative.name,
          representativeCuit: representative.cuit,
        })
        .from(client)
        .innerJoin(representative, eq(client.representativeId, representative.id))
        .where(eq(representative.organizationId, orgId))
        .orderBy(asc(client.name)),
      db
        .select({ representativeId: alert.representativeId })
        .from(alert)
        .where(
          and(
            eq(alert.organizationId, orgId),
            eq(alert.type, 'scraper_error'),
            eq(alert.status, 'open'),
            sql`${alert.metadata}->>'errorCategory' = 'credentials'`
          )
        ),
    ]);

    const credentialErrorReps = new Set(
      credAlerts.map((a) => a.representativeId).filter(Boolean)
    );

    return rows.map((row) => ({
      ...row,
      credentialError: credentialErrorReps.has(row.representativeId),
    }));
  } catch (error) {
    throw new Error(`Error loading clients: ${getErrorMessage(error)}`);
  }
});

export const getRepresentative = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error('Unauthorized');

    const [representativeData] = await db
      .select(representativeBaseSelect)
      .from(representative)
      .where(eq(representative.id, ctx.data.id))
      .limit(1);

    if (!representativeData) throw new Error('Cliente no encontrado');

    return representativeData;
  });

export const getRepresentativePassword = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ representativeId: z.string() }))
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [rep] = await db
      .select({ afipPassword: representative.afipPassword })
      .from(representative)
      .where(eq(representative.id, ctx.data.representativeId))
      .limit(1);

    if (!rep) throw new Error('Representante no encontrado');

    return { password: rep.afipPassword ? safeDecrypt(rep.afipPassword) : '' };
  });

/**
 * Periodo fiscal del mes anterior en formato "MM/YYYY".
 * Ej: hoy 30/1/26 -> "12/2025"
 */
function getPreviousMonthPeriodoFiscal(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = String(prev.getMonth() + 1).padStart(2, '0');
  const year = prev.getFullYear();
  return `${month}/${year}`;
}

/**
 * Dado un periodo fiscal "MM/YYYY" del resumen que ve el usuario, devuelve el periodo anterior
 * (el scrape que se usa para "saldo a favor" etc.). Ej: "01/2026" -> "12/2025"
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

export const getRepresentativeIvaCredit = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      representativeId: z.string(),
      /** Si se pasa, se devuelve IVA solo de este cliente (del mes anterior al indicado o al actual). */
      clientId: z.string().optional(),
      /** Periodo fiscal del resumen que ve el usuario ("MM/YYYY"). Si se pasa, se devuelve el scrape del periodo anterior a este. */
      periodoFiscalResumen: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [representativeData] = await db
      .select(representativeBaseSelect)
      .from(representative)
      .where(
        and(eq(representative.id, ctx.data.representativeId), eq(representative.organizationId, orgId))
      )
      .limit(1);

    if (!representativeData) {
      throw new Error('Cliente no encontrado o no autorizado');
    }

    const periodoFiscal = ctx.data.periodoFiscalResumen
      ? getPreviousMonthFromPeriod(ctx.data.periodoFiscalResumen)
      : getPreviousMonthPeriodoFiscal();

    // Si hay clientId, validar que pertenezca al representante
    if (ctx.data.clientId) {
      const [clientRow] = await db
        .select({ id: client.id })
        .from(client)
        .where(
          and(
            eq(client.id, ctx.data.clientId),
            eq(client.representativeId, representativeData.id)
          )
        )
        .limit(1);
      if (!clientRow) {
        return {
          cuit: representativeData.cuit,
          data: null,
        };
      }
      // IVA scrape del periodo anterior (al resumen o al mes actual) para este cliente
      const [ivaRow] = await db
        .select()
        .from(ivaScrape)
        .where(
          and(
            eq(ivaScrape.clientId, ctx.data.clientId),
            eq(ivaScrape.periodoFiscal, periodoFiscal)
          )
        )
        .limit(1);
      if (!ivaRow) {
        return {
          cuit: representativeData.cuit,
          data: null,
        };
      }
      return {
        cuit: representativeData.cuit,
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
        message: 'Datos del periodo fiscal (scrape mensual).',
      };
    }

    // Sin clientId: sin datos (la UI debe elegir cliente)
    return {
      cuit: representativeData.cuit,
      data: null,
    };
  });

export const updateRepresentative = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().min(1, 'El nombre es requerido'),
      email: z.string().email('Email invalido').optional().or(z.literal('')),
      phone: z.string().optional().or(z.literal('')),
      address: z.string().optional().or(z.literal('')),
      image: z.string().optional(),
      // Contraseña de AFIP (usada por el scraper). Vacío/ausente = no se modifica.
      password: z.string().optional(),
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
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { id, password, ...updateData } = ctx.data;

    const [updatedRepresentative] = await db
      .update(representative)
      .set({
        name: updateData.name,
        email: updateData.email || '',
        phone: updateData.phone || '',
        address: updateData.address || '',
        image: updateData.image || null,
        // Solo se re-encripta y actualiza si el usuario ingresó una nueva contraseña.
        afipPassword: password ? encrypt(password) : undefined,
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
      .where(
        and(
          eq(representative.id, id),
          eq(representative.organizationId, orgId)
        )
      )
      .returning();

    if (!updatedRepresentative) throw new Error('Error al actualizar el cliente');

    return updatedRepresentative;
  });

export const updateRepresentativePassword = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string(),
      password: z.string().min(1, 'La contrasena es requerida'),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [updated] = await db
      .update(representative)
      .set({
        afipPassword: encrypt(ctx.data.password),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(representative.id, ctx.data.id),
          eq(representative.organizationId, orgId)
        )
      )
      .returning({ id: representative.id });

    if (!updated) throw new Error('Error al actualizar la contrasena');

    // Resolver alertas abiertas de credenciales invalidas de este representante
    await db
      .update(alert)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(alert.organizationId, orgId),
          eq(alert.representativeId, ctx.data.id),
          eq(alert.type, 'scraper_error'),
          eq(alert.status, 'open'),
          sql`${alert.metadata}->>'errorCategory' = 'credentials'`
        )
      );

    return { success: true };
  });

export const deleteRepresentative = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [deletedRepresentative] = await db
      .delete(representative)
      .where(eq(representative.id, ctx.data.id))
      .returning();

    if (!deletedRepresentative) throw new Error('Error al eliminar el cliente');

    return { success: true };
  });

export const getRepresentativeClients = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ representativeId: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error('Unauthorized');

    const clients = await db
      .select()
      .from(client)
      .where(eq(client.representativeId, ctx.data.representativeId))
      .orderBy(client.createdAt);

    return clients;
  });

export const getRepresentativeDebts = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ representativeId: z.string(), clientId: z.string().optional() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error('Unauthorized');

    const conditions = [eq(debt.representativeId, ctx.data.representativeId)];
    if (ctx.data.clientId) {
      conditions.push(eq(debt.clientId, ctx.data.clientId));
    }

    const debts = await db
      .select({
        id: debt.id,
        representativeId: debt.representativeId,
        clientId: debt.clientId,
        clientName: client.name,
        establishment: debt.establishment,
        tax: debt.tax,
        concept: debt.concept,
        subConcept: debt.subConcept,
        period: debt.period,
        quotaNumber: debt.quotaNumber,
        dueDate: debt.dueDate,
        balance: debt.balance,
        compensatoryInterest: debt.compensatoryInterest,
        punitiveInterest: debt.punitiveInterest,
        status: debt.status,
        detectedAt: debt.detectedAt,
        sourcePeriod: debt.sourcePeriod,
        isIntimated: debt.isIntimated,
        createdAt: debt.createdAt,
        updatedAt: debt.updatedAt,
      })
      .from(debt)
      .leftJoin(client, eq(debt.clientId, client.id))
      .where(and(...conditions))
      .orderBy(debt.dueDate);

    return debts;
  });

export const updateDebtStatus = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(['open', 'in_plan', 'paid', 'disputed']),
      isIntimated: z.boolean(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Validate debt belongs to this org via representative
    const [existing] = await db
      .select({ id: debt.id, representativeId: debt.representativeId })
      .from(debt)
      .innerJoin(representative, eq(debt.representativeId, representative.id))
      .where(and(eq(debt.id, ctx.data.id), eq(representative.organizationId, orgId)));

    if (!existing) throw new Error('Deuda no encontrada o sin acceso');

    await db
      .update(debt)
      .set({ status: ctx.data.status, isIntimated: ctx.data.isIntimated })
      .where(eq(debt.id, ctx.data.id));

    return { ok: true };
  });

export const getRepresentativeDueDates = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      representativeId: z.string(),
      clientId: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error('Unauthorized');

    const conditions = [eq(dueDate.representativeId, ctx.data.representativeId)];
    if (ctx.data.clientId) {
      conditions.push(eq(dueDate.clientId, ctx.data.clientId));
    }

    const dueDates = await db
      .select()
      .from(dueDate)
      .where(and(...conditions))
      .orderBy(dueDate.dueDate);

    return dueDates;
  });

export const scrapOldRepresentative = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ representativeId: z.string() }))
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';
    try {
      const response = await axios.post(`${backendUrl}/api/scrap/old-client`, {
        clientId: ctx.data.representativeId,
      });
      return {
        success: true,
        message: response.data.message || 'Scraping iniciado',
        representativeId: ctx.data.representativeId,
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

export const scrapUpdateRepresentative = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ representativeId: z.string() }))
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const baseUrl = JOBS_API_URL;
    const { representativeId } = ctx.data;

    try {
      // 1. Crear job comprobantes_full y esperar a que termine
      const { data: compJob } = await axios.post(`${baseUrl}/api/jobs`, {
        type: 'comprobantes_full',
        representativeId,
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
        representativeId,
      });

      const ivaResult = await waitForJob(baseUrl, ivaJob.id);
      if (ivaResult.status === 'failed') {
        throw new Error(ivaResult.failedReason || 'Error en el scrape de IVA');
      }

      // 3. Crear job deuda y esperar a que termine
      const { data: deudaJob } = await axios.post(`${baseUrl}/api/jobs`, {
        type: 'deuda',
        representativeId,
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
        representativeId,
        comprobantes: compResult.result ?? {},
        iva: ivaResult.result ?? {},
        deuda: deudaResult.result ?? {},
      };
    } catch (error: any) {
      console.error('[scrapUpdateRepresentative]', error?.response?.data ?? error);
      const msg =
        error.response?.data?.error ||
        error.message ||
        'Error al actualizar el cliente';
      throw new Error(msg);
    }
  });

/** Encola la actualizacion de todos los modulos (deudas, vencimientos, novedades, facturas, IVA) para un representante. */
export const updateRepresentativeModules = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ representativeId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { representativeId } = ctx.data;

    const [representativeData] = await db
      .select({ id: representative.id })
      .from(representative)
      .where(and(eq(representative.id, representativeId), eq(representative.organizationId, orgId)))
      .limit(1);

    if (!representativeData) {
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
    const jobs = types.map((type) => ({ type, representativeId }));

    try {
      await axios.post(`${baseUrl}/api/jobs/batch`, { jobs });
      return {
        success: true,
        message:
          'Actualizacion encolada: deudas, vencimientos, novedades, facturas e IVA',
        representativeId,
      };
    } catch (error: any) {
      console.error('[updateRepresentativeModules]', error?.response?.data ?? error);
      const msg =
        error.response?.data?.error ||
        error.message ||
        'Error al encolar la actualizacion';
      throw new Error(msg);
    }
  });

/**
 * Encola en batch (fire-and-forget) los módulos seleccionados para varios
 * representantes. No espera la finalización de los jobs.
 */
export const scrapBatchJobs = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      representativeIds: z.array(z.string()).min(1),
      jobTypes: z
        .array(
          z.enum([
            'deuda',
            'vencimientos',
            'notificaciones',
            'comprobantes',
            'iva',
          ])
        )
        .min(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { representativeIds, jobTypes } = ctx.data;

    const owned = await db
      .select({ id: representative.id })
      .from(representative)
      .where(
        and(
          inArray(representative.id, representativeIds),
          eq(representative.organizationId, orgId)
        )
      );

    if (owned.length === 0) {
      throw new Error('Clientes no encontrados o no autorizados');
    }

    // Si se piden comprobantes e IVA juntos, encolar comprobantes primero
    // (misma semántica que el flujo "Comprobantes + IVA" del detalle).
    const orderedTypes = (
      [
        'deuda',
        'vencimientos',
        'notificaciones',
        'comprobantes',
        'iva',
      ] as const
    ).filter((t) => jobTypes.includes(t));

    const jobs = owned.flatMap(({ id }) =>
      orderedTypes.map((type) => ({ type, representativeId: id }))
    );

    try {
      const { data } = await axios.post<{ created?: number; errors?: number }>(
        `${JOBS_API_URL}/api/jobs/batch`,
        { jobs }
      );
      return {
        success: true,
        created: data?.created ?? jobs.length,
        errors: data?.errors ?? 0,
      };
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      console.error('[scrapBatchJobs]', axiosError.response?.data ?? error);
      const msg =
        axiosError.response?.data?.error ??
        axiosError.message ??
        'Error al encolar la actualización masiva';
      throw new Error(msg);
    }
  });

/** [DEBUG] Ejecuta un solo job por tipo - temporal para debugear */
export const scrapSingleJob = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      representativeId: z.string(),
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
    console.log('[scrapSingleJob] start', ctx.data);
    await getSessionWithOrg();
    console.log('[scrapSingleJob] session ok');
    const role = await getMemberRole();
    console.log('[scrapSingleJob] role:', role);
    assertCanWrite(role);
    console.log('[scrapSingleJob] canWrite ok');

    const baseUrl = JOBS_API_URL;
    const { representativeId, jobType } = ctx.data;
    console.log('[scrapSingleJob] posting to', `${baseUrl}/api/jobs`);

    try {
      const { data: job } = await axios.post(`${baseUrl}/api/jobs`, {
        type: jobType,
        representativeId,
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
        representativeId,
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


/** Ultimo job comprobantes_full para un representante (por created_at), con estado success/error. */
export const getLastComprobantesFullJob = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ representativeId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const { representativeId } = ctx.data;

    const orgRepresentatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));
    const canAccess = orgRepresentatives.some((c) => c.id === representativeId);
    if (!canAccess) return null;

    const [lastJob] = await db
      .select({
        createdAt: job.createdAt,
        failedReason: job.failedReason,
        status: job.status,
      })
      .from(job)
      .where(and(eq(job.representativeId, representativeId), eq(job.type, 'comprobantes')))
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

/** Ultimo job de un tipo dado para un representante (por created_at), con estado success/error. */
export const getLastJobByType = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      representativeId: z.string(),
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

    const { representativeId, jobType } = ctx.data;

    const orgRepresentatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));
    const canAccess = orgRepresentatives.some((c) => c.id === representativeId);
    if (!canAccess) return null;

    const [lastJob] = await db
      .select({
        createdAt: job.createdAt,
        failedReason: job.failedReason,
        status: job.status,
        result: job.result,
      })
      .from(job)
      .where(and(eq(job.representativeId, representativeId), eq(job.type, jobType)))
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

/** Ultimo job RUNNING de un tipo dado para un representante (o null si no hay). */
export const getRunningJobByType = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      representativeId: z.string(),
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

    const { representativeId, jobType } = ctx.data;

    const orgRepresentatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));
    const canAccess = orgRepresentatives.some((c) => c.id === representativeId);
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
          eq(job.representativeId, representativeId),
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

export const markDueDateCompleted = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      completed: z.boolean(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Validate due_date belongs to this org via representative
    const [existing] = await db
      .select({ id: dueDate.id })
      .from(dueDate)
      .innerJoin(representative, eq(dueDate.representativeId, representative.id))
      .where(
        and(eq(dueDate.id, ctx.data.id), eq(representative.organizationId, orgId))
      );

    if (!existing) throw new Error('Vencimiento no encontrado o sin acceso');

    await db
      .update(dueDate)
      .set({
        completedAt: ctx.data.completed ? new Date() : null,
        completedByUserId: ctx.data.completed ? userId : null,
      })
      .where(eq(dueDate.id, ctx.data.id));

    return { ok: true };
  });

export const getBalanceConfig = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ representativeId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [c] = await db
      .select({ id: representative.id })
      .from(representative)
      .where(
        and(eq(representative.id, ctx.data.representativeId), eq(representative.organizationId, orgId))
      );
    if (!c) throw new Error('Cliente no encontrado o sin acceso');

    const [config] = await db
      .select()
      .from(representativeBalanceConfig)
      .where(eq(representativeBalanceConfig.representativeId, ctx.data.representativeId));

    return (config ?? null) as
      | (typeof config & { alertDaysBefore: number[] })
      | null;
  });

export const upsertBalanceConfig = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      representativeId: z.string().uuid(),
      fiscalYearEndMonth: z.number().int().min(1).max(12),
      fiscalYearEndDay: z.number().int().min(1).max(31),
      presentationDueDays: z.number().int().nullable().optional(),
      alertDaysBefore: z.array(z.number().int()).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const {
      representativeId,
      fiscalYearEndMonth,
      fiscalYearEndDay,
      presentationDueDays,
      alertDaysBefore,
    } = ctx.data;

    const [c] = await db
      .select({ id: representative.id })
      .from(representative)
      .where(and(eq(representative.id, representativeId), eq(representative.organizationId, orgId)));
    if (!c) throw new Error('Cliente no encontrado o sin acceso');

    await db
      .insert(representativeBalanceConfig)
      .values({
        representativeId,
        fiscalYearEndMonth,
        fiscalYearEndDay,
        presentationDueDays: presentationDueDays ?? null,
        alertDaysBefore: alertDaysBefore ?? [60, 30, 15, 7],
      })
      .onConflictDoUpdate({
        target: representativeBalanceConfig.representativeId,
        set: {
          fiscalYearEndMonth,
          fiscalYearEndDay,
          presentationDueDays: presentationDueDays ?? null,
          alertDaysBefore: alertDaysBefore ?? [60, 30, 15, 7],
          updatedAt: new Date(),
        },
      });

    return { ok: true };
  });
