import { auth } from "@/lib/auth";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { db } from "@/lib/db";
import { user as userTable } from "@/drizzle/auth";
import { eq, and } from "drizzle-orm";

export const getSession = createServerFn({
  method: "GET",
}).handler(async () => {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  });
  if (!session) return null;
  return { ...session } as any;
});

export const getSessionAndUser = createServerFn({
  method: "GET",
}).handler(async ({ context }) => {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  });

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, session.user.id));

  return user ?? null;
});

export const getUser = createServerFn({
  method: "GET",
}).handler(async ({ context }) => {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  });

  if (!session?.user) {
    return null;
  }

  // Get the user's organization role from the member table

  return {
    ...session.user,
  };
});

export const getCookieFn = createServerFn({
  method: "GET",
}).handler(async ({ context }) => {
  return getCookie("sidebar_state");
});

export const getDashboardId = createServerFn({
  method: "GET",
}).handler(async ({ context }) => {
  return getCookie("dashboard_id");
});

export const updateUser = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      name: z.string().optional(),
      image: z.string().optional(),
      // phone: z.string().optional(), // Uncomment if phone is added to schema
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");
    const { name, image } = ctx.data;
    const update: any = {};
    if (name !== undefined) update.name = name;
    if (image !== undefined) update.image = image;
    // if (phone !== undefined) update.phone = phone;
    if (Object.keys(update).length === 0)
      throw new Error("No fields to update");
    const [updatedUser] = await db
      .update(userTable)
      .set(update)
      .where(eq(userTable.id, session.user.id))
      .returning();
    if (!updatedUser) throw new Error("User not found");
    return updatedUser;
  });

export const setNewPassword = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      newPassword: z.string(),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");
    const { newPassword } = ctx.data;
    await auth.api
      .setPassword({
        headers: getRequestHeaders(),
        body: {
          newPassword,
        },
      })
      .catch((error) => {
        console.error("Error setting password", error);
        // throw new Error("Error setting password");
      });
    await db
      .update(userTable)
      .set({ changedPassword: true })
      .where(eq(userTable.id, session.user.id));
    // await auth.api.updateUser({
    //   headers: getEvent().headers,
    //   body: {
    //     changedPassword: true,
    //   },
    // });

    return {
      success: true,
    };
  });

export const signOut = createServerFn({
  method: "POST",
}).handler(async (ctx) => {
  await auth.api.signOut({
    headers: getRequestHeaders(),
  });
});
