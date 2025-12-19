import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { db } from "@/lib/db";
import { client, profile, debt, dueDate } from "@/drizzle/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

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

export const getClients = createServerFn({
  method: "GET",
}).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error("Unauthorized");

  const clients = await db.select().from(client).orderBy(client.createdAt);

  return clients;
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
