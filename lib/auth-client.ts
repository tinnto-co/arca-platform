import { createAuthClient } from "better-auth/react";
import { adminClient, organizationClient, jwtClient } from "better-auth/client/plugins";
import { ac, owner, member, viewer } from "@/lib/permissions";

export const authClient = createAuthClient({
  baseURL:
    import.meta.env.VITE_BETTER_AUTH_URL ||
    "https://contable.tinnto.co/api/auth",
  plugins: [
    adminClient(),
    jwtClient(),
    organizationClient({
      ac,
      roles: {
        owner,
        member,
        viewer,
      },
    }),
  ],
});
