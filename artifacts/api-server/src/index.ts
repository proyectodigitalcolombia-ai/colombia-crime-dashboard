import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { loadDemoIfEmpty } from "./routes/crimes";

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
    `);
    logger.info("Database schema ensured");
  } finally {
    client.release();
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
    .then(() => loadDemoIfEmpty())
    .catch((err) => {
      logger.error({ err }, "Failed to ensure database schema or load initial data");
    });
});
