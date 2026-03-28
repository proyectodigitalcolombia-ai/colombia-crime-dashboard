/**
 * news-monitor.ts — Monitor automático de RSS colombianos
 *
 * Cada 2 horas busca artículos con palabras clave de bloqueos viales
 * en los principales medios de Colombia, extrae bloqueos con IA y
 * los registra automáticamente con expiración de 48h.
 *
 * Fuentes RSS monitoreadas:
 *  - W Radio Colombia
 *  - Caracol Radio
 *  - El Tiempo
 *  - Semana
 *  - La FM
 *  - ANSV (Agencia Nacional de Seguridad Vial)
 */

import { Router } from "express";
import { db, blockadeTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import Groq from "groq-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { parse as parseHtml } from "node-html-parser";

const router = Router();

/* ── AI setup (same pattern as blockades.ts) ──────────────────────────────── */
let _anthropic: Anthropic | null = null;
let _groq: Groq | null = null;
if (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL) {
  _anthropic = new Anthropic({
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "_DUMMY_",
  });
} else if (process.env.GROQ_API_KEY) {
  _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function askAI(prompt: string): Promise<string> {
  if (_anthropic) {
    const msg = await _anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0]?.type === "text" ? msg.content[0].text : "[]";
  }
  if (_groq) {
    const c = await _groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    });
    return c.choices[0]?.message?.content ?? "[]";
  }
  throw new Error("No AI backend");
}

/* ── Geocoder (Nominatim) ─────────────────────────────────────────────────── */
async function geocode(location: string, department: string): Promise<{ lat: number; lng: number } | null> {
  const queries = [`${location}, ${department}, Colombia`, `${location}, Colombia`];
  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=co`;
      const r = await fetch(url, {
        headers: { "User-Agent": "SafeNode-Security-Dashboard/1.0 (safenode.com.co)" },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) continue;
      const data: any[] = await r.json();
      if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch { /* ignore */ }
  }
  return null;
}

/* ── RSS sources ─────────────────────────────────────────────────────────── */
interface RssSource {
  name: string;
  url: string;
}

const RSS_SOURCES: RssSource[] = [
  { name: "W Radio", url: "https://www.wradio.com.co/noticias/rss/noticias.xml" },
  { name: "Caracol Radio", url: "https://caracol.com.co/rss/" },
  { name: "El Tiempo", url: "https://www.eltiempo.com/rss/colombia.xml" },
  { name: "Semana", url: "https://www.semana.com/rss.xml" },
  { name: "La FM", url: "https://www.lafm.com.co/rss.xml" },
  { name: "RCN Radio", url: "https://www.rcnradio.com/feed" },
];

const BLOCKADE_KEYWORDS = [
  "bloqueo vial", "bloqueos viales", "cierre vial", "cierres viales",
  "vía cerrada", "vías cerradas", "vía bloqueada", "bloqueo carretero",
  "paro armado", "piratería terrestre", "paro camionero", "minga",
  "protesta bloqueo", "carretera bloqueada", "carretera cerrada",
  "bloqueo en la vía", "cierre de la vía",
];

const VALID_CAUSES = ["comunidad","protesta_social","paro_camionero","grupos_ilegales","otro"] as const;
const VALID_STATUS = ["activo","levantado","intermitente"] as const;
const VALID_CORRIDORS = ["bog-med","bog-cal","bog-baq","med-bar","cal-bar","bog-vil","bog-cuc","med-eje","bog-tun","cal-pop","otro"];

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

/* ── Simple RSS XML parser ───────────────────────────────────────────────── */
function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
  for (const match of itemMatches) {
    const block = match[1];
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"))
        ?? block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? m[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"') : "";
    };
    const title = get("title");
    const link = get("link") || get("guid");
    const description = get("description");
    const pubDate = get("pubDate");
    if (title && link) items.push({ title, link, description, pubDate });
  }
  return items;
}

function isRelevantArticle(item: RssItem): boolean {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return BLOCKADE_KEYWORDS.some(kw => text.includes(kw));
}

/* ── Dedup: track processed article URLs in memory ──────────────────────── */
const processedUrls = new Set<string>();

/* ── Monitor state (for status API) ─────────────────────────────────────── */
interface MonitorState {
  lastRun: string | null;
  nextRun: string | null;
  lastInserted: number;
  totalInserted: number;
  errors: string[];
  sourcesChecked: string[];
  articlesFound: number;
  running: boolean;
}

export const monitorState: MonitorState = {
  lastRun: null,
  nextRun: null,
  lastInserted: 0,
  totalInserted: 0,
  errors: [],
  sourcesChecked: [],
  articlesFound: 0,
  running: false,
};

/* ── Fetch one RSS feed ──────────────────────────────────────────────────── */
async function fetchRss(source: RssSource): Promise<RssItem[]> {
  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SafeNodeMonitor/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssXml(xml);
  } catch (err: any) {
    console.warn(`[NewsMonitor] Error en RSS ${source.name}: ${err.message}`);
    return [];
  }
}

/* ── Fetch article body for deeper analysis ─────────────────────────────── */
async function fetchArticleText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "es-CO,es;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const root = parseHtml(html);
    root.querySelectorAll("script,style,nav,footer,header,aside,iframe,noscript").forEach(el => el.remove());
    return root.textContent.replace(/\s{2,}/g, " ").trim().slice(0, 6000);
  } catch {
    return "";
  }
}

/* ── Process one batch of relevant articles ─────────────────────────────── */
async function processArticles(items: RssItem[], sourceName: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  let inserted = 0;

  for (const item of items) {
    if (processedUrls.has(item.link)) continue;
    processedUrls.add(item.link);

    let articleText = item.description || item.title;

    /* Try to fetch full article for better context */
    if (articleText.length < 200) {
      const fullText = await fetchArticleText(item.link).catch(() => "");
      if (fullText.length > 100) articleText = fullText;
    }

    const combinedText = `${item.title}\n\n${articleText}`.slice(0, 5000);

    let blockades: any[] = [];
    try {
      const aiText = await askAI(`Eres un analista de seguridad vial de Colombia. Analiza este artículo de ${sourceName} y extrae los bloqueos viales activos.

ARTÍCULO:
${combinedText}

Responde SOLO con un JSON array. Si no hay bloqueos viales ACTIVOS en Colombia, responde []. Cada objeto:
- "corridorId": uno de ${JSON.stringify(VALID_CORRIDORS)}
- "department": departamento colombiano donde ocurre FÍSICAMENTE el bloqueo
- "municipality": municipio específico
- "date": fecha YYYY-MM-DD (usa ${today} si no se especifica)
- "location": punto exacto del bloqueo (km, sector, municipio)
- "cause": uno de ${JSON.stringify(VALID_CAUSES)}
- "status": uno de ${JSON.stringify(VALID_STATUS)}
- "notes": resumen del incidente máx 160 caracteres

Si el artículo habla de un cierre YA LEVANTADO, usa status "levantado".
Responde SOLO el JSON array, sin texto adicional.`);

      const m = aiText.match(/\[[\s\S]*\]/);
      if (m) blockades = JSON.parse(m[0]);
    } catch {
      continue;
    }

    if (!Array.isArray(blockades) || blockades.length === 0) continue;

    const hostname = (() => { try { return new URL(item.link).hostname; } catch { return sourceName; } })();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h expiry for RSS auto-imports

    const geocodeResults = await Promise.all(
      blockades.map(b => geocode(b.municipality ?? b.location ?? "", b.department ?? "").catch(() => null))
    );

    const toInsert = blockades.map((b, i) => ({
      corridorId:    VALID_CORRIDORS.includes(b.corridorId) ? b.corridorId : "otro",
      department:    String(b.department || "Colombia").trim(),
      date:          String(b.date || today).trim(),
      cause:         (VALID_CAUSES.includes(b.cause) ? b.cause : "otro") as typeof VALID_CAUSES[number],
      location:      String(b.location || "Sin especificar").trim(),
      status:        (VALID_STATUS.includes(b.status) ? b.status : "activo") as typeof VALID_STATUS[number],
      notes:         `[${item.title.slice(0, 60)}] ${b.notes || ""}`.slice(0, 280),
      reporter:      `RSS·${sourceName}`,
      durationHours: null as number | null,
      lat:           geocodeResults[i]?.lat ?? null,
      lng:           geocodeResults[i]?.lng ?? null,
      source:        "news_rss" as string,
      sourceUrl:     item.link,
      expiresAt,
    }));

    try {
      const result = await db.insert(blockadeTable).values(toInsert).returning({ id: blockadeTable.id });
      inserted += result.length;
      console.log(`[NewsMonitor] +${result.length} bloqueo(s) desde "${item.title.slice(0, 60)}" (${sourceName})`);
    } catch (err: any) {
      console.warn(`[NewsMonitor] Error insertando desde ${item.link}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1500)); // be polite between articles
  }

  return inserted;
}

/* ── Main monitor scan ───────────────────────────────────────────────────── */
export async function runNewsMonitorScan(): Promise<void> {
  if (monitorState.running) {
    console.log("[NewsMonitor] Ya hay un escaneo en curso, se omite.");
    return;
  }
  monitorState.running = true;
  monitorState.lastRun = new Date().toISOString();
  monitorState.errors = [];
  monitorState.sourcesChecked = [];
  monitorState.articlesFound = 0;
  let totalNew = 0;

  console.log("[NewsMonitor] Iniciando escaneo de RSS colombianos…");

  for (const source of RSS_SOURCES) {
    try {
      const items = await fetchRss(source);
      const relevant = items.filter(isRelevantArticle);
      const unprocessed = relevant.filter(i => !processedUrls.has(i.link));

      monitorState.sourcesChecked.push(source.name);
      monitorState.articlesFound += unprocessed.length;

      if (unprocessed.length > 0) {
        console.log(`[NewsMonitor] ${source.name}: ${unprocessed.length} artículo(s) relevante(s) nuevos`);
        const inserted = await processArticles(unprocessed, source.name);
        totalNew += inserted;
      } else {
        console.log(`[NewsMonitor] ${source.name}: sin novedades`);
      }
    } catch (err: any) {
      const msg = `${source.name}: ${err.message}`;
      monitorState.errors.push(msg);
      console.warn(`[NewsMonitor] Error en ${msg}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  monitorState.lastInserted = totalNew;
  monitorState.totalInserted += totalNew;
  monitorState.running = false;
  const nextMs = Date.now() + 2 * 60 * 60 * 1000;
  monitorState.nextRun = new Date(nextMs).toISOString();
  console.log(`[NewsMonitor] Escaneo completo. +${totalNew} nuevos bloqueos. Próximo en 2h.`);
}

/* ── Start background schedule ──────────────────────────────────────────── */
export function startNewsMonitor(): void {
  if (!_anthropic && !_groq) {
    console.warn("[NewsMonitor] Sin IA disponible — monitor de noticias desactivado.");
    return;
  }
  const INTERVAL_MS = 2 * 60 * 60 * 1000; // every 2h

  /* First run after 10 minutes (allow server to stabilize) */
  setTimeout(() => {
    runNewsMonitorScan().catch(err => console.error("[NewsMonitor] Error en primer escaneo:", err));
    setInterval(() => {
      runNewsMonitorScan().catch(err => console.error("[NewsMonitor] Error en escaneo programado:", err));
    }, INTERVAL_MS);
  }, 10 * 60 * 1000);

  monitorState.nextRun = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  console.log("[NewsMonitor] Monitor de RSS colombianos activado — primer escaneo en 10 min, luego cada 2h.");
}

/* ── GET /api/news-monitor/status ───────────────────────────────────────── */
router.get("/news-monitor/status", (_req, res) => {
  res.json({
    ...monitorState,
    aiAvailable: !!(_anthropic || _groq),
    sources: RSS_SOURCES.map(s => s.name),
    processedUrls: processedUrls.size,
  });
});

/* ── POST /api/news-monitor/scan — manual trigger ───────────────────────── */
router.post("/news-monitor/scan", async (_req, res) => {
  if (!_anthropic && !_groq) {
    return res.status(503).json({ error: "Sin IA disponible" });
  }
  if (monitorState.running) {
    return res.json({ message: "Escaneo ya en curso", ...monitorState });
  }
  runNewsMonitorScan().catch(err => console.error("[NewsMonitor] Error en escaneo manual:", err));
  res.json({ message: "Escaneo iniciado", nextRun: monitorState.nextRun });
});

export default router;
