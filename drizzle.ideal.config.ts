import "dotenv/config";
import type { Config } from "drizzle-kit";

/**
 * Config para inspeccionar BD_IDEAL (docker-compose.ideal.yml).
 * Sin `schema`: Studio introspecta la BD directo (el schema ideal es SQL, no Drizzle todavía).
 * Uso: bun run db:studio:ideal
 */
export default {
  out: "./drizzle-ideal",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.IDEAL_DATABASE_URL ??
      "postgres://arca:arca@localhost:5460/arca_ideal",
  },
} satisfies Config;
