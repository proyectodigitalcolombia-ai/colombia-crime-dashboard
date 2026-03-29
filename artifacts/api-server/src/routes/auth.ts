import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const JWT_SECRET = process.env.SESSION_SECRET ?? "safenode-dev-secret-change-in-production";

function signToken(userId: number, email: string) {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "30d" });
}

function safeUser(u: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

function extractToken(req: any): string | null {
  const authHeader = req.headers?.authorization as string | undefined;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return (req as any).cookies?.safenode_token ?? null;
}

/* POST /api/auth/login */
router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    if (!user) return res.status(401).json({ error: "Credenciales incorrectas" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Credenciales incorrectas" });

    const token = signToken(user.id, user.email);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Error del servidor" });
  }
});

/* GET /api/auth/me */
router.get("/auth/me", async (req, res) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
    if (!user) return res.status(401).json({ error: "Usuario no encontrado" });
    res.json({ user: safeUser(user) });
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
});

/* POST /api/auth/logout */
router.post("/auth/logout", (_req, res) => {
  res.json({ ok: true });
});

/* PATCH /api/auth/config — update report config for current user */
router.patch("/auth/config", async (req, res) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const {
      companyName, companySubtitle, companyNit, companyAddress, companyCity, companyLogo,
      analystName, analystCargo, analystEmail, analystPhone,
      primaryColor, footerDisclaimer,
    } = req.body ?? {};
    const [updated] = await db.update(usersTable)
      .set({
        ...(companyName      !== undefined && { companyName }),
        ...(companySubtitle  !== undefined && { companySubtitle }),
        ...(companyNit       !== undefined && { companyNit }),
        ...(companyAddress   !== undefined && { companyAddress }),
        ...(companyCity      !== undefined && { companyCity }),
        ...(companyLogo      !== undefined && { companyLogo }),
        ...(analystName      !== undefined && { analystName }),
        ...(analystCargo     !== undefined && { analystCargo }),
        ...(analystEmail     !== undefined && { analystEmail }),
        ...(analystPhone     !== undefined && { analystPhone }),
        ...(primaryColor     !== undefined && { primaryColor }),
        ...(footerDisclaimer !== undefined && { footerDisclaimer }),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, payload.userId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ user: safeUser(updated) });
  } catch (err) {
    logger.error({ err }, "Config update error");
    res.status(401).json({ error: "No autorizado" });
  }
});

/* ── Middleware reutilizable para rutas protegidas ── */
export function requireAuth(req: any, res: any, next: any) {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: "No autenticado" }); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

export default router;
