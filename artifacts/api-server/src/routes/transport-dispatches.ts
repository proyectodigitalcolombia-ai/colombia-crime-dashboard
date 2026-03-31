import { Router } from "express";
import type { Request, Response } from "express";
import { db, transportDispatchesTable, transportCheckpointsTable, transportObservationsTable, transportUsersTable } from "@workspace/db";
import { eq, and, ilike, count, sql, SQL } from "drizzle-orm";
import { requireTransportAuth } from "./transport-auth";
import "./transport-types";

const router = Router();

function assertNonSuperadminHasTenant(req: Request): { error: string; status: number } | null {
  if (req.transportRole !== "superadmin" && !req.transportTenantId) {
    return { error: "Usuario sin empresa asignada no puede acceder a despachos", status: 403 };
  }
  return null;
}

async function assertDispatchTenantAccess(dispatchId: number, req: Request): Promise<{ error: string; status: number } | null> {
  const tenantErr = assertNonSuperadminHasTenant(req);
  if (tenantErr) return tenantErr;

  const [dispatch] = await db
    .select({ tenantId: transportDispatchesTable.tenantId })
    .from(transportDispatchesTable)
    .where(eq(transportDispatchesTable.id, dispatchId));
  if (!dispatch) return { error: "Despacho no encontrado", status: 404 };

  if (req.transportRole !== "superadmin") {
    if (dispatch.tenantId === null || dispatch.tenantId !== req.transportTenantId) {
      return { error: "Acceso denegado", status: 403 };
    }
  }
  return null;
}

function formatDispatch(d: typeof transportDispatchesTable.$inferSelect) {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function formatCheckpoint(c: typeof transportCheckpointsTable.$inferSelect) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function formatObservation(o: typeof transportObservationsTable.$inferSelect & { createdByName?: string }) {
  return {
    ...o,
    createdByName: o.createdByName ?? "Desconocido",
    createdAt: o.createdAt.toISOString(),
  };
}

/* GET /api/transport/dispatches/summary */
router.get("/transport/dispatches/summary", requireTransportAuth, async (req, res: Response): Promise<void> => {
  const tenantId = req.transportTenantId;
  if (!tenantId && req.transportRole !== "superadmin") {
    res.json({ total: 0, aTime: 0, demorado: 0, llegado: 0, salida: 0 });
    return;
  }

  const whereClause = tenantId ? eq(transportDispatchesTable.tenantId, tenantId) : undefined;

  const all = await db.select({ status: transportDispatchesTable.status, cnt: count() })
    .from(transportDispatchesTable)
    .where(whereClause)
    .groupBy(transportDispatchesTable.status);

  const summary = { total: 0, aTime: 0, demorado: 0, llegado: 0, salida: 0 };
  for (const row of all) {
    const n = Number(row.cnt);
    summary.total += n;
    if (row.status === "a_tiempo") summary.aTime += n;
    else if (row.status === "demorado") summary.demorado += n;
    else if (row.status === "llegado") summary.llegado += n;
    else if (row.status === "salida") summary.salida += n;
  }
  res.json(summary);
});

/* GET /api/transport/dispatches */
router.get("/transport/dispatches", requireTransportAuth, async (req, res: Response): Promise<void> => {
  const tenantId = req.transportTenantId;
  const tenantErr = assertNonSuperadminHasTenant(req);
  if (tenantErr) { res.status(tenantErr.status).json({ error: tenantErr.error }); return; }

  const { plate, origin, destination, generator, status, page = "1", pageSize = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
  const offset = (pageNum - 1) * size;

  const conditions: SQL[] = [];
  if (tenantId) conditions.push(eq(transportDispatchesTable.tenantId, tenantId));
  if (plate) conditions.push(ilike(transportDispatchesTable.plate, `%${plate}%`));
  if (origin) conditions.push(ilike(transportDispatchesTable.origin, `%${origin}%`));
  if (destination) conditions.push(ilike(transportDispatchesTable.destination, `%${destination}%`));
  if (status) conditions.push(eq(transportDispatchesTable.status, status));
  if (generator) conditions.push(sql`${transportDispatchesTable.generator} ILIKE ${'%' + generator + '%'}`);

  const whereClause = conditions.length > 0 ? and(...(conditions as [SQL, ...SQL[]])) : undefined;

  const [totalResult] = await db.select({ cnt: count() }).from(transportDispatchesTable).where(whereClause);
  const total = Number(totalResult.cnt);

  const data = await db.select().from(transportDispatchesTable)
    .where(whereClause)
    .orderBy(sql`${transportDispatchesTable.createdAt} DESC`)
    .limit(size)
    .offset(offset);

  res.json({
    data: data.map(formatDispatch),
    total,
    page: pageNum,
    pageSize: size,
  });
});

/* POST /api/transport/dispatches */
router.post("/transport/dispatches", requireTransportAuth, async (req, res: Response): Promise<void> => {
  const tenantId = req.transportTenantId;
  if (!tenantId) { res.status(400).json({ error: "Empresa no asignada al usuario" }); return; }
  const { plate, origin, destination, consecutive, ...rest } = req.body ?? {};
  if (!plate?.trim() || !origin?.trim() || !destination?.trim()) {
    res.status(400).json({ error: "Placa, origen y destino son requeridos" });
    return;
  }
  const autoConsecutive = consecutive?.trim() || `D-${Date.now()}`;
  const [dispatch] = await db.insert(transportDispatchesTable).values({
    tenantId,
    consecutive: autoConsecutive,
    plate: plate.trim().toUpperCase(),
    origin: origin.trim(),
    destination: destination.trim(),
    status: rest.status ?? "a_tiempo",
    manifest: rest.manifest ?? null,
    trailer: rest.trailer ?? null,
    brand: rest.brand ?? null,
    vehicleClass: rest.vehicleClass ?? null,
    model: rest.model ?? null,
    color: rest.color ?? null,
    transportCompany: rest.transportCompany ?? null,
    driver: rest.driver ?? null,
    driverCc: rest.driverCc ?? null,
    driverPhone: rest.driverPhone ?? null,
    generator: rest.generator ?? null,
    insurer: rest.insurer ?? null,
    via: rest.via ?? null,
    departureDate: rest.departureDate ?? null,
    departureTime: rest.departureTime ?? null,
    restrictionStart: rest.restrictionStart ?? null,
    restrictionEnd: rest.restrictionEnd ?? null,
    notes: rest.notes ?? null,
  }).returning();
  res.status(201).json(formatDispatch(dispatch));
});

/* GET /api/transport/dispatches/:dispatchId */
router.get("/transport/dispatches/:dispatchId", requireTransportAuth, async (req, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.dispatchId) ? req.params.dispatchId[0] : req.params.dispatchId;
  const dispatchId = parseInt(raw, 10);
  if (isNaN(dispatchId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const nullTenantErr = assertNonSuperadminHasTenant(req);
  if (nullTenantErr) { res.status(nullTenantErr.status).json({ error: nullTenantErr.error }); return; }

  const [dispatch] = await db.select().from(transportDispatchesTable).where(eq(transportDispatchesTable.id, dispatchId));
  if (!dispatch) { res.status(404).json({ error: "Despacho no encontrado" }); return; }

  if (req.transportRole !== "superadmin") {
    if (dispatch.tenantId === null || dispatch.tenantId !== req.transportTenantId) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
  }

  const checkpoints = await db.select().from(transportCheckpointsTable)
    .where(eq(transportCheckpointsTable.dispatchId, dispatchId))
    .orderBy(transportCheckpointsTable.order);

  const obsRaw = await db
    .select({
      id: transportObservationsTable.id,
      dispatchId: transportObservationsTable.dispatchId,
      observationType: transportObservationsTable.observationType,
      detail: transportObservationsTable.detail,
      createdBy: transportObservationsTable.createdBy,
      createdAt: transportObservationsTable.createdAt,
      createdByName: transportUsersTable.name,
    })
    .from(transportObservationsTable)
    .leftJoin(transportUsersTable, eq(transportObservationsTable.createdBy, transportUsersTable.id))
    .where(eq(transportObservationsTable.dispatchId, dispatchId))
    .orderBy(transportObservationsTable.createdAt);

  res.json({
    ...formatDispatch(dispatch),
    checkpoints: checkpoints.map(formatCheckpoint),
    observations: obsRaw.map(o => ({
      ...o,
      createdByName: o.createdByName ?? "Desconocido",
      createdAt: o.createdAt.toISOString(),
    })),
  });
});

/* PATCH /api/transport/dispatches/:dispatchId */
router.patch("/transport/dispatches/:dispatchId", requireTransportAuth, async (req, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.dispatchId) ? req.params.dispatchId[0] : req.params.dispatchId;
  const dispatchId = parseInt(raw, 10);
  if (isNaN(dispatchId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const accessErr = await assertDispatchTenantAccess(dispatchId, req);
  if (accessErr) { res.status(accessErr.status).json({ error: accessErr.error }); return; }

  const { status, notes, departureDate, departureTime, driver, driverPhone } = req.body ?? {};
  const [dispatch] = await db.update(transportDispatchesTable)
    .set({
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
      ...(departureDate !== undefined && { departureDate }),
      ...(departureTime !== undefined && { departureTime }),
      ...(driver !== undefined && { driver }),
      ...(driverPhone !== undefined && { driverPhone }),
      updatedAt: new Date(),
    })
    .where(eq(transportDispatchesTable.id, dispatchId))
    .returning();
  res.json(formatDispatch(dispatch));
});

/* GET /api/transport/dispatches/:dispatchId/checkpoints */
router.get("/transport/dispatches/:dispatchId/checkpoints", requireTransportAuth, async (req, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.dispatchId) ? req.params.dispatchId[0] : req.params.dispatchId;
  const dispatchId = parseInt(raw, 10);
  if (isNaN(dispatchId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const accessErr = await assertDispatchTenantAccess(dispatchId, req);
  if (accessErr) { res.status(accessErr.status).json({ error: accessErr.error }); return; }
  const checkpoints = await db.select().from(transportCheckpointsTable)
    .where(eq(transportCheckpointsTable.dispatchId, dispatchId))
    .orderBy(transportCheckpointsTable.order);
  res.json(checkpoints.map(formatCheckpoint));
});

/* POST /api/transport/dispatches/:dispatchId/checkpoints */
router.post("/transport/dispatches/:dispatchId/checkpoints", requireTransportAuth, async (req, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.dispatchId) ? req.params.dispatchId[0] : req.params.dispatchId;
  const dispatchId = parseInt(raw, 10);
  if (isNaN(dispatchId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const accessErr = await assertDispatchTenantAccess(dispatchId, req);
  if (accessErr) { res.status(accessErr.status).json({ error: accessErr.error }); return; }
  const { location, order, plannedDate, plannedTime, adjustedDate, adjustedTime, novelty, checkpointNotes, distanceKm, timeHours, speedKmh } = req.body ?? {};
  if (!location?.trim()) { res.status(400).json({ error: "La ubicación es requerida" }); return; }
  const [checkpoint] = await db.insert(transportCheckpointsTable).values({
    dispatchId,
    location: location.trim(),
    order: order ?? 0,
    plannedDate: plannedDate ?? null,
    plannedTime: plannedTime ?? null,
    adjustedDate: adjustedDate ?? null,
    adjustedTime: adjustedTime ?? null,
    novelty: novelty ?? null,
    checkpointNotes: checkpointNotes ?? null,
    distanceKm: distanceKm ?? null,
    timeHours: timeHours ?? null,
    speedKmh: speedKmh ?? null,
  }).returning();
  res.status(201).json(formatCheckpoint(checkpoint));
});

/* PATCH /api/transport/dispatches/:dispatchId/checkpoints/:checkpointId */
router.patch("/transport/dispatches/:dispatchId/checkpoints/:checkpointId", requireTransportAuth, async (req, res: Response): Promise<void> => {
  const rawD = Array.isArray(req.params.dispatchId) ? req.params.dispatchId[0] : req.params.dispatchId;
  const rawC = Array.isArray(req.params.checkpointId) ? req.params.checkpointId[0] : req.params.checkpointId;
  const dispatchId = parseInt(rawD, 10);
  const checkpointId = parseInt(rawC, 10);
  if (isNaN(dispatchId) || isNaN(checkpointId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const accessErr = await assertDispatchTenantAccess(dispatchId, req);
  if (accessErr) { res.status(accessErr.status).json({ error: accessErr.error }); return; }
  const { realDate, realTime, adjustedDate, adjustedTime, novelty, checkpointNotes, distanceKm, timeHours, speedKmh } = req.body ?? {};
  const [checkpoint] = await db.update(transportCheckpointsTable)
    .set({
      ...(realDate !== undefined && { realDate }),
      ...(realTime !== undefined && { realTime }),
      ...(adjustedDate !== undefined && { adjustedDate }),
      ...(adjustedTime !== undefined && { adjustedTime }),
      ...(novelty !== undefined && { novelty }),
      ...(checkpointNotes !== undefined && { checkpointNotes }),
      ...(distanceKm !== undefined && { distanceKm }),
      ...(timeHours !== undefined && { timeHours }),
      ...(speedKmh !== undefined && { speedKmh }),
      updatedAt: new Date(),
    })
    .where(and(eq(transportCheckpointsTable.id, checkpointId), eq(transportCheckpointsTable.dispatchId, dispatchId)))
    .returning();
  if (!checkpoint) { res.status(404).json({ error: "Punto de control no encontrado" }); return; }
  res.json(formatCheckpoint(checkpoint));
});

/* GET /api/transport/dispatches/:dispatchId/observations */
router.get("/transport/dispatches/:dispatchId/observations", requireTransportAuth, async (req, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.dispatchId) ? req.params.dispatchId[0] : req.params.dispatchId;
  const dispatchId = parseInt(raw, 10);
  if (isNaN(dispatchId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const accessErr = await assertDispatchTenantAccess(dispatchId, req);
  if (accessErr) { res.status(accessErr.status).json({ error: accessErr.error }); return; }
  const obs = await db
    .select({
      id: transportObservationsTable.id,
      dispatchId: transportObservationsTable.dispatchId,
      observationType: transportObservationsTable.observationType,
      detail: transportObservationsTable.detail,
      createdBy: transportObservationsTable.createdBy,
      createdAt: transportObservationsTable.createdAt,
      createdByName: transportUsersTable.name,
    })
    .from(transportObservationsTable)
    .leftJoin(transportUsersTable, eq(transportObservationsTable.createdBy, transportUsersTable.id))
    .where(eq(transportObservationsTable.dispatchId, dispatchId))
    .orderBy(transportObservationsTable.createdAt);
  res.json(obs.map(o => ({
    ...o,
    createdByName: o.createdByName ?? "Desconocido",
    createdAt: o.createdAt.toISOString(),
  })));
});

/* POST /api/transport/dispatches/:dispatchId/observations */
router.post("/transport/dispatches/:dispatchId/observations", requireTransportAuth, async (req, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.dispatchId) ? req.params.dispatchId[0] : req.params.dispatchId;
  const dispatchId = parseInt(raw, 10);
  if (isNaN(dispatchId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const accessErr = await assertDispatchTenantAccess(dispatchId, req);
  if (accessErr) { res.status(accessErr.status).json({ error: accessErr.error }); return; }
  const { observationType, detail } = req.body ?? {};
  if (!observationType || !detail?.trim()) { res.status(400).json({ error: "Tipo de observación y detalle requeridos" }); return; }
  const validTypes = ["gestion_interna", "informacion_cliente", "recomendado_en", "otro"];
  if (!validTypes.includes(observationType)) { res.status(400).json({ error: "Tipo de observación inválido" }); return; }
  const [obs] = await db.insert(transportObservationsTable).values({
    dispatchId,
    observationType,
    detail: detail.trim(),
    createdBy: req.transportUserId!,
  }).returning();

  const [user] = await db.select({ name: transportUsersTable.name }).from(transportUsersTable).where(eq(transportUsersTable.id, req.transportUserId!));
  res.status(201).json({
    ...obs,
    createdByName: user?.name ?? "Desconocido",
    createdAt: obs.createdAt.toISOString(),
  });
});

export default router;
