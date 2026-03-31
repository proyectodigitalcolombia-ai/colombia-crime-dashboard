import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, transportUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import "./transport-types";

const router = Router();

const TRANSPORT_JWT_SECRET = (() => {
  const secret = process.env.TRANSPORT_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TRANSPORT_SESSION_SECRET must be set in production");
    }
    logger.warn("TRANSPORT_SESSION_SECRET not set — using insecure development fallback");
    return (process.env.SESSION_SECRET ?? "safenode-dev-secret") + "_transport";
  }
  return secret;
})();

function signToken(userId: number, email: string, role: string, tenantId: number | null) {
  return jwt.sign({ userId, email, role, tenantId }, TRANSPORT_JWT_SECRET, { expiresIn: "30d" });
}

function safeUser(u: typeof transportUsersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  return {
    ...rest,
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
  };
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers?.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

export function requireTransportAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: "No autenticado" }); return; }
  let payload: { userId: number; role: string; tenantId: number | null };
  try {
    payload = jwt.verify(token, TRANSPORT_JWT_SECRET) as { userId: number; role: string; tenantId: number | null };
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }
  db.select({
      id: transportUsersTable.id,
      role: transportUsersTable.role,
      tenantId: transportUsersTable.tenantId,
      isActive: transportUsersTable.isActive,
    })
    .from(transportUsersTable)
    .where(eq(transportUsersTable.id, payload.userId))
    .then(([user]) => {
      if (!user || !user.isActive) {
        res.status(401).json({ error: "Sesión inválida. Usuario inactivo o eliminado." });
        return;
      }
      req.transportUserId = user.id;
      req.transportRole = user.role;
      req.transportTenantId = user.tenantId;
      next();
    })
    .catch(() => {
      res.status(500).json({ error: "Error de autenticación" });
    });
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  requireTransportAuth(req, res, () => {
    if (req.transportRole !== "superadmin") {
      res.status(403).json({ error: "Acceso denegado — solo superadministrador" });
      return;
    }
    next();
  });
}

export function requireAdminOrAbove(req: Request, res: Response, next: NextFunction): void {
  requireTransportAuth(req, res, () => {
    if (!["superadmin", "admin"].includes(req.transportRole ?? "")) {
      res.status(403).json({ error: "Acceso denegado — se requiere perfil de administrador" });
      return;
    }
    next();
  });
}

/* POST /api/transport/auth/login */
router.post("/transport/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (!email?.trim() || !password) {
    res.status(400).json({ error: "Email y contraseña requeridos" });
    return;
  }
  try {
    const [user] = await db.select().from(transportUsersTable).where(eq(transportUsersTable.email, email.toLowerCase().trim()));
    if (!user) {
      res.status(401).json({ error: "Credenciales incorrectas" });
      return;
    }
    if (!user.isActive) {
      res.status(401).json({ error: "Usuario inactivo. Contacte al administrador." });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Credenciales incorrectas" });
      return;
    }
    const token = signToken(user.id, user.email, user.role, user.tenantId);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    logger.error({ err }, "Transport login error");
    res.status(500).json({ error: "Error del servidor" });
  }
});

/* GET /api/transport/auth/me */
router.get("/transport/auth/me", requireTransportAuth, async (req, res): Promise<void> => {
  try {
    const [user] = await db.select().from(transportUsersTable).where(eq(transportUsersTable.id, req.transportUserId!));
    if (!user) {
      res.status(401).json({ error: "Usuario no encontrado" });
      return;
    }
    res.json(safeUser(user));
  } catch (err) {
    logger.error({ err }, "Transport me error");
    res.status(500).json({ error: "Error del servidor" });
  }
});

export default router;
