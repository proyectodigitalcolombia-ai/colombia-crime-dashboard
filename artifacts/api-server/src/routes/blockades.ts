import { Router, type IRouter } from "express";
import { db, blockadeTable } from "@workspace/db";
import { eq, desc, lt, gt, and, ne, isNull, or } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import { parse as parseHtml } from "node-html-parser";
import { PDFParse } from "pdf-parse";

/* ── Nominatim geocoder (OpenStreetMap, free, no key required) ─────────────
   Returns precise lat/lng for a location string like "Oiba, Santander"
   ──────────────────────────────────────────────────────────────────────── */
async function geocode(location: string, department: string): Promise<{ lat: number; lng: number } | null> {
  const queries = [
    `${location}, ${department}, Colombia`,
    `${location}, Colombia`,
  ];
  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=co`;
      const r = await fetch(url, {
        headers: { "User-Agent": "SafeNode-Security-Dashboard/1.0 (safenode.com.co)" },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) continue;
      const data: any[] = await r.json();
      if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch { /* ignore, try next query */ }
  }
  return null;
}

/* ── Unified AI helper ────────────────────────────────────────────────────────
   Priority:
   1. Replit dev proxy (AI_INTEGRATIONS_ANTHROPIC_BASE_URL set) → Anthropic Claude
   2. Production → Groq Llama 3.3 via GROQ_API_KEY (free tier, no credit card)
   3. Neither → aiAvailable = false, endpoints return 503
   ──────────────────────────────────────────────────────────────────────────── */
let _anthropic: Anthropic | null = null;
let _groq: Groq | null = null;

if (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL) {
  _anthropic = new Anthropic({
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "_DUMMY_",
  });
} else if (process.env.GROQ_API_KEY) {
  _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} else {
  console.warn("[blockades] No AI key configured — Set GROQ_API_KEY (free at console.groq.com).");
}

const aiAvailable = !!(_anthropic || _groq);

async function askAI(prompt: string): Promise<string> {
  if (_anthropic) {
    const msg = await _anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0]?.type === "text" ? msg.content[0].text : "[]";
  }
  if (_groq) {
    const completion = await _groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
    });
    return completion.choices[0]?.message?.content ?? "[]";
  }
  throw new Error("No AI backend available");
}

const router: IRouter = Router();

const VALID_CAUSES = ["comunidad","protesta_social","paro_camionero","grupos_ilegales","otro"] as const;
const VALID_STATUS = ["activo","levantado","intermitente"] as const;
type BlockadeCause = typeof VALID_CAUSES[number];
type BlockadeStatus = typeof VALID_STATUS[number];

function validateBody(body: any): { data: any; error?: string } {
  if (!body.corridorId?.trim()) return { data: null, error: "corridorId es requerido" };
  if (!body.department?.trim()) return { data: null, error: "department es requerido" };
  if (!body.date?.trim()) return { data: null, error: "date es requerida" };
  if (!body.location?.trim()) return { data: null, error: "location es requerido" };
  if (body.cause && !VALID_CAUSES.includes(body.cause)) return { data: null, error: "cause inválido" };
  if (body.status && !VALID_STATUS.includes(body.status)) return { data: null, error: "status inválido" };
  return { data: body };
}

/* ─── TTL por fuente ──────────────────────────────────────────────────────────
   news_rss    → 12 horas  (noticias del día, se resuelven rápido)
   news_import → 24 horas  (importación manual de URL)
   manual      → 7 días    (operador los creó, se resuelven manualmente)
   ──────────────────────────────────────────────────────────────────────────── */
const TTL_MS: Record<string, number> = {
  news_rss:    12 * 60 * 60 * 1000,
  news_import: 24 * 60 * 60 * 1000,
  manual:       7 * 24 * 60 * 60 * 1000,
};

/* ─── Auto-expiry background job ─────────────────────────────────────────────
   Corre cada hora. Marca como 'levantado' los bloqueos que:
   1. Tienen expiresAt pasado (lógica original)
   2. Son RSS/import más viejos que su TTL (incluso si expiresAt es null)
   3. Son manuales con más de 7 días sin actualización
   ──────────────────────────────────────────────────────────────────────────── */
export async function runBlockadeExpiry(): Promise<number> {
  const now = new Date();
  let total = 0;

  // 1. expiresAt explícito ya pasó (non-manual)
  const r1 = await db.update(blockadeTable)
    .set({ status: "levantado", updatedAt: now })
    .where(and(
      lt(blockadeTable.expiresAt, now),
      ne(blockadeTable.status, "levantado"),
      ne(blockadeTable.source, "manual"),
    ))
    .returning({ id: blockadeTable.id });
  total += r1.length;

  // 2. news_rss sin expirar aún pero más viejos que 12h
  const rssAge = new Date(now.getTime() - TTL_MS.news_rss);
  const r2 = await db.update(blockadeTable)
    .set({ status: "levantado", updatedAt: now })
    .where(and(
      eq(blockadeTable.source, "news_rss"),
      ne(blockadeTable.status, "levantado"),
      lt(blockadeTable.createdAt, rssAge),
    ))
    .returning({ id: blockadeTable.id });
  total += r2.length;

  // 3. news_import más viejos que 24h
  const importAge = new Date(now.getTime() - TTL_MS.news_import);
  const r3 = await db.update(blockadeTable)
    .set({ status: "levantado", updatedAt: now })
    .where(and(
      eq(blockadeTable.source, "news_import"),
      ne(blockadeTable.status, "levantado"),
      lt(blockadeTable.createdAt, importAge),
    ))
    .returning({ id: blockadeTable.id });
  total += r3.length;

  // 4. manual más viejos que 7 días (limpieza automática)
  const manualAge = new Date(now.getTime() - TTL_MS.manual);
  const r4 = await db.update(blockadeTable)
    .set({ status: "levantado", updatedAt: now })
    .where(and(
      eq(blockadeTable.source, "manual"),
      ne(blockadeTable.status, "levantado"),
      lt(blockadeTable.createdAt, manualAge),
    ))
    .returning({ id: blockadeTable.id });
  total += r4.length;

  return total;
}

/* Elimina registros ya 'levantado' con más de 30 días para no acumular basura */
async function runBlockadeCleanup(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await db.delete(blockadeTable)
    .where(and(
      eq(blockadeTable.status, "levantado"),
      lt(blockadeTable.createdAt, cutoff),
    ))
    .returning({ id: blockadeTable.id });
  return result.length;
}

export function startBlockadeAutoExpiry(): void {
  const CHECK_MS = 60 * 60 * 1000; // cada hora

  const tick = async () => {
    const expired = await runBlockadeExpiry().catch(() => 0);
    const deleted = await runBlockadeCleanup().catch(() => 0);
    if (expired > 0) console.log(`[AutoExpiry] ${expired} bloqueo(s) → 'levantado'`);
    if (deleted > 0) console.log(`[AutoExpiry] ${deleted} registro(s) antiguos eliminados`);
  };

  // Primera ejecución al arrancar (sin delay, limpia de inmediato)
  tick();
  setInterval(tick, CHECK_MS);
  console.log("[AutoExpiry] Expiración automática activada — TTL: RSS=12h, Import=24h, Manual=7d.");
}

/* GET /api/blockades?corridorId=bog-med
   Solo devuelve bloqueos ACTIVOS (no 'levantado') de los últimos 7 días.
   Esto evita que el mapa muestre incidentes ya extintos. */
router.get("/blockades", async (req, res) => {
  try {
    const { corridorId } = req.query as { corridorId?: string };
    const maxAge = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const base = and(
      ne(blockadeTable.status, "levantado"),
      gt(blockadeTable.createdAt, maxAge), // createdAt > 7 días atrás
    );
    const filter = corridorId
      ? and(base, eq(blockadeTable.corridorId, corridorId))
      : base;
    const rows = await db.select().from(blockadeTable)
      .where(filter)
      .orderBy(desc(blockadeTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("GET /api/blockades error:", err);
    res.status(500).json({ error: "Error fetching blockades" });
  }
});

/* POST /api/blockades */
router.post("/blockades", async (req, res) => {
  try {
    const { data, error } = validateBody(req.body);
    if (error) return res.status(400).json({ error });

    /* Geocode the location so the route map can place the marker precisely */
    const coords = await geocode(data.location, data.department).catch(() => null);

    const [inserted] = await db.insert(blockadeTable).values({
      corridorId:    data.corridorId,
      department:    data.department,
      date:          data.date,
      cause:         (data.cause ?? "comunidad") as BlockadeCause,
      location:      data.location,
      durationHours: data.durationHours ?? null,
      status:        (data.status ?? "activo") as BlockadeStatus,
      notes:         data.notes ?? null,
      reporter:      data.reporter ?? null,
      lat:           coords?.lat ?? null,
      lng:           coords?.lng ?? null,
      source:        "manual",
      sourceUrl:     null,
      expiresAt:     null,
    }).returning();
    res.status(201).json(inserted);
  } catch (err) {
    console.error("POST /api/blockades error:", err);
    res.status(500).json({ error: "Error creating blockade" });
  }
});

/* PATCH /api/blockades/:id/status */
router.patch("/blockades/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const status = req.body?.status;
    if (!status || !VALID_STATUS.includes(status)) return res.status(400).json({ error: "Invalid status" });
    const [updated] = await db
      .update(blockadeTable)
      .set({ status: status as BlockadeStatus, updatedAt: new Date() })
      .where(eq(blockadeTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Blockade not found" });
    res.json(updated);
  } catch (err) {
    console.error("PATCH /api/blockades/:id/status error:", err);
    res.status(500).json({ error: "Error updating blockade" });
  }
});

/* POST /api/blockades/from-url — IA extrae bloqueos de una URL de noticias */
router.post("/blockades/from-url", async (req, res) => {
  if (!aiAvailable) {
    return res.status(503).json({ error: "La función de análisis con IA no está disponible. Configure GEMINI_API_KEY (gratuito) en el servidor." });
  }
  try {
    const { url } = req.body;
    if (!url?.trim()) return res.status(400).json({ error: "URL requerida" });

    let html: string;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-CO,es;q=0.9",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return res.status(400).json({ error: `No se pudo acceder a la URL (HTTP ${response.status})` });
      html = await response.text();
    } catch (e: any) {
      return res.status(400).json({ error: `Error al conectar con la URL: ${e.message}` });
    }

    const root = parseHtml(html);
    root.querySelectorAll("script,style,nav,footer,header,aside,iframe,noscript").forEach(el => el.remove());
    const text = root.textContent.replace(/\s{2,}/g, " ").trim().slice(0, 9000);
    if (text.length < 80) return res.status(400).json({ error: "La página no contiene texto suficiente para analizar" });

    const today = new Date().toISOString().split("T")[0];
    const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();

    const aiText = await askAI(`Eres un analista de seguridad vial de Colombia. Analiza este texto de una noticia o reporte y extrae TODOS los bloqueos viales, cierres de carretera, paros armados, o novedades que afecten la movilidad en Colombia.

TEXTO FUENTE (${hostname}):
${text}

REGLA CRÍTICA para el campo "department":
- Identifica el DEPARTAMENTO donde FÍSICAMENTE ocurre el bloqueo.
- Usa el municipio o kilómetro mencionado para determinar el departamento real.
- NO uses el departamento del destino de la ruta ni el de la ciudad capital de la empresa.
- Ejemplos correctos: si el bloqueo es en Oiba → "Santander". Si es en La Paila → "Valle del Cauca". Si es en La Pintada → "Antioquia".
- Municipios y sus departamentos: Oiba→Santander, Chaparral→Tolima, Florencia→Caquetá, Mocoa→Putumayo, Popayán→Cauca, Neiva→Huila, Palmira→Valle del Cauca, La Dorada→Caldas, Honda→Tolima, Ciénaga→Magdalena, Aguachica→Cesar, Ocaña→Norte de Santander, Tibú→Norte de Santander, El Bagre→Antioquia, Turbo→Antioquia, Rionegro→Antioquia, Quibdó→Chocó, Buenaventura→Valle del Cauca.
- Si el texto solo menciona una vía (ej. "vía Bogotá-Medellín") sin municipio específico, usa "Antioquia" o "Cundinamarca" según el kilómetro.

Responde SOLO con un JSON array. Si no hay bloqueos, responde []. Cada objeto debe tener EXACTAMENTE estos campos:
- "corridorId": uno de ["bog-med","bog-cal","bog-baq","med-bar","cal-bar","bog-vil","bog-cuc","med-eje","bog-tun","cal-pop","otro"]
- "department": departamento colombiano donde ocurre FÍSICAMENTE el bloqueo (ver REGLA CRÍTICA arriba)
- "municipality": nombre del municipio específico donde ocurre el bloqueo (ej: "Oiba", "La Paila", "El Bagre")
- "date": fecha YYYY-MM-DD (usa ${today} si no se menciona)
- "location": ubicación específica (ej: "Km 54 vía Bogotá-Medellín sector La Quiebra" o "Casco urbano Oiba")
- "cause": uno de ["comunidad","protesta_social","paro_camionero","grupos_ilegales","otro"]
- "status": uno de ["activo","levantado","intermitente"]
- "notes": resumen del incidente máx 180 caracteres
- "newsTitle": título o resumen de la fuente

Responde SOLO con el JSON array, sin texto adicional antes ni después.`);
    let blockades: any[] = [];
    try {
      const m = aiText.match(/\[[\s\S]*\]/);
      blockades = m ? JSON.parse(m[0]) : [];
    } catch {
      return res.status(500).json({ error: "La IA no devolvió JSON válido", raw: aiText.slice(0, 300) });
    }

    if (!Array.isArray(blockades) || blockades.length === 0) {
      return res.json({ inserted: [], message: "No se identificaron bloqueos viales en el contenido analizado" });
    }

    /* Geocode each blockade via Nominatim (parallelized, best-effort) */
    const geocodeResults = await Promise.all(
      blockades.map(b => {
        const loc = b.municipality ?? b.location ?? "";
        const dept = b.department ?? "";
        return geocode(loc, dept).catch(() => null);
      })
    );

    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h expiry for news imports
    const toInsert = blockades.map((b, i) => ({
      corridorId:    (typeof b.corridorId === "string" && b.corridorId.trim()) ? b.corridorId.trim() : "otro",
      department:    (typeof b.department === "string" && b.department.trim()) ? b.department.trim() : "Colombia",
      date:          (typeof b.date === "string" && b.date.trim()) ? b.date.trim() : today,
      cause:         (VALID_CAUSES.includes(b.cause) ? b.cause : "otro") as BlockadeCause,
      location:      (typeof b.location === "string" && b.location.trim()) ? b.location.trim() : "Ubicación no especificada",
      status:        (VALID_STATUS.includes(b.status) ? b.status : "activo") as BlockadeStatus,
      notes:         `[${b.newsTitle || "Noticia"}] ${b.notes || ""}`.slice(0, 280),
      reporter:      `IA — ${hostname}`,
      durationHours: null as number | null,
      lat:           geocodeResults[i]?.lat ?? null,
      lng:           geocodeResults[i]?.lng ?? null,
      source:        "news_import" as string,
      sourceUrl:     url as string,
      expiresAt,
    }));

    const inserted = await db.insert(blockadeTable).values(toInsert).returning();
    return res.status(201).json({ inserted, message: `${inserted.length} bloqueo(s) importado(s) desde ${hostname}` });

  } catch (err: any) {
    console.error("POST /api/blockades/from-url error:", err);
    return res.status(500).json({ error: err.message || "Error procesando la URL" });
  }
});

/* POST /api/analyze/pdf — IA analiza documento gubernamental (text o base64) */
router.post("/analyze/pdf", async (req, res) => {
  if (!aiAvailable) {
    return res.status(503).json({ error: "La función de análisis con IA no está disponible. Configure GEMINI_API_KEY (gratuito) en el servidor." });
  }
  try {
    let text: string = req.body?.text ?? "";

    /* If caller sends raw base64 PDF, extract text server-side with pdf-parse v2.
       v2 API: new PDFParse({ data: Buffer }) — then call .getText()             */
    if (!text && req.body?.pdfBase64) {
      try {
        const buf = Buffer.from(req.body.pdfBase64, "base64");
        if (buf.length > 20_000_000) {
          return res.status(400).json({ error: "El PDF es demasiado grande (máx 20 MB). Redúzcalo antes de enviarlo." });
        }
        const parser = new PDFParse({ data: buf });
        const parsed = await parser.getText({ first: 1, last: 50 });
        text = parsed.text ?? "";
      } catch (parseErr: any) {
        return res.status(400).json({ error: `No se pudo extraer texto del PDF: ${parseErr.message}` });
      }
    }

    if (!text?.trim() || text.trim().length < 100) return res.status(400).json({ error: "Texto del documento muy corto o vacío" });

    const aiText = await askAI(`Eres un analista senior de inteligencia de seguridad corporativa para Colombia. Analiza el siguiente documento gubernamental o de fuente oficial y genera un resumen de inteligencia en estilo "Apreciación de Situación" para una empresa de logística y transporte terrestre de carga colombiana.

DOCUMENTO:
${text.slice(0, 14000)}

Responde SOLO con un JSON con la siguiente estructura (todos los campos en español formal):
{
  "titulo": "Título o tipo del documento",
  "fuente": "Institución emisora",
  "fechaDocumento": "Fecha del documento o null",
  "clasificacion": "Nivel de clasificación si aparece, o null",
  "resumen": "Párrafo de 4-6 oraciones que describe el contenido y su relevancia para logística y transporte",
  "hallazgos": ["Hallazgo clave 1 para operaciones logísticas","Hallazgo 2","Hallazgo 3"],
  "amenazasIdentificadas": ["Amenaza/riesgo 1","Amenaza/riesgo 2"],
  "departamentosAfectados": ["Departamento1","Departamento2"],
  "riesgoLogistico": "ALTO" o "MEDIO" o "BAJO",
  "recomendacionOperacional": "Párrafo de recomendación específica para operaciones de transporte de carga"
}

Responde SOLO con el JSON, sin texto antes ni después.`);
    let analysis: any = {};
    try {
      const m = aiText.match(/\{[\s\S]*\}/);
      analysis = m ? JSON.parse(m[0]) : {};
    } catch {
      return res.status(500).json({ error: "Error al parsear respuesta de la IA", raw: aiText.slice(0, 300) });
    }

    return res.json(analysis);
  } catch (err: any) {
    console.error("POST /api/analyze/pdf error:", err);
    return res.status(500).json({ error: err.message || "Error analizando el documento" });
  }
});

/* PATCH /api/blockades/:id/regeocode — re-geocode an existing blockade to fix its map position */
router.patch("/blockades/:id/regeocode", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [existing] = await db.select().from(blockadeTable).where(eq(blockadeTable.id, id));
    if (!existing) return res.status(404).json({ error: "Blockade not found" });

    const coords = await geocode(existing.location, existing.department ?? "").catch(() => null);
    if (!coords) return res.status(422).json({ error: "No se pudo geocodificar la ubicación. Verifique que la ubicación sea un nombre de municipio válido de Colombia." });

    const [updated] = await db
      .update(blockadeTable)
      .set({ lat: coords.lat, lng: coords.lng, updatedAt: new Date() })
      .where(eq(blockadeTable.id, id))
      .returning();
    res.json({ ...updated, regeocoded: true, coords });
  } catch (err) {
    console.error("PATCH /api/blockades/:id/regeocode error:", err);
    res.status(500).json({ error: "Error al recalcular coordenadas" });
  }
});

/* DELETE /api/blockades/:id */
router.delete("/blockades/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [deleted] = await db
      .delete(blockadeTable)
      .where(eq(blockadeTable.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Blockade not found" });
    res.json({ success: true, id: deleted.id });
  } catch (err) {
    console.error("DELETE /api/blockades/:id error:", err);
    res.status(500).json({ error: "Error deleting blockade" });
  }
});

export default router;
