import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/lib/db";
import { profile, client } from "@/drizzle/schema";
import { getSessionWithOrg } from "@/actions/helpers";
import { eq } from "drizzle-orm";

export const getProfile = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    // Get profile with client information
    const [profileData] = await db
      .select({
        id: profile.id,
        clientId: profile.client,
        name: profile.name,
        identityNumber: profile.identityNumber,
        identityType: profile.identityType,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        status: profile.status,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      })
      .from(profile)
      .where(eq(profile.id, ctx.data.id))
      .limit(1);

    if (!profileData) throw new Error("Perfil no encontrado");

    // Verify the client belongs to the user
    if (profileData.clientId) {
      const [clientData] = await db
        .select()
        .from(client)
        .where(eq(client.id, profileData.clientId))
        .limit(1);

      if (!clientData || clientData.organizationId !== orgId) {
        throw new Error("No autorizado");
      }
    }

    return profileData;
  });

