import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  out: "./drizzle",
  schema: ["./drizzle/schema.ts", "./drizzle/auth.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.MIGRATION_URL!,
  },
} satisfies Config;
