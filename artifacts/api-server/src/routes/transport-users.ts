import { Router } from "express";
import type { Response } from "express";
import bcrypt from "bcryptjs";
import { db, transportUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireTransportAuth, requireSuperAdmin, requireAdminOrAbove } from "./transport-auth";
import "./transport-types";

const router = Router();

function safeUser(u: typeof transportUsersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  return {
    ...rest,
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
  };
}

/* GET /api/transport/users - admin and superadmin only */
router.get("/transport/users", requireAdminOrAbove, async (req, res: Response): Promise<void> => {
  let users;
  if (req.transportRole === "superadmin") {
    users = await db.select().from(transportUsersTable).orderBy(transportUsersTable.name);
  } else {
    const tenantId = req.transportTenantId;
    if (!tenantId) { res.status(403).json({ error: "Usuario sin empresa asignada" }); return; }
    users = await db.select().from(transportUsersTable)
      .where(eq(transportUsersTable.tenantId, tenantId))
      .orderBy(transportUsersTable.name);
  }
  res.json(users.map(safeUser));
});

/* POST /api/transport/users */
router.post("/transport/users", requireAdminOrAbove, async (req, res: Response): Promise<void> => {
  const { email, password, name, role, tenantId } = req.body ?? {};
  if (!email?.trim() || !password || !name?.trim() || !role) {
    res.status(400).json({ error: "Email, contraseña, nombre y rol son requeridos" });
    return;
  }
  const validRoles = ["admin", "controlador"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "Rol inválido" });
    return;
  }
  let assignedTenantId: number | null = null;
  if (req.transportRole === "superadmin") {
    if (!tenantId) {
      res.status(400).json({ error: "Debe asignar una empresa al crear usuarios admin/controlador" });
      return;
    }
    assignedTenantId = tenantId;
  } else {
    if (role === "admin") {
      res.status(403).json({ error: "Solo el superadmin puede crear administradores" });
      return;
    }
    if (!req.transportTenantId) {
      res.status(403).json({ error: "Usuario sin empresa asignada no puede crear usuarios" });
      return;
    }
    assignedTenantId = req.transportTenantId;
  }
  const hash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(transportUsersTable).values({
    email: email.toLowerCase().trim(),
    passwordHash: hash,
    name: name.trim(),
    role,
    tenantId: assignedTenantId,
    isActive: true,
  }).returning();
  res.status(201).json(safeUser(user));
});

/* PATCH /api/transport/users/:userId */
router.patch("/transport/users/:userId", requireAdminOrAbove, async (req, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [existing] = await db.select().from(transportUsersTable).where(eq(transportUsersTable.id, userId));
  if (!existing) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  if (req.transportRole !== "superadmin" && existing.tenantId !== req.transportTenantId) {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }

  const { name, email, password, role, isActive } = req.body ?? {};
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email.toLowerCase().trim();
  if (role !== undefined) {
    if (req.transportRole !== "superadmin" && (role === "superadmin" || role === "admin")) {
      res.status(403).json({ error: "Solo el superadmin puede asignar roles de administrador" });
      return;
    }
    const validRoles = ["admin", "controlador", "superadmin"];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: "Rol inválido" });
      return;
    }
    updates.role = role;
  }
  if (isActive !== undefined) updates.isActive = isActive;
  if (password) updates.passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db.update(transportUsersTable)
    .set(updates)
    .where(eq(transportUsersTable.id, userId))
    .returning();
  res.json(safeUser(user));
});

export default router;
