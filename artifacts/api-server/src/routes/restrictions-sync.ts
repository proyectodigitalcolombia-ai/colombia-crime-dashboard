import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireAuth } from "./auth";
import crypto from "crypto";

const router = Router();

const MINTRANSPORTE_URL =
  "https://mintransporte.gov.co/publicaciones/12311/boletin-estrategico-de-seguridad-y-movilidad/";

async function fetchAndParseMinTransporte(): Promise<{
  hash: string;
  title: string;
  bulletinUrls: string[];
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const resp = await fetch(MINTRANSPORTE_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "SafeNodeBot/1.0" },
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    const pdfUrls: string[] = [];
    const pdfRe = /href="([^"]+\.pdf[^"]*)"/gi;
    let m: RegExpExecArray | null;
    while ((m = pdfRe.exec(html)) !== null) {
      const url = m[1]!.startsWith("http")
        ? m[1]!
        : `https://mintransporte.gov.co${m[1]!}`;
      if (!pdfUrls.includes(url)) pdfUrls.push(url);
    }

    const titleMatch = html.match(
      /<h1[^>]*class="[^"]*publication-title[^"]*"[^>]*>([^<]+)<\/h1>/i
    ) ??
      html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1]!.trim() : "Boletín MinTransporte";

    const hash = crypto
      .createHash("md5")
      .update(pdfUrls.join("|") + title)
      .digest("hex");

    return { hash, title, bulletinUrls: pdfUrls.slice(0, 10) };
  } finally {
    clearTimeout(timeout);
  }
}

async function runSync(): Promise<void> {
  const client = await pool.connect();
  try {
    const { hash, title, bulletinUrls } = await fetchAndParseMinTransporte();
    const last = await client.query<{
      data_hash: string | null;
      last_changed: Date | null;
    }>(
      "SELECT data_hash, last_changed FROM restrictions_sync ORDER BY last_checked DESC LIMIT 1"
    );
    const prev = last.rows[0] ?? null;
    const changed = !prev || prev.data_hash !== hash;

    await client.query(
      `INSERT INTO restrictions_sync
         (source_url, bulletin_title, bulletin_urls, data_hash, last_checked, last_changed, new_detected)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6)`,
      [
        MINTRANSPORTE_URL,
        title,
        JSON.stringify(bulletinUrls),
        hash,
        changed ? new Date() : (prev?.last_changed ?? new Date()),
        changed,
      ]
    );

    logger.info(
      { changed, bulletinCount: bulletinUrls.length },
      "Restrictions sync complete"
    );
  } catch (err) {
    logger.warn({ err }, "Restrictions sync failed — will retry next cycle");
    try {
      await client.query(
        `INSERT INTO restrictions_sync
           (source_url, bulletin_title, data_hash, last_checked, new_detected)
         VALUES ($1,'Error de conexión',NULL,NOW(),false)`,
        [MINTRANSPORTE_URL]
      );
    } catch {}
  } finally {
    client.release();
  }
}

export async function startRestrictionsSyncMonitor() {
  await runSync().catch(() => {});
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  setInterval(() => runSync().catch(() => {}), INTERVAL_MS);
  logger.info("Restrictions sync monitor started (24h interval)");
}

/* GET /api/restrictions/sync-status */
router.get("/restrictions/sync-status", async (_req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query<{
      source_url: string;
      bulletin_title: string | null;
      bulletin_urls: string | null;
      data_hash: string | null;
      last_checked: Date;
      last_changed: Date | null;
      new_detected: boolean;
    }>(
      "SELECT * FROM restrictions_sync ORDER BY last_checked DESC LIMIT 1"
    );
    if (result.rows.length === 0) {
      return res.json({
        lastChecked: null,
        lastChanged: null,
        bulletinTitle: null,
        bulletinUrls: [],
        newDetected: false,
        sourceUrl: MINTRANSPORTE_URL,
      });
    }
    const row = result.rows[0]!;
    res.json({
      lastChecked: row.last_checked,
      lastChanged: row.last_changed,
      bulletinTitle: row.bulletin_title,
      bulletinUrls: row.bulletin_urls ? JSON.parse(row.bulletin_urls) : [],
      newDetected: row.new_detected,
      sourceUrl: row.source_url,
    });
  } catch (err) {
    logger.error({ err }, "Error fetching sync status");
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

/* POST /api/restrictions/sync — manual trigger (admin only) */
router.post("/restrictions/sync", requireAuth, async (_req, res) => {
  try {
    await runSync();
    res.json({ ok: true, message: "Sincronización completada" });
  } catch (err) {
    res.status(500).json({ error: "Error al sincronizar" });
  }
});

export default router;
