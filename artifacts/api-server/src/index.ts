import app from "./app";
import { logger } from "./lib/logger";
import { pool, db, usersTable } from "@workspace/db";
import { loadDemoIfEmpty, startDailyAutoRefresh } from "./routes/crimes";
import { startBlockadeAutoExpiry } from "./routes/blockades";
import { startNewsMonitor } from "./routes/news-monitor";
import { startRestrictionsSyncMonitor } from "./routes/restrictions-sync";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS crime_stats (
        id SERIAL PRIMARY KEY,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        crime_type_id TEXT NOT NULL,
        crime_type_name TEXT NOT NULL,
        department TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS crime_stats_year_month_idx ON crime_stats (year, month);
      CREATE INDEX IF NOT EXISTS crime_stats_crime_type_idx ON crime_stats (crime_type_id);
      CREATE INDEX IF NOT EXISTS crime_stats_department_idx ON crime_stats (department);

      CREATE TABLE IF NOT EXISTS refresh_log (
        id SERIAL PRIMARY KEY,
        last_refreshed TIMESTAMP,
        next_refresh TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'idle',
        message TEXT,
        record_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS blockades (
        id SERIAL PRIMARY KEY,
        corridor_id TEXT NOT NULL,
        department TEXT NOT NULL,
        date TEXT NOT NULL,
        cause TEXT NOT NULL DEFAULT 'comunidad',
        location TEXT NOT NULL,
        duration_hours INTEGER,
        status TEXT NOT NULL DEFAULT 'activo',
        notes TEXT,
        reporter TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS blockades_corridor_idx ON blockades (corridor_id);
      CREATE INDEX IF NOT EXISTS blockades_status_idx ON blockades (status);

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        company_name TEXT NOT NULL DEFAULT 'SafeNode S.A.S.',
        company_subtitle TEXT NOT NULL DEFAULT 'Inteligencia en Seguridad Logística y Transporte',
        analyst_name TEXT NOT NULL DEFAULT 'Analista de Seguridad',
        analyst_email TEXT NOT NULL DEFAULT 'seguridad@safenode.com.co',
        analyst_phone TEXT NOT NULL DEFAULT '+57 300 000 0000',
        primary_color TEXT NOT NULL DEFAULT '#00bcd4',
        footer_disclaimer TEXT NOT NULL DEFAULT 'Documento confidencial — uso exclusivo interno.',
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

      CREATE TABLE IF NOT EXISTS road_conditions_cache (
        id SERIAL PRIMARY KEY,
        via TEXT NOT NULL,
        department TEXT NOT NULL,
        sector TEXT,
        km TEXT,
        condition TEXT,
        condition_code TEXT,
        reason TEXT,
        alternative_route TEXT,
        start_date TEXT,
        end_date TEXT,
        indefinite BOOLEAN NOT NULL DEFAULT FALSE,
        responsible_entity TEXT,
        fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    /* Incremental migrations — idempotent, safe to run on every startup */
    await client.query(`
      ALTER TABLE blockades ADD COLUMN IF NOT EXISTS lat REAL;
      ALTER TABLE blockades ADD COLUMN IF NOT EXISTS lng REAL;
      ALTER TABLE blockades ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
      ALTER TABLE blockades ADD COLUMN IF NOT EXISTS source_url TEXT;
      ALTER TABLE blockades ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
      CREATE INDEX IF NOT EXISTS blockades_expires_idx ON blockades (expires_at);

      ALTER TABLE users ADD COLUMN IF NOT EXISTS company_nit TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS company_address TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS company_city TEXT NOT NULL DEFAULT 'Bogotá D.C.';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS company_logo TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS analyst_cargo TEXT NOT NULL DEFAULT 'Analista de Seguridad';

      CREATE TABLE IF NOT EXISTS restrictions_sync (
        id SERIAL PRIMARY KEY,
        source_url TEXT NOT NULL,
        bulletin_title TEXT,
        bulletin_urls TEXT,
        data_hash TEXT,
        last_checked TIMESTAMP NOT NULL DEFAULT NOW(),
        last_changed TIMESTAMP,
        new_detected BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    logger.info("Database schema ensured (all tables)");
  } finally {
    client.release();
  }
}

async function seedDefaultUser() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@safenode.com.co";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "SafeNode2025!";
  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, adminEmail));
    if (existing.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await db.insert(usersTable).values({
        email: adminEmail,
        passwordHash: hash,
        companyName: "SafeNode S.A.S.",
        companySubtitle: "Inteligencia en Seguridad Logística y Transporte",
        analystName: "Administrador SafeNode",
        analystEmail: adminEmail,
        analystPhone: "+57 1 234 5678",
        primaryColor: "#00bcd4",
        footerDisclaimer: "Documento confidencial — uso exclusivo interno.",
        isAdmin: true,
      });
      logger.info({ email: adminEmail }, "Default admin user created");
    }
  } catch (err) {
    logger.warn({ err }, "Could not seed default user");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  ensureSchema()
    .then(() => seedDefaultUser())
    .then(() => loadDemoIfEmpty())
    .then(() => startDailyAutoRefresh())
    .then(() => startBlockadeAutoExpiry())
    .then(() => startNewsMonitor())
    .then(() => startRestrictionsSyncMonitor())
    .catch((err) => {
      logger.error({ err }, "Failed to ensure database schema or load initial data");
    });
});
