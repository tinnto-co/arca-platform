import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import axios from 'axios';
import { db } from '@/lib/db';
import {
  credencialAfip,
  cliente,
  clienteCredencial,
  clienteEmpleadorConfig,
  clienteEeccConfig,
  deuda,
  vencimiento,
  ivaDeclaracion,
  job,
  alerta,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { encrypt, safeDecrypt } from '@/lib/crypto';
import {
  eq,
  and,
  or,
  inArray,
  desc,
  asc,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';

const JOBS_API_URL =
  process.env.SCRAPPER_JOBS_URL ||
  process.env.BACKEND_API_URL ||
  'http://localhost:3002';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 300; // ~15 min max per job

const credencialBaseSelect = {
  id: credencialAfip.id,
  orgId: credencialAfip.orgId,
  cuit: credencialAfip.cuit,
  nombre: credencialAfip.nombre,
  email: credencialAfip.email,
  telefono: credencialAfip.telefono,
  estado: credencialAfip.estado,
  ultimoLoginOk: credencialAfip.ultimoLoginOk,
  createdAt: credencialAfip.createdAt,
  updatedAt: credencialAfip.updatedAt,
};

const clienteBaseSelect = {
  id: cliente.id,
  orgId: cliente.orgId,
  cuit: cliente.cuit,
  razonSocial: cliente.razonSocial,
  tipoPersona: cliente.tipoPersona,
  condicionIva: cliente.condicionIva,
  iibbRegimen: cliente.iibbRegimen,
  estado: cliente.estado,
  email: cliente.email,
  telefono: cliente.telefono,
  domicilio: cliente.domicilio,
  createdAt: cliente.createdAt,
  updatedAt: cliente.updatedAt,
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

/** Valida que la credencial sea de la organización activa. Devuelve su id. */
async function assertCredencialDeOrg(
  credencialId: string,
  orgId: string
): Promise<string> {
  const [row] = await db
    .select({ id: credencialAfip.id })
    .from(credencialAfip)
    .where(
      and(eq(credencialAfip.id, credencialId), eq(credencialAfip.orgId, orgId))
    )
    .limit(1);
  if (!row) throw new Error('Credencial no encontrada o no autorizada');
  return row.id;
}

export const createCredencial = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      cuit: z.string().min(1, 'El CUIT es requerido'),
      password: z.string().min(1, 'La contraseña es requerida'),
      nombre: z.string().optional(),
      email: z.string().email('Email inválido').optional().or(z.literal('')),
      telefono: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [nueva] = await db
      .insert(credencialAfip)
      .values({
        orgId,
        cuit: ctx.data.cuit,
        clave: encrypt(ctx.data.password),
        nombre: ctx.data.nombre || null,
        email: ctx.data.email || null,
        telefono: ctx.data.telefono || null,
        estado: 'activa',
      })
      .returning();

    if (!nueva) throw new Error('Error al crear la credencial');

    return nueva;
  });

/**
 * Alta de un login de AFIP + los clientes que se eligieron en el discovery,
 * en una transacción. Los vincula por `cliente_credencial`.
 */
export const createCredencialWithClientes = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      cuit: z.string().min(1),
      password: z.string().min(1),
      nombre: z.string().optional(),
      email: z.string().optional(),
      telefono: z.string().optional(),
      clientes: z
        .array(
          z.object({
            cuit: z.string().min(1),
            razonSocial: z.string().min(1),
            afipContribuyenteId: z.number().int().optional(),
          })
        )
        .min(1, 'Debe seleccionar al menos un cliente'),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { cuit, password, nombre, email, telefono, clientes } = ctx.data;

    const result = await db.transaction(async (tx) => {
      const [cred] = await tx
        .insert(credencialAfip)
        .values({
          orgId,
          cuit,
          clave: encrypt(password),
          nombre: nombre || null,
          email: email || null,
          telefono: telefono || null,
          estado: 'activa',
        })
        .returning();

      if (!cred) throw new Error('Error al crear la credencial');

      const creados = [];
      for (const c of clientes) {
        // Un CUIT puede ya existir como cliente (otro login lo ve también):
        // en ese caso sólo se agrega la relación.
        const [nuevo] = await tx
          .insert(cliente)
          .values({
            orgId,
            cuit: c.cuit,
            razonSocial: c.razonSocial,
            tipoPersona: tipoPersonaDeCuit(c.cuit),
          })
          .onConflictDoUpdate({
            target: [cliente.orgId, cliente.cuit],
            set: { razonSocial: c.razonSocial },
          })
          .returning();
        if (!nuevo) continue;

        await tx
          .insert(clienteCredencial)
          .values({
            clienteId: nuevo.id,
            credencialId: cred.id,
            fuente: 'manual',
            afipContribuyenteId: c.afipContribuyenteId ?? null,
          })
          .onConflictDoNothing();

        creados.push(nuevo);
      }

      return { credencial: cred, clientes: creados };
    });

    try {
      await axios.post(`${JOBS_API_URL}/api/jobs`, {
        type: 'comprobantes',
        credencialId: result.credencial.id,
      });
    } catch (error) {
      console.error('Error triggering initial scraping:', error);
    }

    return result;
  });

/** 20/23/24/27 son personas físicas; 30/33/34 jurídicas. */
export function tipoPersonaDeCuit(cuit: string): 'fisica' | 'juridica' {
  return ['20', '23', '24', '27'].includes(cuit.replace(/\D/g, '').slice(0, 2))
    ? 'fisica'
    : 'juridica';
}

export const notifyBackendNewCredencial = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ credencialId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await assertCredencialDeOrg(ctx.data.credencialId, orgId);

    try {
      await axios.post(`${JOBS_API_URL}/api/jobs`, {
        type: 'comprobantes',
        credencialId: ctx.data.credencialId,
      });
      return { success: true, type: 'comprobantes' };
    } catch {
      throw new Error('Error al crear el job de comprobantes');
    }
  });

export const getCredenciales = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    return await db
      .select(credencialBaseSelect)
      .from(credencialAfip)
      .where(eq(credencialAfip.orgId, orgId))
      .orderBy(asc(credencialAfip.nombre));
  } catch (error) {
    throw new Error(`Error loading credentials: ${getErrorMessage(error)}`);
  }
});

/** Clientes con régimen de Ingresos Brutos (módulo IIBB). */
export const getClientesForIIBB = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    return await db
      .select(clienteBaseSelect)
      .from(cliente)
      .where(and(eq(cliente.orgId, orgId), isNotNull(cliente.iibbRegimen)))
      .orderBy(asc(cliente.razonSocial));
  } catch (error) {
    throw new Error(`Error loading IIBB clients: ${getErrorMessage(error)}`);
  }
});

/** Clientes habilitados para el módulo de liquidación de sueldos. */
export const getClientesForSueldos = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    const rows = await db
      .select({
        id: cliente.id,
        razonSocial: cliente.razonSocial,
        cuit: cliente.cuit,
      })
      .from(cliente)
      .innerJoin(
        clienteEmpleadorConfig,
        eq(clienteEmpleadorConfig.clienteId, cliente.id)
      )
      .where(
        and(
          eq(cliente.orgId, orgId),
          eq(clienteEmpleadorConfig.liquidaSueldos, true)
        )
      )
      .orderBy(asc(cliente.razonSocial));

    return rows.map((c) => ({
      id: c.id,
      clienteId: c.id,
      name: c.razonSocial,
      label: `${c.razonSocial} (${c.cuit})`,
    }));
  } catch (error) {
    throw new Error(`Error loading clients: ${getErrorMessage(error)}`);
  }
});

/**
 * Todos los clientes de la organización, con los logins de AFIP por los que
 * se los scrapea y si alguno de esos logins tiene la clave rechazada.
 */
export const getClientes = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { orgId } = await getSessionWithOrg();

    const [clientes, relaciones, credAlertas] = await Promise.all([
      db
        .select(clienteBaseSelect)
        .from(cliente)
        .where(eq(cliente.orgId, orgId))
        .orderBy(asc(cliente.razonSocial)),
      db
        .select({
          clienteId: clienteCredencial.clienteId,
          credencialId: clienteCredencial.credencialId,
          credencialCuit: credencialAfip.cuit,
          credencialNombre: credencialAfip.nombre,
        })
        .from(clienteCredencial)
        .innerJoin(
          credencialAfip,
          eq(credencialAfip.id, clienteCredencial.credencialId)
        )
        .where(eq(credencialAfip.orgId, orgId)),
      db
        .select({ credencialId: alerta.credencialId })
        .from(alerta)
        .where(
          and(
            eq(alerta.orgId, orgId),
            eq(alerta.tipo, 'error_scraping'),
            eq(alerta.estado, 'abierta'),
            sql`${alerta.detalle}->>'errorCategory' = 'credentials'`
          )
        ),
    ]);

    const credencialesConError = new Set(
      credAlertas.map((a) => a.credencialId).filter(Boolean)
    );
    const porCliente = new Map<string, typeof relaciones>();
    for (const r of relaciones) {
      const lista = porCliente.get(r.clienteId) ?? [];
      lista.push(r);
      porCliente.set(r.clienteId, lista);
    }

    return clientes.map((c) => {
      const creds = porCliente.get(c.id) ?? [];
      return {
        ...c,
        credenciales: creds.map((r) => ({
          id: r.credencialId,
          cuit: r.credencialCuit,
          nombre: r.credencialNombre,
        })),
        credentialError: creds.some((r) =>
          credencialesConError.has(r.credencialId)
        ),
      };
    });
  } catch (error) {
    throw new Error(`Error loading clients: ${getErrorMessage(error)}`);
  }
});

export const getCliente = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [row] = await db
      .select(clienteBaseSelect)
      .from(cliente)
      .where(and(eq(cliente.id, ctx.data.id), eq(cliente.orgId, orgId)))
      .limit(1);

    if (!row) throw new Error('Cliente no encontrado');

    return row;
  });

/** Los logins de AFIP por los que se scrapea a este cliente. */
export const getClienteCredenciales = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ clienteId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    return await db
      .select({
        ...credencialBaseSelect,
        preferida: clienteCredencial.preferida,
        afipContribuyenteId: clienteCredencial.afipContribuyenteId,
      })
      .from(clienteCredencial)
      .innerJoin(
        credencialAfip,
        eq(credencialAfip.id, clienteCredencial.credencialId)
      )
      .where(
        and(
          eq(clienteCredencial.clienteId, ctx.data.clienteId),
          eq(credencialAfip.orgId, orgId)
        )
      )
      .orderBy(desc(clienteCredencial.preferida));
  });

/** Los clientes que se scrapean con este login. */
export const getCredencialClientes = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ credencialId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    return await db
      .select(clienteBaseSelect)
      .from(clienteCredencial)
      .innerJoin(cliente, eq(cliente.id, clienteCredencial.clienteId))
      .where(
        and(
          eq(clienteCredencial.credencialId, ctx.data.credencialId),
          eq(cliente.orgId, orgId)
        )
      )
      .orderBy(asc(cliente.razonSocial));
  });

export const getCredencialPassword = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ credencialId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await assertCredencialDeOrg(ctx.data.credencialId, orgId);

    const [cred] = await db
      .select({ clave: credencialAfip.clave })
      .from(credencialAfip)
      .where(eq(credencialAfip.id, ctx.data.credencialId))
      .limit(1);

    return { password: cred?.clave ? safeDecrypt(cred.clave) : '' };
  });

/** Primer día del mes anterior, que es como se guarda `periodo` (date). */
function periodoMesAnterior(): string {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
  return prev.toISOString().slice(0, 10);
}

/** Dado un periodo "YYYY-MM-DD", devuelve el primer día del mes anterior. */
function periodoAnteriorA(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  if (!y || !m) return periodoMesAnterior();
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}

/** Declaración de IVA (F2051 scrapeado) del período anterior al que se mira. */
export const getClienteIvaCredit = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      clienteId: z.string(),
      /** Período del resumen que ve el usuario ("YYYY-MM-DD"). */
      periodoResumen: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [row] = await db
      .select({ id: cliente.id, cuit: cliente.cuit })
      .from(cliente)
      .where(and(eq(cliente.id, ctx.data.clienteId), eq(cliente.orgId, orgId)))
      .limit(1);

    if (!row) throw new Error('Cliente no encontrado o no autorizado');

    const periodo = ctx.data.periodoResumen
      ? periodoAnteriorA(ctx.data.periodoResumen)
      : periodoMesAnterior();

    const [iva] = await db
      .select()
      .from(ivaDeclaracion)
      .where(
        and(
          eq(ivaDeclaracion.clienteId, row.id),
          eq(ivaDeclaracion.periodo, periodo)
        )
      )
      .limit(1);

    return {
      cuit: row.cuit,
      data: iva ?? null,
      ...(iva && { message: 'Datos del período fiscal (scrape mensual).' }),
    };
  });

export const updateCliente = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string(),
      razonSocial: z.string().min(1, 'La razón social es requerida'),
      email: z.string().email('Email inválido').optional().or(z.literal('')),
      telefono: z.string().optional().or(z.literal('')),
      domicilio: z.string().optional().or(z.literal('')),
      notas: z.string().optional().or(z.literal('')),
      condicionIva: z
        .enum([
          'responsable_inscripto',
          'monotributista',
          'exento',
          'no_alcanzado',
        ])
        .optional()
        .or(z.literal('')),
      iibbRegimen: z
        .enum(['local', 'convenio_multilateral'])
        .optional()
        .or(z.literal('')),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { id, ...data } = ctx.data;

    // Update parcial: sólo se pisan los campos que vinieron en el payload.
    // `undefined` = el formulario no maneja ese campo; `''` = el usuario lo
    // vació a propósito. Sin esa distinción, un diálogo que no muestra
    // `notas` las borraba en cada guardado.
    const patch: Partial<typeof cliente.$inferInsert> = {
      razonSocial: data.razonSocial,
    };
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.telefono !== undefined) patch.telefono = data.telefono || null;
    if (data.domicilio !== undefined) patch.domicilio = data.domicilio || null;
    if (data.notas !== undefined) patch.notas = data.notas || null;
    if (data.condicionIva !== undefined)
      patch.condicionIva = data.condicionIva || null;
    if (data.iibbRegimen !== undefined)
      patch.iibbRegimen = data.iibbRegimen || null;

    const [updated] = await db
      .update(cliente)
      .set(patch)
      .where(and(eq(cliente.id, id), eq(cliente.orgId, orgId)))
      .returning();

    if (!updated) throw new Error('Error al actualizar el cliente');

    return updated;
  });

export const updateCredencialPassword = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string(),
      password: z.string().min(1, 'La contraseña es requerida'),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [updated] = await db
      .update(credencialAfip)
      .set({ clave: encrypt(ctx.data.password), estado: 'activa' })
      .where(
        and(
          eq(credencialAfip.id, ctx.data.id),
          eq(credencialAfip.orgId, orgId)
        )
      )
      .returning({ id: credencialAfip.id });

    if (!updated) throw new Error('Error al actualizar la contraseña');

    // La clave nueva invalida las alertas abiertas de credenciales rechazadas.
    await db
      .update(alerta)
      .set({
        estado: 'resuelta',
        resueltaAt: new Date(),
        resueltaPor: userId,
      })
      .where(
        and(
          eq(alerta.orgId, orgId),
          eq(alerta.credencialId, ctx.data.id),
          eq(alerta.tipo, 'error_scraping'),
          eq(alerta.estado, 'abierta'),
          sql`${alerta.detalle}->>'errorCategory' = 'credentials'`
        )
      );

    return { success: true };
  });

export const deleteCredencial = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [deleted] = await db
      .delete(credencialAfip)
      .where(
        and(eq(credencialAfip.id, ctx.data.id), eq(credencialAfip.orgId, orgId))
      )
      .returning();

    if (!deleted) throw new Error('Error al eliminar la credencial');

    return { success: true };
  });

export const getClienteDeudas = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ clienteId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    return await db
      .select()
      .from(deuda)
      .where(
        and(eq(deuda.orgId, orgId), eq(deuda.clienteId, ctx.data.clienteId))
      )
      .orderBy(deuda.venceAt);
  });

/**
 * Deudas del CUIT de un login de AFIP. AFIP las devuelve por login, no por
 * cliente, así que las que no se pudieron atribuir viven acá.
 */
export const getCredencialDeudas = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ credencialId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    return await db
      .select({
        deuda,
        clienteRazonSocial: cliente.razonSocial,
      })
      .from(deuda)
      .leftJoin(cliente, eq(cliente.id, deuda.clienteId))
      .where(
        and(
          eq(deuda.orgId, orgId),
          eq(deuda.credencialId, ctx.data.credencialId)
        )
      )
      .orderBy(deuda.venceAt);
  });

export const updateDeudaEstado = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      estado: z.enum(['abierta', 'pagada', 'plan_pago', 'prescripta']),
      intimada: z.boolean(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [updated] = await db
      .update(deuda)
      .set({ estado: ctx.data.estado, intimada: ctx.data.intimada })
      .where(and(eq(deuda.id, ctx.data.id), eq(deuda.orgId, orgId)))
      .returning({ id: deuda.id });

    if (!updated) throw new Error('Deuda no encontrada o sin acceso');

    return { ok: true };
  });

export const getCredencialVencimientos = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      credencialId: z.string(),
      clienteId: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const conditions = [
      eq(vencimiento.orgId, orgId),
      eq(vencimiento.credencialId, ctx.data.credencialId),
    ];
    // AFIP devuelve los vencimientos por CUIT del login, sin CUIT por fila: casi
    // todos quedan con `cliente_id` null. Son del login, así que se muestran
    // igual junto a los del cliente elegido (si no, la pestaña queda vacía).
    if (ctx.data.clienteId)
      conditions.push(
        or(
          eq(vencimiento.clienteId, ctx.data.clienteId),
          isNull(vencimiento.clienteId)
        )!
      );

    return await db
      .select()
      .from(vencimiento)
      .where(and(...conditions))
      .orderBy(vencimiento.venceAt);
  });

/**
 * Espera a que un job termine (finished o failed) haciendo polling.
 * El scrapper corre bajo RLS: la lectura necesita saber de qué organización es.
 */
async function waitForJob(
  baseUrl: string,
  jobId: string,
  orgId: string
): Promise<{ status: string; result?: unknown; failedReason?: string | null }> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const { data } = await axios.get(`${baseUrl}/api/jobs/${jobId}`, {
      params: { orgId },
    });
    if (data.status === 'finished' || data.status === 'failed') {
      return data;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Tiempo de espera agotado esperando el job');
}

/** Encola la actualización de todos los módulos para un login de AFIP. */
export const updateCredencialModules = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ credencialId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { credencialId } = ctx.data;
    await assertCredencialDeOrg(credencialId, orgId);

    const types = [
      'deuda',
      'vencimientos',
      'notificaciones',
      'comprobantes_full',
      'iva',
    ] as const;
    // Evitar duplicados: omitir tipos que ya tienen un job pending/running.
    const activeJobs = await db
      .select({ type: job.type })
      .from(job)
      .where(
        and(
          eq(job.credencialId, credencialId),
          inArray(job.type, [...types]),
          inArray(job.status, ['pending', 'running'])
        )
      );
    const activeTypes = new Set(activeJobs.map((j) => j.type));
    const skipped = types.filter((t) => activeTypes.has(t));
    const pendingTypes = types.filter((t) => !activeTypes.has(t));

    if (pendingTypes.length === 0) {
      return {
        success: true,
        message: 'Todos los módulos ya tienen actualizaciones en curso',
        credencialId,
        skipped,
      };
    }

    const jobs = pendingTypes.map((type) => ({ type, credencialId }));

    try {
      await axios.post(`${JOBS_API_URL}/api/jobs/batch`, { jobs });
      return {
        success: true,
        message:
          skipped.length > 0
            ? `Actualización encolada (${pendingTypes.length} módulos; ${skipped.length} ya en ejecución)`
            : 'Actualización encolada: deudas, vencimientos, novedades, facturas e IVA',
        credencialId,
        skipped,
      };
    } catch (error: any) {
      console.error('[updateCredencialModules]', error?.response?.data ?? error);
      throw new Error(
        error.response?.data?.error ||
          error.message ||
          'Error al encolar la actualización'
      );
    }
  });

/**
 * Encola en batch (fire-and-forget) los módulos seleccionados para varios
 * logins de AFIP. No espera la finalización de los jobs.
 */
export const scrapBatchJobs = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      credencialIds: z.array(z.string()).min(1),
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

    const { credencialIds, jobTypes } = ctx.data;

    const owned = await db
      .select({ id: credencialAfip.id })
      .from(credencialAfip)
      .where(
        and(
          inArray(credencialAfip.id, credencialIds),
          eq(credencialAfip.orgId, orgId)
        )
      );

    if (owned.length === 0) {
      throw new Error('Credenciales no encontradas o no autorizadas');
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

    // Evitar duplicados: omitir pares (credencial, tipo) que ya tienen
    // un job pending/running.
    const activeJobs = await db
      .select({ credencialId: job.credencialId, type: job.type })
      .from(job)
      .where(
        and(
          inArray(
            job.credencialId,
            owned.map((o) => o.id)
          ),
          inArray(job.type, [...orderedTypes]),
          inArray(job.status, ['pending', 'running'])
        )
      );
    const activeSet = new Set(
      activeJobs.map((j) => `${j.credencialId}:${j.type}`)
    );

    const allPairs = owned.flatMap(({ id }) =>
      orderedTypes.map((type) => ({ type, credencialId: id }))
    );
    const jobs = allPairs.filter(
      (j) => !activeSet.has(`${j.credencialId}:${j.type}`)
    );
    const skipped = allPairs.length - jobs.length;

    if (jobs.length === 0) {
      return { success: true, created: 0, errors: 0, skipped };
    }

    try {
      const { data } = await axios.post<{ created?: number; errors?: number }>(
        `${JOBS_API_URL}/api/jobs/batch`,
        { jobs }
      );
      return {
        success: true,
        created: data?.created ?? jobs.length,
        errors: data?.errors ?? 0,
        skipped,
      };
    } catch (error) {
      const axiosError = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      console.error('[scrapBatchJobs]', axiosError.response?.data ?? error);
      throw new Error(
        axiosError.response?.data?.error ??
          axiosError.message ??
          'Error al encolar la actualización masiva'
      );
    }
  });

/** Ejecuta un solo job por tipo y espera a que termine. */
export const scrapSingleJob = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      credencialId: z.string(),
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
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { credencialId, jobType } = ctx.data;
    await assertCredencialDeOrg(credencialId, orgId);

    // Si ya hay un job pending/running para esta credencial+tipo (p. ej.
    // otro cliente que comparte login), reusarlo en vez de encolar un
    // scrape duplicado: cada job scrapea todas las relaciones del login.
    const [existing] = await db
      .select({ id: job.id })
      .from(job)
      .where(
        and(
          eq(job.credencialId, credencialId),
          eq(job.type, jobType),
          inArray(job.status, ['pending', 'running'])
        )
      )
      .limit(1);

    try {
      let jobId: string;
      if (existing) {
        jobId = existing.id;
      } else {
        const { data: created } = await axios.post(`${JOBS_API_URL}/api/jobs`, {
          type: jobType,
          credencialId,
        });
        jobId = created.id;
      }

      const result = await waitForJob(JOBS_API_URL, jobId, orgId);
      if (result.status === 'failed') {
        throw new Error(
          result.failedReason || `Error en el scrape de ${jobType}`
        );
      }

      return {
        success: true,
        jobType,
        credencialId,
        result: result.result ?? {},
      };
    } catch (error: any) {
      console.error('[scrapSingleJob]', error?.response?.data ?? error);
      throw new Error(
        error.response?.data?.error ||
          error.message ||
          `Error al ejecutar job ${jobType}`
      );
    }
  });

/** Último job de un tipo dado para un login (por created_at), con estado success/error. */
export const getLastJobByType = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      credencialId: z.string(),
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
    const { credencialId, jobType } = ctx.data;

    const [lastJob] = await db
      .select({
        createdAt: job.createdAt,
        failedReason: job.failedReason,
        status: job.status,
        result: job.result,
      })
      .from(job)
      .where(
        and(
          eq(job.orgId, orgId),
          eq(job.credencialId, credencialId),
          eq(job.type, jobType)
        )
      )
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

/** Último job RUNNING de un tipo dado para un login (o null si no hay). */
export const getRunningJobByType = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      credencialId: z.string(),
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
    const { credencialId, jobType } = ctx.data;

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
          eq(job.orgId, orgId),
          eq(job.credencialId, credencialId),
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

export const markVencimientoCompletado = createServerFn({
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

    const [updated] = await db
      .update(vencimiento)
      .set({
        completadoAt: ctx.data.completed ? new Date() : null,
        completadoPor: ctx.data.completed ? userId : null,
      })
      .where(
        and(eq(vencimiento.id, ctx.data.id), eq(vencimiento.orgId, orgId))
      )
      .returning({ id: vencimiento.id });

    if (!updated) throw new Error('Vencimiento no encontrado o sin acceso');

    return { ok: true };
  });

/** Cierre de ejercicio del cliente, para los avisos de presentación de balance. */
export const getEeccConfig = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clienteId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [config] = await db
      .select({
        clienteId: clienteEeccConfig.clienteId,
        actividadPrincipal: clienteEeccConfig.actividadPrincipal,
        cierreEjercicioMes: clienteEeccConfig.cierreEjercicioMes,
        firmanteId: clienteEeccConfig.firmanteId,
      })
      .from(clienteEeccConfig)
      .innerJoin(cliente, eq(cliente.id, clienteEeccConfig.clienteId))
      .where(
        and(
          eq(clienteEeccConfig.clienteId, ctx.data.clienteId),
          eq(cliente.orgId, orgId)
        )
      );

    return config ?? null;
  });

export const upsertEeccConfig = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clienteId: z.string().uuid(),
      cierreEjercicioMes: z.number().int().min(1).max(12).nullable(),
      actividadPrincipal: z.string().optional(),
      firmanteId: z.string().uuid().nullable().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { clienteId, cierreEjercicioMes, actividadPrincipal, firmanteId } =
      ctx.data;

    const [c] = await db
      .select({ id: cliente.id })
      .from(cliente)
      .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId)));
    if (!c) throw new Error('Cliente no encontrado o sin acceso');

    await db
      .insert(clienteEeccConfig)
      .values({
        clienteId,
        cierreEjercicioMes,
        actividadPrincipal: actividadPrincipal || null,
        firmanteId: firmanteId ?? null,
      })
      .onConflictDoUpdate({
        target: clienteEeccConfig.clienteId,
        set: {
          cierreEjercicioMes,
          actividadPrincipal: actividadPrincipal || null,
          firmanteId: firmanteId ?? null,
        },
      });

    return { ok: true };
  });
