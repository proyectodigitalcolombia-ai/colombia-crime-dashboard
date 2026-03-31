import app from "./app";
import { logger } from "./lib/logger";
import { pool, db, usersTable, transportTenantsTable, transportUsersTable, transportDispatchesTable, transportCheckpointsTable, transportObservationsTable } from "@workspace/db";
import { loadDemoIfEmpty, startDailyAutoRefresh } from "./routes/crimes";
import { startBlockadeAutoExpiry } from "./routes/blockades";
import { startNewsMonitor } from "./routes/news-monitor";
import { startRestrictionsSyncMonitor } from "./routes/restrictions-sync";
import { startEmailAlertScheduler } from "./routes/email-alerts";
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

      CREATE TABLE IF NOT EXISTS client_companies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        nit TEXT NOT NULL DEFAULT '',
        contact_name TEXT NOT NULL DEFAULT '',
        contact_email TEXT NOT NULL DEFAULT '',
        contact_phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        logo TEXT,
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS email_alert_configs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        recipients TEXT[] NOT NULL DEFAULT '{}',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        days_before INTEGER NOT NULL DEFAULT 1,
        send_hour INTEGER NOT NULL DEFAULT 18,
        include_companies BOOLEAN NOT NULL DEFAULT FALSE,
        last_sent_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      ALTER TABLE email_alert_configs ADD COLUMN IF NOT EXISTS include_companies BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS safenode_routes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        ruta_code TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        total_points INTEGER NOT NULL DEFAULT 0,
        sheet_name TEXT NOT NULL DEFAULT '',
        uploaded_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS safenode_routes_name_idx ON safenode_routes (name);

      CREATE TABLE IF NOT EXISTS safenode_route_points (
        id SERIAL PRIMARY KEY,
        route_id INTEGER NOT NULL REFERENCES safenode_routes(id) ON DELETE CASCADE,
        n INTEGER NOT NULL,
        dept TEXT NOT NULL DEFAULT '',
        mun TEXT NOT NULL DEFAULT '',
        nombre TEXT NOT NULL DEFAULT '',
        tipo TEXT NOT NULL DEFAULT '',
        descripcion TEXT NOT NULL DEFAULT '',
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        alt REAL NOT NULL DEFAULT 0,
        vel REAL NOT NULL DEFAULT 0,
        controles TEXT NOT NULL DEFAULT '',
        riesgo REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS safenode_route_points_route_idx ON safenode_route_points (route_id);

      -- Transport SaaS tables
      CREATE TABLE IF NOT EXISTS transport_tenants (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        nit TEXT NOT NULL DEFAULT '',
        contact_name TEXT NOT NULL DEFAULT '',
        contact_email TEXT NOT NULL DEFAULT '',
        contact_phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS transport_tenants_name_idx ON transport_tenants (name);

      CREATE TABLE IF NOT EXISTS transport_users (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'controlador',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS transport_users_email_idx ON transport_users (email);
      CREATE INDEX IF NOT EXISTS transport_users_tenant_idx ON transport_users (tenant_id);

      CREATE TABLE IF NOT EXISTS transport_dispatches (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        consecutive TEXT NOT NULL,
        manifest TEXT,
        plate TEXT NOT NULL,
        trailer TEXT,
        brand TEXT,
        vehicle_class TEXT,
        model TEXT,
        color TEXT,
        transport_company TEXT,
        driver TEXT,
        driver_cc TEXT,
        driver_phone TEXT,
        generator TEXT,
        insurer TEXT,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        via TEXT,
        departure_date TEXT,
        departure_time TEXT,
        restriction_start TEXT,
        restriction_end TEXT,
        status TEXT NOT NULL DEFAULT 'a_tiempo',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS transport_dispatches_tenant_idx ON transport_dispatches (tenant_id);
      CREATE INDEX IF NOT EXISTS transport_dispatches_plate_idx ON transport_dispatches (plate);
      CREATE INDEX IF NOT EXISTS transport_dispatches_status_idx ON transport_dispatches (status);

      CREATE TABLE IF NOT EXISTS transport_checkpoints (
        id SERIAL PRIMARY KEY,
        dispatch_id INTEGER NOT NULL REFERENCES transport_dispatches(id) ON DELETE CASCADE,
        "order" INTEGER NOT NULL DEFAULT 0,
        location TEXT NOT NULL,
        planned_date TEXT,
        planned_time TEXT,
        adjusted_date TEXT,
        adjusted_time TEXT,
        real_date TEXT,
        real_time TEXT,
        novelty TEXT,
        checkpoint_notes TEXT,
        distance_km REAL,
        time_hours REAL,
        speed_kmh REAL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS transport_checkpoints_dispatch_idx ON transport_checkpoints (dispatch_id);

      CREATE TABLE IF NOT EXISTS transport_observations (
        id SERIAL PRIMARY KEY,
        dispatch_id INTEGER NOT NULL REFERENCES transport_dispatches(id) ON DELETE CASCADE,
        observation_type TEXT NOT NULL DEFAULT 'otro',
        detail TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS transport_observations_dispatch_idx ON transport_observations (dispatch_id);
    `);

    logger.info("Database schema ensured (all tables)");
  } finally {
    client.release();
  }
}

async function seedTransportData() {
  if (process.env.NODE_ENV === "production") {
    console.log("[transport] Seed desactivado en producción. Configure usuarios manualmente.");
    return;
  }
  try {
    const superadminEmail = process.env.TRANSPORT_SUPERADMIN_EMAIL ?? "superadmin@transporte.co";
    const superadminPassword = process.env.TRANSPORT_SUPERADMIN_PASSWORD ?? "Admin2025!";
    const existing = await db.select({ id: transportUsersTable.id }).from(transportUsersTable).where(eq(transportUsersTable.email, superadminEmail));
    if (existing.length > 0) return;

    const hash = await bcrypt.hash(superadminPassword, 12);
    await db.insert(transportUsersTable).values({
      email: superadminEmail,
      passwordHash: hash,
      name: "Superadministrador",
      role: "superadmin",
      tenantId: null,
      isActive: true,
    });

    const [tenant1] = await db.insert(transportTenantsTable).values({
      name: "Transportes SARVI LTDA",
      nit: "900.123.456-7",
      contactName: "Wilson Muñoz",
      contactEmail: "wmunoz@sarvi.com.co",
      contactPhone: "+57 314 567 8901",
      address: "Cra 15 # 93-47",
      city: "Bogotá D.C.",
      isActive: true,
    }).returning();

    const [tenant2] = await db.insert(transportTenantsTable).values({
      name: "El Dorado Air Cargo LTDA",
      nit: "800.654.321-0",
      contactName: "Jorge Madero",
      contactEmail: "jmadero@eldoradocargo.co",
      contactPhone: "+57 321 987 6543",
      address: "Av. El Dorado # 103-08",
      city: "Bogotá D.C.",
      isActive: true,
    }).returning();

    const adminHash = await bcrypt.hash(process.env.TRANSPORT_DEMO_PASSWORD ?? "Admin2025!", 12);
    const [adminUser] = await db.insert(transportUsersTable).values({
      email: "admin@sarvi.com.co",
      passwordHash: adminHash,
      name: "María Victoria López",
      role: "admin",
      tenantId: tenant1.id,
      isActive: true,
    }).returning();

    const [controlUser] = await db.insert(transportUsersTable).values({
      email: "controlador@sarvi.com.co",
      passwordHash: adminHash,
      name: "Jhonny Rueda",
      role: "controlador",
      tenantId: tenant1.id,
      isActive: true,
    }).returning();

    const dispatches = [
      { consecutive: "34507973", manifest: "72167", plate: "WFL190", trailer: "R47534", brand: "FREIGHT LINER", vehicleClass: "No Registrada", model: "2013", color: "BLANCO", transportCompany: "TRANSPORTES SARVI LTDA", driver: "JHON ANDERSON GARCIA RODRIGUEZ", driverCc: "1024523284", driverPhone: "3188886445", generator: "KN", insurer: "No Registrada", origin: "BUENAVENTURA (VAC)", destination: "FUNZA (CUN)", via: "LINEA", departureDate: "13-Mar-26", departureTime: "09:37", restrictionStart: "18:00:00", restrictionEnd: "05:00:00", status: "a_tiempo" as const },
      { consecutive: "34529423", manifest: "13128", plate: "SKF607", trailer: "T12345", brand: "KENWORTH", vehicleClass: "Tractocamion", model: "2020", color: "ROJO", transportCompany: "TRANSPORTES SARVI LTDA", driver: "CARLOS MENDOZA RIOS", driverCc: "79456123", driverPhone: "3001234567", generator: "CERAMICA SAN LORENZO INDUSTRIAL DE COLOM", insurer: "Bolivar", origin: "SOPO (CUN)", destination: "ACACIAS (MET)", via: "NORMAL", departureDate: "21-Mar-26", departureTime: "09:25", restrictionStart: "18:00:00", restrictionEnd: "05:00:00", status: "demorado" as const },
      { consecutive: "34537256", manifest: "40511", plate: "SWL459", trailer: "T98765", brand: "INTERNACIONAL", vehicleClass: "Tractocamion", model: "2019", color: "BLANCO", transportCompany: "EL DORADO AIR CARGO", driver: "PEDRO GARCIA SUAREZ", driverCc: "80789456", driverPhone: "3209876543", generator: "EL DORADO AIR CARGO LTDA", insurer: "Sura", origin: "GUARNE (ANT)", destination: "CARTAGENA DE INDIAS (BOL)", via: "MEDELLIN", departureDate: "25-Mar-26", departureTime: "10:09", restrictionStart: "18:00:00", restrictionEnd: "05:00:00", status: "llegado" as const },
    ];

    for (const d of dispatches) {
      const [dispatch] = await db.insert(transportDispatchesTable).values({
        tenantId: tenant1.id,
        ...d,
        notes: null,
      }).returning();

      await db.insert(transportCheckpointsTable).values([
        { dispatchId: dispatch.id, order: 1, location: `${d.origin}`, plannedDate: d.departureDate, plannedTime: d.departureTime, realDate: d.departureTime ? d.departureDate : null, realTime: d.departureTime ?? null, novelty: "SALIDA", distanceKm: null, timeHours: null, speedKmh: null },
        { dispatchId: dispatch.id, order: 2, location: "LA URIBE 1", plannedDate: d.departureDate, plannedTime: "15:22", adjustedDate: d.departureDate, adjustedTime: "15:22", distanceKm: 185, timeHours: 5.75, speedKmh: 32 },
        { dispatchId: dispatch.id, order: 3, location: "CALARCA (Quindio)", plannedDate: d.departureDate, plannedTime: "17:37", distanceKm: 277, timeHours: 8.2, speedKmh: 34 },
        { dispatchId: dispatch.id, order: 4, location: `${d.destination}`, plannedDate: d.departureDate, plannedTime: "03:37", distanceKm: 560, timeHours: 18.0, speedKmh: 31 },
      ]);

      await db.insert(transportObservationsTable).values([
        { dispatchId: dispatch.id, observationType: "gestion_interna", detail: "TRANSITO DE 6 A 18 SYS VERDE////INSPECCION EN LA URIBE//SELLO//INFORMADO", createdBy: adminUser.id },
        { dispatchId: dispatch.id, observationType: "informacion_cliente", detail: "PENDIENTE CITA DE CARGUE", createdBy: adminUser.id },
        { dispatchId: dispatch.id, observationType: "informacion_cliente", detail: "INFORMA OFICINA DE BUENAVENTURA VEHICULO PENDIENTE CITA DE CARGUE", createdBy: controlUser.id },
      ]);
    }

    logger.info("Transport demo data seeded successfully");
  } catch (err) {
    logger.warn({ err }, "Could not seed transport demo data");
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
    .then(() => seedTransportData())
    .then(() => loadDemoIfEmpty())
    .then(() => startDailyAutoRefresh())
    .then(() => startBlockadeAutoExpiry())
    .then(() => startNewsMonitor())
    .then(() => startRestrictionsSyncMonitor())
    .then(() => startEmailAlertScheduler())
    .catch((err) => {
      logger.error({ err }, "Failed to ensure database schema or load initial data");
    });
});
