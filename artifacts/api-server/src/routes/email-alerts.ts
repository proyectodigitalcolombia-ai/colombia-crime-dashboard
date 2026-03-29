import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "./auth";
import { logger } from "../lib/logger";

const router = Router();

/* ── helpers ── */
function getResend() {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return null;
  const { Resend } = require("resend");
  return new Resend(apiKey);
}

async function buildAlertHtml(alertConfig: any, restrictions: any[]): Promise<string> {
  const rows = restrictions
    .map(r => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e2a3a;">${r.holiday_name ?? r.nombre ?? ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e2a3a;">${r.start_date ?? r.fecha_inicio ?? ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e2a3a;">${r.end_date ?? r.fecha_fin ?? ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e2a3a;">${r.restriction_schedule ?? r.horario ?? "Según resolución MINTRANSPORTE"}</td>
      </tr>`)
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><title>Alerta de Restricciones Viales — SafeNode</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#070c15;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <div style="font-size:18px;font-weight:700;color:#00d4ff;letter-spacing:0.04em;">SafeNode S.A.S.</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;">Inteligencia en Seguridad Logística y Transporte</div>
              </td>
              <td align="right">
                <div style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:0.06em;">ALERTA ACTIVA</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Alert banner -->
        <tr><td style="background:#7f1d1d;padding:14px 32px;">
          <div style="font-size:14px;font-weight:600;color:#fecaca;">
            Restricciones Vehiculares — Puente Festivo Próximo
          </div>
          <div style="font-size:12px;color:rgba(254,202,202,0.7);margin-top:4px;">
            Las siguientes restricciones entran en vigor en los próximos ${alertConfig.days_before} día(s)
          </div>
        </td></tr>
        <!-- Table -->
        <tr><td style="padding:24px 32px;">
          ${restrictions.length === 0
            ? `<p style="color:#64748b;font-size:14px;">No se encontraron restricciones próximas. Este es un correo de prueba.</p>`
            : `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:10px 12px;text-align:left;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Festivo</th>
                  <th style="padding:10px 12px;text-align:left;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Inicio</th>
                  <th style="padding:10px 12px;text-align:left;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Fin</th>
                  <th style="padding:10px 12px;text-align:left;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Horario Restricción</th>
                </tr>
              </thead>
              <tbody style="color:#334155;">${rows}</tbody>
            </table>`
          }
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
          <div style="font-size:11px;color:#94a3b8;text-align:center;">
            Generado automáticamente por el sistema SafeNode Intelligence Dashboard.<br/>
            Documento confidencial — uso exclusivo interno.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ── GET current config ── */
router.get("/email-alerts/config", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, recipients, enabled, days_before, send_hour, last_sent_at, created_at, updated_at
       FROM email_alert_configs WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    if (rows.length === 0) return res.json(null);
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT upsert config ── */
router.put("/email-alerts/config", requireAuth, async (req: any, res) => {
  const { recipients, enabled, days_before, send_hour } = req.body ?? {};
  const recipientsArr = Array.isArray(recipients) ? recipients : [];
  const daysB = Number(days_before ?? 1);
  const hour = Number(send_hour ?? 18);

  if (daysB < 1 || daysB > 7) return res.status(400).json({ error: "days_before debe estar entre 1 y 7" });
  if (hour < 0 || hour > 23) return res.status(400).json({ error: "send_hour debe estar entre 0 y 23" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO email_alert_configs (user_id, recipients, enabled, days_before, send_hour)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         recipients = EXCLUDED.recipients,
         enabled = EXCLUDED.enabled,
         days_before = EXCLUDED.days_before,
         send_hour = EXCLUDED.send_hour,
         updated_at = NOW()
       RETURNING *`,
      [req.userId, JSON.stringify(recipientsArr), enabled ?? true, daysB, hour]
    );
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST send test email ── */
router.post("/email-alerts/test", requireAuth, async (req: any, res) => {
  const { recipients } = req.body ?? {};
  const to = Array.isArray(recipients) ? recipients : [];
  if (to.length === 0) return res.status(400).json({ error: "Se requiere al menos un destinatario" });

  const resend = getResend();
  if (!resend) {
    return res.status(503).json({
      error: "RESEND_API_KEY no está configurada. Por favor agregue la variable de entorno en Render.",
      hint: "Configure RESEND_API_KEY en las variables de entorno del servicio.",
    });
  }

  try {
    const html = await buildAlertHtml({ days_before: 1 }, []);
    await resend.emails.send({
      from: process.env["FROM_EMAIL"] ?? "alertas@safenode.com.co",
      to,
      subject: "[SafeNode] Correo de prueba — Sistema de Alertas de Restricciones",
      html,
    });
    res.json({ ok: true, message: `Correo de prueba enviado a: ${to.join(", ")}` });
  } catch (err: any) {
    logger.error({ err }, "Error sending test email");
    res.status(500).json({ error: err.message ?? "Error al enviar el correo" });
  }
});

/* ── GET Resend status ── */
router.get("/email-alerts/status", requireAuth, async (_req, res) => {
  const configured = !!process.env["RESEND_API_KEY"];
  res.json({ configured, provider: "Resend" });
});

export default router;
