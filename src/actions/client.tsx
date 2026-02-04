import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import axios from "axios";
import { db } from "@/lib/db";
import { client, profile, debt, dueDate, ivaScrape } from "@/drizzle/schema";
import { auth } from "@/lib/auth";
import { eq, and, inArray } from "drizzle-orm";

export const createClient = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      firstName: z.string().min(1, "El nombre es requerido"),
      lastName: z.string().min(1, "El apellido es requerido"),
      name: z.string().min(1, "El nombre completo es requerido"),
      cuit: z.string().min(1, "El CUIT es requerido"),
      identityNumber: z.string().min(1, "El número de identidad es requerido"),
      identityType: z.string().min(1, "El tipo de identidad es requerido"),
      password: z.string().min(1, "La contraseña es requerida"),
      email: z.string().email("Email inválido").optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      image: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const {
      name,
      identityNumber,
      identityType,
      password,
      email,
      phone,
      address,
      image,
    } = ctx.data;

    const [newClient] = await db
      .insert(client)
      .values({
        userId: session.user.id,
        name,
        email: email || "",
        phone: phone || "",
        address: address || "",
        identityNumber,
        identityType,
        password,
        image: image || null,
        status: "active",
        registeredAt: new Date(),
      })
      .returning();

    if (!newClient) throw new Error("Error al crear el cliente");

    return newClient;
  });

export const notifyBackendNewClient = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Verify client belongs to user
    const [clientData] = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(eq(client.id, ctx.data.clientId), eq(client.userId, session.user.id))
      )
      .limit(1);

    if (!clientData) {
      throw new Error("Cliente no encontrado o no autorizado");
    }

    // Notify backend about new client
    const backendUrl = process.env.BACKEND_API_URL || "http://localhost:3001";
    try {
      await axios.post(`${backendUrl}/api/scrap/new-client`, {
        clientId: ctx.data.clientId,
      });
      return { success: true };
    } catch (error) {
      throw new Error("Error al notificar al backend sobre el nuevo cliente");
    }
  });

export const updateOldClient = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Verify client belongs to user
    const [clientData] = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(eq(client.id, ctx.data.clientId), eq(client.userId, session.user.id))
      )
      .limit(1);

    if (!clientData) {
      throw new Error("Cliente no encontrado o no autorizado");
    }

    // Initiate scraping for old client
    const backendUrl = process.env.BACKEND_API_URL || "http://localhost:3001";
    try {
      const response = await axios.post(`${backendUrl}/api/scrap/old-client`, {
        clientId: ctx.data.clientId,
      });
      return {
        success: true,
        message: response.data.message || "Scraping iniciado",
        clientId: ctx.data.clientId,
      };
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error ||
        "Error al iniciar el scraping para el cliente"
      );
    }
  });

export const getClients = createServerFn({
  method: "GET",
}).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error("Unauthorized");

  const clients = await db.select().from(client).where(eq(client.userId, session.user.id)).orderBy(client.createdAt);

  return clients;
});

export const getClientsWithProfiles = createServerFn({
  method: "GET",
}).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error("Unauthorized");

  const clients = await db.select().from(client).where(eq(client.userId, session.user.id)).orderBy(client.createdAt);
  const clientIds = clients.map((c) => c.id);
  if (clientIds.length === 0) {
    return clients.map((c) => ({ ...c, profiles: [] as { id: string; name: string }[] }));
  }

  const profiles = await db
    .select({ clientId: profile.client, id: profile.id, name: profile.name })
    .from(profile)
    .where(inArray(profile.client, clientIds));

  const profilesByClientId = new Map<string, { id: string; name: string }[]>();
  for (const p of profiles) {
    if (p.clientId) {
      const list = profilesByClientId.get(p.clientId) ?? [];
      list.push({ id: p.id, name: p.name });
      profilesByClientId.set(p.clientId, list);
    }
  }

  return clients.map((c) => ({
    ...c,
    profiles: profilesByClientId.get(c.id) ?? [],
  }));
});

export const getClient = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const [clientData] = await db
      .select()
      .from(client)
      .where(eq(client.id, ctx.data.id))
      .limit(1);

    if (!clientData) throw new Error("Cliente no encontrado");

    return clientData;
  });

/**
 * Período fiscal del mes anterior en formato "MM/YYYY".
 * Ej: hoy 30/1/26 → "12/2025"
 */
function getPreviousMonthPeriodoFiscal(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = String(prev.getMonth() + 1).padStart(2, "0");
  const year = prev.getFullYear();
  return `${month}/${year}`;
}

/**
 * Dado un período fiscal "MM/YYYY" del resumen que ve el usuario, devuelve el período anterior
 * (el scrape que se usa para "saldo a favor" etc.). Ej: "01/2026" → "12/2025"
 */
function getPreviousMonthFromPeriod(periodoFiscalResumen: string): string {
  const parts = periodoFiscalResumen.trim().split("/");
  if (parts.length !== 2) return getPreviousMonthPeriodoFiscal();
  const mm = parseInt(parts[0]!, 10);
  const yyyy = parseInt(parts[1]!, 10);
  if (Number.isNaN(mm) || Number.isNaN(yyyy)) return getPreviousMonthPeriodoFiscal();
  if (mm === 1) return `12/${yyyy - 1}`;
  return `${String(mm - 1).padStart(2, "0")}/${yyyy}`;
}

export const getClientIvaCredit = createServerFn({
  method: "POST",
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
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Obtener datos del cliente y validar que pertenezca al usuario
    const [clientData] = await db
      .select()
      .from(client)
      .where(
        and(eq(client.id, ctx.data.clientId), eq(client.userId, session.user.id))
      )
      .limit(1);

    if (!clientData) {
      throw new Error("Cliente no encontrado o no autorizado");
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
            eq(profile.id, ctx.data.profileId!),
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
            eq(ivaScrape.profileId, ctx.data.profileId!),
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
        message: "Datos del período fiscal (scrape mensual).",
      };
    }

    // Sin profileId: sin datos (la UI debe elegir perfil)
    return {
      cuit: clientData.identityNumber,
      data: null,
    };
  });

export const updateClient = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().min(1, "El nombre es requerido"),
      email: z.string().email("Email inválido").optional().or(z.literal("")),
      phone: z.string().optional().or(z.literal("")),
      address: z.string().optional().or(z.literal("")),
      image: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const { id, ...updateData } = ctx.data;

    const [updatedClient] = await db
      .update(client)
      .set({
        name: updateData.name,
        email: updateData.email || "",
        phone: updateData.phone || "",
        address: updateData.address || "",
        image: updateData.image || null,
        updatedAt: new Date(),
      })
      .where(eq(client.id, id))
      .returning();

    if (!updatedClient) throw new Error("Error al actualizar el cliente");

    return updatedClient;
  });

export const deleteClient = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const [deletedClient] = await db
      .delete(client)
      .where(eq(client.id, ctx.data.id))
      .returning();

    if (!deletedClient) throw new Error("Error al eliminar el cliente");

    return { success: true };
  });

export const getClientProfiles = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const profiles = await db
      .select()
      .from(profile)
      .where(eq(profile.client, ctx.data.clientId))
      .orderBy(profile.createdAt);

    return profiles;
  });

export const getClientDebts = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const debts = await db
      .select()
      .from(debt)
      .where(eq(debt.client, ctx.data.clientId))
      .orderBy(debt.dueDate);

    return debts;
  });

export const getClientDueDates = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const dueDates = await db
      .select()
      .from(dueDate)
      .where(eq(dueDate.client, ctx.data.clientId))
      .orderBy(dueDate.dueDate);

    return dueDates;
  });

export const scrapOldClient = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const backendUrl = process.env.BACKEND_API_URL || "http://localhost:3001";
    try {
      const response = await axios.post(`${backendUrl}/api/scrap/old-client`, {
        clientId: ctx.data.clientId,
      });
      return {
        success: true,
        message: response.data.message || "Scraping iniciado",
        clientId: ctx.data.clientId,
      };
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Error al scrapear el cliente");
    }
  });
