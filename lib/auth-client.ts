import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";
import { magicLinkClient, jwtClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BETTER_AUTH_URL || "http://localhost:3000/api/auth",
  plugins: [adminClient(), jwtClient()],
});
