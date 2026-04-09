/**
 * telegram-monitor.ts — Monitor automático de @notiabel en Telegram
 *
 * Cada 10 minutos consulta el canal público https://t.me/s/notiabel,
 * extrae mensajes nuevos, los clasifica con IA y los carga como alertas.
 *
 * Auto-resolución: si un mensaje dice "vía libre", "despejado", etc.,
 * marca como resueltos los eventos activos en la misma zona.
 *
 * Auto-expiración por tipo:
 *   accidente    → 6 horas
 *   trancon      → 3 horas
 *   cierre       → 24 horas
 *   manifestacion→ 12 horas
 *   otro         → 8 horas
 */

import { Router } from "express";
import { db, telegramAlertsTable } from "@workspace/db";
import { eq, and, lt, inArray, desc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";

const router = Router();

/* ── AI setup ─────────────────────────────────────────────────────────────── */
let _anthropic: Anthropic | null = null;
let _groq: Groq | null = null;
if (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL) {
  _anthropic = new Anthropic({
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    apiKey:  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "_DUMMY_",
  });
} else if (process.env.GROQ_API_KEY) {
  _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function askAI(prompt: string): Promise<string> {
  if (_anthropic) {
    const msg = await _anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  }
  if (_groq) {
    const c = await _groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
    });
    return c.choices[0]?.message?.content ?? "{}";
  }
  throw new Error("No AI backend");
}

/* ── Geocoder ─────────────────────────────────────────────────────────────── */
async function geocode(location: string): Promise<{ lat: number; lng: number } | null> {
  if (!location || location.length < 4) return null;
  try {
    const q = encodeURIComponent(`${location}, Colombia`);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=co`;
    const r = await fetch(url, {
      headers: { "User-Agent": "SafeNode-Security-Dashboard/1.0 (safenode.com.co)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data: any[] = await r.json();
    if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* ignore */ }
  return null;
}

/* ── Auto-expiry by event type ────────────────────────────────────────────── */
const EXPIRY_HOURS: Record<string, number> = {
  accidente:     6,
  trancon:       3,
  cierre:       24,
  manifestacion:12,
  otro:          8,
};

/* ── Resolution keywords ──────────────────────────────────────────────────── */
const RESOLUTION_KEYWORDS = [
  "vía libre", "via libre", "despejado", "despejada", "paso normal",
  "liberado", "liberada", "abierto", "abierta", "normalizado",
  "normalizada", "ya pasó", "ya paso", "se levantó", "se levanto",
  "sin novedad", "paso libre", "libre el paso",
];

function isResolutionText(text: string): boolean {
  const t = text.toLowerCase();
  return RESOLUTION_KEYWORDS.some(kw => t.includes(kw));
}

/* ── Monitor state ────────────────────────────────────────────────────────── */
export interface TelegramMonitorState {
  lastRun:       string | null;
  nextRun:       string | null;
  lastInserted:  number;
  totalInserted: number;
  totalResolved: number;
  errors:        string[];
  running:       boolean;
  messagesFound: number;
}

export const tgMonitorState: TelegramMonitorState = {
  lastRun: null, nextRun: null, lastInserted: 0, totalInserted: 0,
  totalResolved: 0, errors: [], running: false, messagesFound: 0,
};

/* ── Fetch messages from Telegram public preview ─────────────────────────── */
interface TgMessage { id: string; text: string; date: Date | null }

async function fetchTelegramMessages(channel: string): Promise<TgMessage[]> {
  const url = `https://t.me/s/${channel}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SafeNodeMonitor/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from Telegram`);
  const html = await res.text();

  const messages: TgMessage[] = [];

  const msgBlocks = html.matchAll(
    /data-post="[^"]+\/(\d+)"[\s\S]*?class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g
  );
  for (const match of msgBlocks) {
    const id   = match[1];
    const html = match[2];
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 5) {
      messages.push({ id, text, date: null });
    }
  }

  /* Fallback: simpler regex */
  if (messages.length === 0) {
    const simpleBlocks = html.matchAll(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g);
    let idx = 1000;
    for (const match of simpleBlocks) {
      const text = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 5) {
        messages.push({ id: `auto_${idx++}`, text, date: null });
      }
    }
  }

  /* Extract post dates from datetime elements */
  const dateTags = html.matchAll(/datetime="([^"]+)"/g);
  let di = 0;
  for (const dm of dateTags) {
    if (messages[di]) {
      messages[di].date = new Date(dm[1]);
      di++;
    }
  }

  return messages;
}

/* ── In-memory dedup ──────────────────────────────────────────────────────── */
const seenIds = new Set<string>();

/* ── Classify one message with AI ────────────────────────────────────────── */
interface Classification {
  eventType:    string;
  department:   string | null;
  via:          string | null;
  km:           string | null;
  locationText: string | null;
  severity:     string;
  isResolution: boolean;
}

async function classifyMessage(text: string): Promise<Classification | null> {
  const prompt = `Eres analista de seguridad vial de Colombia. Analiza este mensaje de un canal de transporte colombiano.

MENSAJE: "${text}"

Responde SOLO con un JSON (sin texto adicional):
{
  "eventType": "accidente|cierre|trancon|manifestacion|libre|otro",
  "department": "departamento colombiano o null",
  "via": "nombre de la vía o null",
  "km": "kilómetro mencionado o null",
  "locationText": "descripción del lugar más específica posible o null",
  "severity": "alto|medio|bajo",
  "isResolution": true|false
}

Reglas:
- eventType "libre" si indica que una vía está despejada/libre/normalizada
- isResolution=true si el mensaje indica que un evento anterior terminó
- severity "alto" = cierre total o accidente grave, "bajo" = trancon leve
- Si el mensaje no es sobre vías/transporte, eventType="otro"`;

  try {
    const raw = await askAI(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      eventType:    ["accidente","cierre","trancon","manifestacion","libre","otro"].includes(parsed.eventType)
                      ? parsed.eventType : "otro",
      department:   parsed.department   || null,
      via:          parsed.via          || null,
      km:           parsed.km           || null,
      locationText: parsed.locationText || null,
      severity:     ["alto","medio","bajo"].includes(parsed.severity) ? parsed.severity : "medio",
      isResolution: !!parsed.isResolution,
    };
  } catch { return null; }
}

/* ── Auto-resolve related active events ──────────────────────────────────── */
async function autoResolveRelated(locationText: string | null): Promise<number> {
  if (!locationText || locationText.length < 4) return 0;
  try {
    const active = await db
      .select({ id: telegramAlertsTable.id, locationText: telegramAlertsTable.locationText })
      .from(telegramAlertsTable)
      .where(eq(telegramAlertsTable.status, "activo"))
      .limit(200);

    const locLower = locationText.toLowerCase();
    const toResolve: number[] = [];

    for (const a of active) {
      if (!a.locationText) continue;
      const aLoc = a.locationText.toLowerCase();
      const words = locLower.split(/\s+/).filter(w => w.length > 3);
      const matches = words.filter(w => aLoc.includes(w));
      if (matches.length >= 2 || (words.length === 1 && aLoc.includes(words[0]))) {
        toResolve.push(a.id);
      }
    }

    if (toResolve.length === 0) return 0;

    await db
      .update(telegramAlertsTable)
      .set({ status: "resuelto", resolvedAt: new Date() })
      .where(inArray(telegramAlertsTable.id, toResolve));

    return toResolve.length;
  } catch { return 0; }
}

/* ── Expire old alerts ────────────────────────────────────────────────────── */
async function expireOldAlerts(): Promise<number> {
  try {
    const result = await db
      .update(telegramAlertsTable)
      .set({ status: "expirado" })
      .where(and(
        eq(telegramAlertsTable.status, "activo"),
        lt(telegramAlertsTable.autoExpireAt, new Date()),
      ))
      .returning({ id: telegramAlertsTable.id });
    return result.length;
  } catch { return 0; }
}

/* ── Main scan ────────────────────────────────────────────────────────────── */
export async function runTelegramScan(): Promise<void> {
  if (tgMonitorState.running) return;
  tgMonitorState.running = true;
  tgMonitorState.errors  = [];
  tgMonitorState.lastRun = new Date().toISOString();

  let inserted = 0;
  let resolved = 0;

  try {
    /* Expire old ones first */
    const expired = await expireOldAlerts();
    if (expired > 0) console.log(`[TelegramMonitor] Expirados: ${expired}`);

    const messages = await fetchTelegramMessages("notiabel");
    tgMonitorState.messagesFound = messages.length;
    console.log(`[TelegramMonitor] Mensajes encontrados: ${messages.length}`);

    for (const msg of messages) {
      if (seenIds.has(msg.id)) continue;

      /* Check DB dedup */
      const existing = await db
        .select({ id: telegramAlertsTable.id })
        .from(telegramAlertsTable)
        .where(eq(telegramAlertsTable.messageId, msg.id))
        .limit(1);
      if (existing.length > 0) { seenIds.add(msg.id); continue; }

      /* Skip very short or non-transport messages quickly */
      if (msg.text.length < 10) { seenIds.add(msg.id); continue; }

      /* Classify with AI */
      const cls = await classifyMessage(msg.text).catch(() => null);
      if (!cls) { seenIds.add(msg.id); continue; }

      /* Handle resolution messages */
      if (cls.isResolution || cls.eventType === "libre") {
        const r = await autoResolveRelated(cls.locationText);
        resolved += r;
        if (r > 0) console.log(`[TelegramMonitor] Auto-resolvió ${r} evento(s) por: "${msg.text.slice(0, 60)}"`);
        seenIds.add(msg.id);
        continue;
      }

      /* Skip "otro" unless short text was classified */
      if (cls.eventType === "otro" && !isResolutionText(msg.text)) {
        seenIds.add(msg.id);
        continue;
      }

      /* Geocode */
      const geoQuery = cls.locationText
        ? `${cls.locationText}${cls.department ? ", " + cls.department : ""}`
        : (cls.department ?? "");
      const geo = geoQuery ? await geocode(geoQuery).catch(() => null) : null;

      /* Calculate expiry */
      const expireHours = EXPIRY_HOURS[cls.eventType] ?? 8;
      const autoExpireAt = new Date(Date.now() + expireHours * 60 * 60 * 1000);

      try {
        await db.insert(telegramAlertsTable).values({
          messageId:    msg.id,
          channel:      "notiabel",
          rawText:      msg.text.slice(0, 1000),
          eventType:    cls.eventType,
          department:   cls.department,
          via:          cls.via,
          km:           cls.km,
          locationText: cls.locationText,
          severity:     cls.severity,
          lat:          geo?.lat ?? null,
          lng:          geo?.lng ?? null,
          status:       "activo",
          messageDate:  msg.date ?? new Date(),
          autoExpireAt,
        });
        inserted++;
        seenIds.add(msg.id);
        console.log(`[TelegramMonitor] +1 ${cls.eventType} (${cls.severity}) → ${cls.locationText ?? "?"}`);
      } catch (err: any) {
        if (!err.message?.includes("unique")) {
          tgMonitorState.errors.push(err.message);
        }
        seenIds.add(msg.id);
      }

      await new Promise(r => setTimeout(r, 800));
    }
  } catch (err: any) {
    console.error("[TelegramMonitor] Error en escaneo:", err.message);
    tgMonitorState.errors.push(err.message);
  }

  tgMonitorState.lastInserted   = inserted;
  tgMonitorState.totalInserted += inserted;
  tgMonitorState.totalResolved += resolved;
  tgMonitorState.running        = false;
  const nextMs = Date.now() + 10 * 60 * 1000;
  tgMonitorState.nextRun = new Date(nextMs).toISOString();
  console.log(`[TelegramMonitor] Escaneo completo. +${inserted} alertas, +${resolved} resueltas. Próximo en 10 min.`);
}

/* ── Background scheduler ─────────────────────────────────────────────────── */
export function startTelegramMonitor(): void {
  const INTERVAL_MS = 10 * 60 * 1000;
  setTimeout(() => {
    runTelegramScan().catch(err => console.error("[TelegramMonitor] Error primer scan:", err));
    setInterval(() => {
      runTelegramScan().catch(err => console.error("[TelegramMonitor] Error scan:", err));
    }, INTERVAL_MS);
  }, 2 * 60 * 1000); // first run 2 min after boot

  tgMonitorState.nextRun = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  console.log("[TelegramMonitor] Monitor @notiabel activado — primer escaneo en 2 min, luego cada 10 min.");
}

/* ── GET /api/telegram-alerts ─────────────────────────────────────────────── */
router.get("/telegram-alerts", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(telegramAlertsTable)
      .where(eq(telegramAlertsTable.status, "activo"))
      .orderBy(desc(telegramAlertsTable.messageDate))
      .limit(100);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/telegram-alerts/all ────────────────────────────────────────── */
router.get("/telegram-alerts/all", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await db
      .select()
      .from(telegramAlertsTable)
      .orderBy(desc(telegramAlertsTable.messageDate))
      .limit(limit);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT /api/telegram-alerts/:id/resolve ────────────────────────────────── */
router.put("/telegram-alerts/:id/resolve", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  try {
    await db
      .update(telegramAlertsTable)
      .set({ status: "resuelto", resolvedAt: new Date() })
      .where(eq(telegramAlertsTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/telegram-alerts/scan ─────────────────────────────────────── */
router.post("/telegram-alerts/scan", async (_req, res) => {
  if (tgMonitorState.running) {
    return res.json({ message: "Escaneo ya en curso", ...tgMonitorState });
  }
  runTelegramScan().catch(err => console.error("[TelegramMonitor] Error en scan manual:", err));
  res.json({ message: "Escaneo iniciado", nextRun: tgMonitorState.nextRun });
});

/* ── GET /api/telegram-alerts/status ────────────────────────────────────── */
router.get("/telegram-alerts/status", (_req, res) => {
  res.json({
    ...tgMonitorState,
    aiAvailable: !!(_anthropic || _groq),
    channel: "notiabel",
  });
});

export default router;
