import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const dbUrl = process.env.DATABASE_URL;
const isInternalRender = dbUrl && !dbUrl.includes(".render.com") && dbUrl.includes("dpg-");

export const pool = new Pool({
  connectionString: dbUrl,
  ssl: isInternalRender ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
