/* eslint-disable @typescript-eslint/no-explicit-any */
import { betterAuth } from 'better-auth';
import { admin, organization } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/lib/db';
import { anonymous } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { member } from '@/drizzle/auth';
import { ac, owner, member as memberRole, viewer } from '@/lib/permissions';
import { sendOrganizationInvitationEmail } from '@/lib/send-invitation-email';
import 'dotenv/config';

export const auth = betterAuth({
  trustedOrigins: ['http://localhost:3000', 'https://blakg.tinnto.co'],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 24 * 60 * 60,
    },
  },
  user: {
    additionalFields: {
      changedPassword: {
        type: 'boolean',
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  plugins: [
    anonymous(),
    admin({}),
    tanstackStartCookies(),
    organization({
      ac,
      roles: {
        owner,
        member: memberRole,
        viewer,
      },
      allowUserToCreateOrganization: false,
      sendInvitationEmail: sendOrganizationInvitationEmail,
    }),
  ],
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [membership] = await db
            .select()
            .from(member)
            .where(eq(member.userId, session.userId))
            .limit(1);

          return {
            data: {
              ...session,
              activeOrganizationId: membership?.organizationId ?? null,
              expiresAt: new Date(session.expiresAt),
              createdAt: new Date(session.createdAt),
              updatedAt: new Date(session.updatedAt),
            } as any,
          };
        },
      },
    },
  },
});
