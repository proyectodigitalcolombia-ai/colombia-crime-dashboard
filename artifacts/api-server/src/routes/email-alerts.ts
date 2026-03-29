import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "./auth";
import { logger } from "../lib/logger";
import { findUpcomingPuente, type Puente } from "../lib/restrictions-data";

const router = Router();

/* ── helpers ── */
function getResend() {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return null;
  const { Resend } = require("resend");
  return new Resend(apiKey);
}

function daysUntil(date: Date, now = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function buildPuenteHtml(puente: Puente, daysBefore: number, isTest = false): string {
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("es-CO", { weekday:"long", day:"numeric", month:"long", year:"numeric", timeZone:"America/Bogota" });

  const scheduleRows = puente.horarios
    .filter(h => !h.noAplica)
    .map(h => `
      <tr>
        <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#334155;white-space:nowrap;">${h.dia}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;color:#475569;">${h.fecha}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;color:#dc2626;font-weight:600;white-space:nowrap;">${h.horario}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;color:#475569;font-size:12px;">${h.aplicacion}</td>
      </tr>`)
    .join("");

  const noAplicaRows = puente.horarios.filter(h => h.noAplica);
  const noAplicaNote = noAplicaRows.length > 0
    ? `<tr><td colspan="4" style="padding:9px 14px;background:#f0fdf4;color:#166534;font-size:12px;">
        Sin restricción: ${noAplicaRows.map(h => h.fecha).join(", ")}
      </td></tr>`
    : "";

  const countDown = daysUntil(puente.inicio);
  const urgencyColor = countDown <= 1 ? "#ef4444" : countDown <= 3 ? "#f59e0b" : "#3b82f6";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Alerta Restricciones Viales — SafeNode</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1);max-width:620px;">

  <!-- HEADER -->
  <tr><td style="background:#070c15;padding:24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:20px;font-weight:700;color:#00d4ff;letter-spacing:0.03em;">SafeNode S.A.S.</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;letter-spacing:0.06em;text-transform:uppercase;">
          Inteligencia en Seguridad Logística y Transporte
        </div>
      </td>
      <td align="right">
        <div style="background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:5px 14px;border-radius:20px;letter-spacing:0.08em;text-transform:uppercase;">
          ${isTest ? "PRUEBA" : "ALERTA ACTIVA"}
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- COUNTDOWN BANNER -->
  <tr><td style="background:${urgencyColor};padding:16px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:15px;font-weight:700;color:#ffffff;">
          &#9888; Restriccion Vehicular — ${puente.nombre}
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">
          Inicia el ${fmtDate(puente.inicio)} · Termina el ${fmtDate(puente.fin)}
        </div>
      </td>
      <td align="right" style="padding-left:16px;">
        <div style="background:rgba(255,255,255,0.2);border-radius:8px;padding:8px 16px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#ffffff;line-height:1;">${countDown}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.06em;">
            ${countDown === 1 ? "DIA" : "DIAS"}
          </div>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:28px 32px;">

    <!-- Intro -->
    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
      ${isTest
        ? "Este es un <strong>correo de prueba</strong> del sistema de alertas automáticas SafeNode. En un correo real, vería la información de restricciones vigentes para el puente más próximo."
        : `El siguiente puente festivo entra en vigor en <strong>${countDown} día${countDown !== 1 ? "s" : ""}</strong>. Revise el cronograma de restricciones a continuación y planifique sus operaciones de transporte.`
      }
    </p>

    <!-- Regulation note -->
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px;">NORMATIVA APLICABLE</div>
      <div style="font-size:12px;color:#78350f;">
        Aplica a vehiculos con peso bruto vehicular &gt;= 3.400 kg. Fuente: MinTransporte Colombia.
        Fuente de datos: <strong>${puente.fuente === "oficial" ? "Boletin Oficial MinTransporte" : "Estimado (patron historico)"}</strong>
      </div>
    </div>

    <!-- Schedule table -->
    <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;">
      Cronograma de Restricciones
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 14px;text-align:left;color:#475569;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e2e8f0;">Dia</th>
          <th style="padding:10px 14px;text-align:left;color:#475569;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e2e8f0;">Fecha</th>
          <th style="padding:10px 14px;text-align:left;color:#475569;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e2e8f0;">Horario</th>
          <th style="padding:10px 14px;text-align:left;color:#475569;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid #e2e8f0;">Aplicacion</th>
        </tr>
      </thead>
      <tbody>${scheduleRows}${noAplicaNote}</tbody>
    </table>

    ${puente.nota ? `<div style="margin-top:14px;padding:10px 14px;background:#f8fafc;border-radius:6px;font-size:12px;color:#64748b;">
      <strong>Nota:</strong> ${puente.nota}
    </div>` : ""}

    <!-- CTA -->
    <div style="margin-top:24px;text-align:center;">
      <a href="https://colombia-crime-api.onrender.com" style="display:inline-block;background:#00d4ff;color:#000;font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">
        Ver Dashboard Completo
      </a>
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
    <div style="font-size:11px;color:#94a3b8;text-align:center;line-height:1.6;">
      Generado automaticamente por SafeNode Intelligence Dashboard.<br/>
      Documento confidencial — uso exclusivo interno. No reenviar.
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
    const upcomingPuente = findUpcomingPuente(30);
    const puente = upcomingPuente ?? {
      id: "test",
      nombre: "Próximo Puente Festivo",
      inicio: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      fin:    new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      fuente: "estimado" as const,
      horarios: [
        { dia: "VIERNES",  fecha: "Ejemplo", horario: "15:00–22:00", aplicacion: "Cundinamarca éxodo + Bogotá–Ibagué" },
        { dia: "SÁBADO",   fecha: "Ejemplo", horario: "06:00–15:00", aplicacion: "Todas las vías (ambos sentidos)" },
        { dia: "DOMINGO",  fecha: "Ejemplo", horario: "15:00–23:00", aplicacion: "Solo retorno" },
        { dia: "LUNES (F)", fecha: "Ejemplo", festivo: true, horario: "10:00–23:00", aplicacion: "Todas las vías" },
      ],
    };

    const html = buildPuenteHtml(puente, 1, true);
    await resend.emails.send({
      from: process.env["FROM_EMAIL"] ?? "alertas@safenode.com.co",
      to,
      subject: `[SafeNode PRUEBA] Alerta de restricción vehicular — ${puente.nombre}`,
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

/* ═══════════════════════════════════════════════════
   AUTOMATIC SCHEDULER — runs every hour
   ═══════════════════════════════════════════════════ */
export function startEmailAlertScheduler() {
  const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  async function runScheduler() {
    const resend = getResend();
    if (!resend) return; // no API key — skip silently

    const now = new Date();
    const bogotaNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const currentHour = bogotaNow.getHours();

    try {
      // Fetch all enabled configs whose send_hour matches the current hour
      const { rows: configs } = await pool.query(
        `SELECT id, user_id, recipients, days_before, last_sent_at
         FROM email_alert_configs
         WHERE enabled = true
           AND send_hour = $1
           AND (last_sent_at IS NULL OR last_sent_at < NOW() - INTERVAL '23 hours')`,
        [currentHour]
      );

      if (configs.length === 0) return;

      for (const cfg of configs) {
        const recipients: string[] = Array.isArray(cfg.recipients)
          ? cfg.recipients
          : (cfg.recipients ?? []);

        if (recipients.length === 0) continue;

        // Find a puente starting within days_before days
        const puente = findUpcomingPuente(cfg.days_before, bogotaNow);
        if (!puente) continue; // nothing upcoming — skip

        const html = buildPuenteHtml(puente, cfg.days_before, false);
        const daysLeft = daysUntil(puente.inicio, bogotaNow);
        const subject = daysLeft <= 1
          ? `[SafeNode] ⚠ MAÑANA — Restricción vehicular: ${puente.nombre}`
          : `[SafeNode] Alerta ${daysLeft} días — Restricción vehicular: ${puente.nombre}`;

        try {
          await resend.emails.send({
            from: process.env["FROM_EMAIL"] ?? "alertas@safenode.com.co",
            to: recipients,
            subject,
            html,
          });

          await pool.query(
            `UPDATE email_alert_configs SET last_sent_at = NOW() WHERE id = $1`,
            [cfg.id]
          );

          logger.info({ puente: puente.nombre, recipients, daysLeft }, "[EmailAlerts] Alert sent");
        } catch (err) {
          logger.error({ err, cfgId: cfg.id }, "[EmailAlerts] Failed to send alert");
        }
      }
    } catch (err) {
      logger.error({ err }, "[EmailAlerts] Scheduler error");
    }
  }

  // Run once after 5 minutes, then every hour
  setTimeout(() => {
    runScheduler();
    setInterval(runScheduler, INTERVAL_MS);
  }, 5 * 60 * 1000);

  logger.info("[EmailAlerts] Scheduler started — checks every hour at configured send_hour (Bogotá TZ)");
}

export default router;
