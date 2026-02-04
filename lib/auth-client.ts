import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";
import { magicLinkClient, jwtClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
 baseURL:
  (typeof process !== "undefined"
    ? process.env.BETTER_AUTH_URL
    : import.meta.env.VITE_BETTER_AUTH_URL) ||
  "https://blakg.tinnto.co/api/auth", // the base url of your auth server
  plugins: [adminClient(), jwtClient()],
});
