/* eslint-disable @typescript-eslint/no-explicit-any */
import { betterAuth } from "better-auth";
import { admin, createAuthMiddleware } from "better-auth/plugins";
import { reactStartCookies } from "better-auth/react-start";
import {
  organization as organizationPlugin,
  magicLink,
} from "better-auth/plugins";
import { jwt } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import { anonymous } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { user } from "@/drizzle/auth";
import "dotenv/config";
export const auth = betterAuth({
  trustedOrigins: [
    "http://localhost:3000",
    "https://app.familycapitalfunds.com",
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 24 * 60 * 60, // Cache duration in seconds
    },
  },
  user: {
    additionalFields: {
      changedPassword: {
        type: "boolean",
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    // disableSignUp: true,
  },
  account: {
    accountLinking: {
      enabled: true,
      // trustedProviders: ["google", "email-password"],
    },
  },
  // secondaryStorage: {
  //   get: async (key) => {
  //     const value = await redis.get(key);
  //     return value ? value : null;
  //   },
  //   set: async (key, value, ttl) => {
  //     if (ttl) await redis.set(key, value, { EX: ttl });
  //     // or for ioredis:
  //     // if (ttl) await redis.set(key, value, 'EX', ttl)
  //     else await redis.set(key, value);
  //   },
  //   delete: async (key) => {
  //     await redis.del(key);
  //   },
  // },
  plugins: [anonymous(), admin({}), reactStartCookies()],
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  // hooks: {
  //   after: createAuthMiddleware(async (ctx) => {
  //     if (ctx.path.startsWith("/sign-up")) {
  //       const newSession = ctx.context.newSession;
  //       if (newSession) {
  //         sendMessage({
  //           type: "user-register",
  //           name: newSession.user.name,
  //         });
  //       }
  //     }
  //   }),
  // },
  databaseHooks: {
    session: {
      create: {
        before: async (session /*, ctx */) => {
          // 1) Buscamos la primera (y única) organización del usuario
          const [fullUser] = await db
            .select()
            .from(user)
            .where(eq(user.id, session.userId))
            .limit(1);
          // 2) Devolvemos el payload con activeOrganizationId seteado
          return {
            data: {
              ...session,
              expiresAt: new Date(session.expiresAt),
              createdAt: new Date(session.createdAt),
              updatedAt: new Date(session.updatedAt),
            } as any,
          };
        },
      },
    },
  },
  // socialProviders: {
  //   google: {
  //     // prompt: "select_account",
  //     disableSignUp: true,
  //     disableImplicitSignUp: true,
  //     clientId: process.env.GOOGLE_CLIENT_ID as string,
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
  //   },
  // },
});
