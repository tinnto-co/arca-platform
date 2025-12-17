import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { db } from "@/lib/db";
import { client } from "@/drizzle/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const createClient = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      name: z.string().min(1, "El nombre es requerido"),
      email: z.string().email("Email inválido"),
      phone: z.string().min(1, "El teléfono es requerido"),
      address: z.string().min(1, "La dirección es requerida"),
      type: z.string().min(1, "El tipo es requerido"),
      image: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const { name, email, phone, address, type, image } = ctx.data;

    const [newClient] = await db
      .insert(client)
      .values({
        name,
        email,
        phone,
        address,
        type,
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
      email: z.string().email("Email inválido"),
      phone: z.string().min(1, "El teléfono es requerido"),
      address: z.string().min(1, "La dirección es requerida"),
      type: z.string().min(1, "El tipo es requerido"),
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
        ...updateData,
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
