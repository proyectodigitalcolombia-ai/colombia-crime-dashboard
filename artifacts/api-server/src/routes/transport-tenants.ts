import { Router } from "express";
import type { Response } from "express";
import { db, transportTenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSuperAdmin, requireAdminOrAbove } from "./transport-auth";
import "./transport-types";

const router = Router();

function formatTenant(t: typeof transportTenantsTable.$inferSelect) {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/* GET /api/transport/tenants */
router.get("/transport/tenants", requireSuperAdmin, async (_req, res): Promise<void> => {
  const tenants = await db.select().from(transportTenantsTable).orderBy(transportTenantsTable.name);
  res.json(tenants.map(formatTenant));
});

/* POST /api/transport/tenants */
router.post("/transport/tenants", requireSuperAdmin, async (req, res): Promise<void> => {
  const { name, nit, contactName, contactEmail, contactPhone, address, city } = req.body ?? {};
  if (!name?.trim()) {
    res.status(400).json({ error: "El nombre de la empresa es requerido" });
    return;
  }
  const [tenant] = await db.insert(transportTenantsTable).values({
    name: name.trim(),
    nit: nit?.trim() ?? "",
    contactName: contactName?.trim() ?? "",
    contactEmail: contactEmail?.trim() ?? "",
    contactPhone: contactPhone?.trim() ?? "",
    address: address?.trim() ?? "",
    city: city?.trim() ?? "",
    isActive: true,
  }).returning();
  res.status(201).json(formatTenant(tenant));
});

/* GET /api/transport/tenants/:tenantId */
router.get("/transport/tenants/:tenantId", requireAdminOrAbove, async (req, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.tenantId) ? req.params.tenantId[0] : req.params.tenantId;
  const tenantId = parseInt(raw, 10);
  if (isNaN(tenantId)) { res.status(400).json({ error: "ID inválido" }); return; }
  if (req.transportRole !== "superadmin" && req.transportTenantId !== tenantId) {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }
  const [tenant] = await db.select().from(transportTenantsTable).where(eq(transportTenantsTable.id, tenantId));
  if (!tenant) { res.status(404).json({ error: "Empresa no encontrada" }); return; }
  res.json(formatTenant(tenant));
});

/* PATCH /api/transport/tenants/:tenantId */
router.patch("/transport/tenants/:tenantId", requireSuperAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tenantId) ? req.params.tenantId[0] : req.params.tenantId;
  const tenantId = parseInt(raw, 10);
  if (isNaN(tenantId)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { name, nit, contactName, contactEmail, contactPhone, address, city, isActive } = req.body ?? {};
  const [tenant] = await db.update(transportTenantsTable)
    .set({
      ...(name !== undefined && { name }),
      ...(nit !== undefined && { nit }),
      ...(contactName !== undefined && { contactName }),
      ...(contactEmail !== undefined && { contactEmail }),
      ...(contactPhone !== undefined && { contactPhone }),
      ...(address !== undefined && { address }),
      ...(city !== undefined && { city }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    })
    .where(eq(transportTenantsTable.id, tenantId))
    .returning();
  if (!tenant) { res.status(404).json({ error: "Empresa no encontrada" }); return; }
  res.json(formatTenant(tenant));
});

export default router;
