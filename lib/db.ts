import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/drizzle/schema";
import * as authSchema from "@/drizzle/auth";
// import * as relations from '@/drizzle/relations'
console.log(process.env.DATABASE_URL);
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, {
  schema: { ...schema, ...authSchema },
});
