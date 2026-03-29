import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "./auth";

const router = Router();

router.get("/companies", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, name, nit, contact_name, contact_email, contact_phone,
              address, city, logo, notes, created_at, updated_at
       FROM client_companies WHERE user_id = $1 ORDER BY name ASC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/companies", requireAuth, async (req: any, res) => {
  const { name, nit, contact_name, contact_email, contact_phone, address, city, logo, notes } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: "El nombre de la empresa es requerido" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO client_companies (user_id, name, nit, contact_name, contact_email, contact_phone, address, city, logo, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [req.userId, name.trim(), nit ?? "", contact_name ?? "", contact_email ?? "", contact_phone ?? "", address ?? "", city ?? "", logo ?? null, notes ?? ""]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/companies/:id", requireAuth, async (req: any, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
  const { name, nit, contact_name, contact_email, contact_phone, address, city, logo, notes } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: "El nombre de la empresa es requerido" });
  try {
    const { rows } = await pool.query(
      `UPDATE client_companies
       SET name=$1, nit=$2, contact_name=$3, contact_email=$4, contact_phone=$5,
           address=$6, city=$7, logo=$8, notes=$9, updated_at=NOW()
       WHERE id=$10 AND user_id=$11 RETURNING *`,
      [name.trim(), nit ?? "", contact_name ?? "", contact_email ?? "", contact_phone ?? "", address ?? "", city ?? "", logo ?? null, notes ?? "", id, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "Empresa no encontrada" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/companies/:id", requireAuth, async (req: any, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM client_companies WHERE id=$1 AND user_id=$2",
      [id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: "Empresa no encontrada" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
