import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import z from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { member, organization, user } from '@/drizzle/auth';
import { mandaEnElEstudio, ROL_SOPORTE } from '@/lib/permissions';
import {
  hayCorreoConfigurado,
  linkDeInvitacion,
} from '@/lib/send-invitation-email';
import {
  configuracionOrg,
  organizationModule,
  orgModule,
} from '@/drizzle/schema';
import {
  UMBRAL_CONTROL_BANCARIO_DEFAULT,
  type UmbralControlBancario,
} from '@/lib/extracto-calc';
import { and, eq, ne, or } from 'drizzle-orm';
import { getMemberRole, getSessionWithOrg } from './helpers';
import { seedBaseChartForOrg } from '@/lib/accounting-seed';

/**
 * Sesión + verificación de que quien llama es owner del estudio.
 *
 * Se apoya en `getSessionWithOrg()` en lugar de leer la sesión por su cuenta:
 * ese helper es el que activa el contexto de RLS (`app.org_id`). Sin él, las
 * escrituras sobre tablas con política —`organization_module`, por ejemplo—
 * salían por el pool sin organización y Postgres las rechazaba.
 */
async function requireOwner() {
  const { session, orgId, userId } = await getSessionWithOrg();

  if (!mandaEnElEstudio(await getMemberRole())) {
    throw new Error('Solo el administrador puede realizar esta acción');
  }

  return {
    session,
    orgId,
    userId,
    esSuperadmin: (session.user as { role?: string | null }).role === 'admin',
  };
}

export const getOrgMembers = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId, esSuperadmin } = await requireOwner();

  const members = await db
    .select({
      memberId: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    // El estudio no ve los accesos de soporte: su lista de miembros es su
    // gente. El rastro de quién entró vive en `superadmin_acceso`, que es el
    // registro de la plataforma y se consulta desde el módulo Superadmin.
    //
    // El superadmin sí los ve: si entró a revisar quién tiene acceso a este
    // estudio, esconderle justamente los accesos de plataforma sería mentirle
    // sobre lo que está mirando.
    .where(
      esSuperadmin
        ? eq(member.organizationId, orgId)
        : and(eq(member.organizationId, orgId), ne(member.role, ROL_SOPORTE))
    );

  return members.map((m) => ({ ...m, esSoporte: m.role === ROL_SOPORTE }));
});

export const getOrgDetails = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await requireOwner();

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  if (!org) throw new Error('Organización no encontrada');
  return org;
});

export const updateOrg = createServerFn({
  method: 'POST',
})
  .validator(
    z.object({
      name: z.string().min(1).optional(),
      slug: z.string().min(1).optional(),
      logo: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await requireOwner();

    await auth.api.updateOrganization({
      headers: getRequestHeaders(),
      body: {
        data: {
          name: ctx.data.name,
          slug: ctx.data.slug,
          logo: ctx.data.logo,
        },
        organizationId: orgId,
      },
    });

    return { success: true };
  });

export const inviteMember = createServerFn({
  method: 'POST',
})
  .validator(
    z.object({
      email: z.string().email(),
      role: z.enum(['owner', 'member', 'viewer']),
    })
  )
  .handler(async (ctx) => {
    await requireOwner();

    const result = await auth.api.createInvitation({
      headers: getRequestHeaders(),
      body: {
        email: ctx.data.email,
        role: ctx.data.role,
      },
    });

    // La invitación se crea siempre; el correo sale sólo si hay con qué
    // mandarlo. Sin esto la pantalla decía "Invitación enviada" aunque el
    // envío se hubiera salteado, y el invitado nunca se enteraba.
    return {
      ...result,
      emailEnviado: hayCorreoConfigurado(),
      link: linkDeInvitacion(result.id),
    };
  });

export const removeMember = createServerFn({
  method: 'POST',
})
  .validator(z.object({ memberIdOrEmail: z.string() }))
  .handler(async (ctx) => {
    const { orgId, userId, esSuperadmin } = await requireOwner();

    // Better Auth impide dejar al estudio sin ningún dueño, pero no impide
    // que te borres a vos si hay otros. Desde una pantalla que se llama
    // "Miembros" y tiene una papelera por fila, eso es un botón para quedarte
    // afuera de tu propio estudio sin querer. Esta pantalla administra a los
    // demás; irse es otra acción y merece su propio lugar.
    const [propia] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, orgId),
          eq(member.userId, userId),
          or(
            eq(member.id, ctx.data.memberIdOrEmail),
            eq(member.userId, ctx.data.memberIdOrEmail)
          )
        )
      )
      .limit(1);
    if (propia) {
      throw new Error(
        'No podés quitarte a vos misma desde acá. Pedile a otro administrador que lo haga.'
      );
    }

    // El acceso de soporte no es del estudio y no se revoca desde acá: se
    // cierra saliendo, desde el módulo de plataforma. Esconder el botón en la
    // pantalla no alcanza —la server function se puede llamar igual—, así que
    // la regla vive donde se aplica.
    if (!esSuperadmin) {
      const [objetivo] = await db
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.organizationId, orgId),
            or(
              eq(member.id, ctx.data.memberIdOrEmail),
              eq(member.userId, ctx.data.memberIdOrEmail)
            )
          )
        )
        .limit(1);
      if (objetivo?.role === ROL_SOPORTE) {
        throw new Error(
          'El acceso de soporte de Orddo no se quita desde acá. Escribinos y lo cerramos.'
        );
      }
    }

    await auth.api.removeMember({
      headers: getRequestHeaders(),
      body: {
        memberIdOrEmail: ctx.data.memberIdOrEmail,
      },
    });

    return { success: true };
  });

export const updateMemberRole = createServerFn({
  method: 'POST',
})
  .validator(
    z.object({
      memberId: z.string(),
      role: z.enum(['owner', 'member', 'viewer']),
    })
  )
  .handler(async (ctx) => {
    await requireOwner();

    await auth.api.updateMemberRole({
      headers: getRequestHeaders(),
      body: {
        memberId: ctx.data.memberId,
        role: ctx.data.role,
      },
    });

    return { success: true };
  });

export const getOrgInvitations = createServerFn({
  method: 'GET',
}).handler(async () => {
  await requireOwner();

  const invitations = await auth.api.listInvitations({
    headers: getRequestHeaders(),
    query: {},
  });

  return invitations;
});

export const cancelInvitation = createServerFn({
  method: 'POST',
})
  .validator(z.object({ invitationId: z.string() }))
  .handler(async (ctx) => {
    await requireOwner();

    await auth.api.cancelInvitation({
      headers: getRequestHeaders(),
      body: { invitationId: ctx.data.invitationId },
    });

    return { success: true };
  });

/** Los módulos vienen del enum de la BD: una sola fuente de verdad. */
const MODULES = orgModule.enumValues;

export type OrgModule = (typeof MODULES)[number];

export const listOrgModules = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const rows = await db
    .select()
    .from(organizationModule)
    .where(eq(organizationModule.orgId, orgId));

  return MODULES.map((m) => ({
    module: m,
    enabled: rows.find((r) => r.module === m)?.enabled ?? false,
    enabledAt: rows.find((r) => r.module === m)?.enabledAt ?? null,
  }));
});

export const setModuleEnabled = createServerFn({
  method: 'POST',
})
  .validator(
    z.object({
      module: z.enum(MODULES),
      enabled: z.boolean(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await requireOwner();

    await db
      .insert(organizationModule)
      .values({
        orgId,
        module: ctx.data.module,
        enabled: ctx.data.enabled,
        enabledAt: ctx.data.enabled ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [organizationModule.orgId, organizationModule.module],
        set: {
          enabled: ctx.data.enabled,
          enabledAt: ctx.data.enabled ? new Date() : null,
        },
      });

    // Al activar Contabilidad, sembrar el plan de cuentas base del estudio.
    // Idempotente: solo inserta las cuentas base que falten.
    if (ctx.data.module === 'contabilidad' && ctx.data.enabled) {
      await seedBaseChartForOrg(orgId);
    }

    return { success: true };
  });

/* ─────────────────────── Preferencias del estudio ─────────────────────── */

/**
 * Cuándo avisar que lo que entró al banco no se parece a lo facturado.
 *
 * Es una preferencia, no una regla del negocio: el estudio mira varias
 * empresas y decide con qué desvío quiere que lo molesten. Se guarda en
 * `configuracion_org`; sin fila, vale el default de `extracto-calc`.
 */
export const CLAVE_UMBRAL_BANCO = 'control_bancario_umbral';

export const getUmbralControlBancario = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const [fila] = await db
    .select({ valor: configuracionOrg.valor })
    .from(configuracionOrg)
    .where(
      and(
        eq(configuracionOrg.orgId, orgId),
        eq(configuracionOrg.clave, CLAVE_UMBRAL_BANCO)
      )
    );

  const guardado = fila?.valor as Partial<UmbralControlBancario> | undefined;
  // Si alguien guardó un jsonb raro a mano, el default evita que la pantalla
  // se quede sin umbral: es preferible avisar de más que no avisar.
  return {
    porcentaje:
      typeof guardado?.porcentaje === 'number'
        ? guardado.porcentaje
        : UMBRAL_CONTROL_BANCARIO_DEFAULT.porcentaje,
    esDefault: !fila,
  };
});

export const setUmbralControlBancario = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      /** Un umbral de 0% avisaría siempre; de 100%, casi nunca. */
      porcentaje: z.number().min(1).max(100),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await requireOwner();

    await db
      .insert(configuracionOrg)
      .values({
        orgId,
        clave: CLAVE_UMBRAL_BANCO,
        valor: { porcentaje: ctx.data.porcentaje },
      })
      .onConflictDoUpdate({
        target: [configuracionOrg.orgId, configuracionOrg.clave],
        set: {
          valor: { porcentaje: ctx.data.porcentaje },
        },
      });

    return { success: true };
  });
