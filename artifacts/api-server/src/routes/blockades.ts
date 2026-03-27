import { Router, type IRouter } from "express";
import { db, blockadeTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { parse as parseHtml } from "node-html-parser";

/* Anthropic client — uses Replit AI proxy in dev, real key in production */
function buildAnthropicClient() {
  if (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL) {
    // Replit dev environment: proxy handles auth
    return new Anthropic({
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "_DUMMY_",
    });
  }
  // Production: requires a real ANTHROPIC_API_KEY env var
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.warn("[blockades] ANTHROPIC_API_KEY not set — AI features will return 503");
  }
  return new Anthropic({ apiKey: key ?? "" });
}
const anthropic = buildAnthropicClient();
const aiAvailable = !!(process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || process.env.ANTHROPIC_API_KEY);

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

/* GET /api/blockades?corridorId=bog-med */
router.get("/blockades", async (req, res) => {
  try {
    const { corridorId } = req.query as { corridorId?: string };
    const rows = corridorId
      ? await db.select().from(blockadeTable).where(eq(blockadeTable.corridorId, corridorId)).orderBy(desc(blockadeTable.createdAt))
      : await db.select().from(blockadeTable).orderBy(desc(blockadeTable.createdAt));
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
    return res.status(503).json({ error: "La función de análisis con IA no está disponible en este servidor. Configure ANTHROPIC_API_KEY para habilitarla." });
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

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Eres un analista de seguridad vial de Colombia. Analiza este texto de una noticia o reporte y extrae TODOS los bloqueos viales, cierres de carretera, paros armados, o novedades que afecten la movilidad en Colombia.

TEXTO FUENTE (${hostname}):
${text}

Responde SOLO con un JSON array. Si no hay bloqueos, responde []. Cada objeto debe tener EXACTAMENTE estos campos:
- "corridorId": uno de ["bog-med","bog-cal","bog-baq","med-bar","cal-bar","bog-vil","bog-cuc","med-eje","bog-tun","cal-pop","otro"]
- "department": nombre del departamento colombiano (ej: "Antioquia", "Cundinamarca")
- "date": fecha YYYY-MM-DD (usa ${today} si no se menciona)
- "location": ubicación específica (ej: "Km 54 vía Bogotá-Medellín, sector La Quiebra")
- "cause": uno de ["comunidad","protesta_social","paro_camionero","grupos_ilegales","otro"]
- "status": uno de ["activo","levantado","intermitente"]
- "notes": resumen del incidente máx 180 caracteres
- "newsTitle": título o resumen de la fuente

Responde SOLO con el JSON array, sin texto adicional antes ni después.`,
      }],
    });

    const aiText = message.content[0]?.type === "text" ? message.content[0].text : "[]";
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

    const toInsert = blockades.map(b => ({
      corridorId:    (typeof b.corridorId === "string" && b.corridorId.trim()) ? b.corridorId.trim() : "otro",
      department:    (typeof b.department === "string" && b.department.trim()) ? b.department.trim() : "Colombia",
      date:          (typeof b.date === "string" && b.date.trim()) ? b.date.trim() : today,
      cause:         (VALID_CAUSES.includes(b.cause) ? b.cause : "otro") as BlockadeCause,
      location:      (typeof b.location === "string" && b.location.trim()) ? b.location.trim() : "Ubicación no especificada",
      status:        (VALID_STATUS.includes(b.status) ? b.status : "activo") as BlockadeStatus,
      notes:         `[${b.newsTitle || "Noticia"}] ${b.notes || ""}`.slice(0, 280),
      reporter:      `IA — ${hostname}`,
      durationHours: null as number | null,
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
    return res.status(503).json({ error: "La función de análisis con IA no está disponible en este servidor. Configure ANTHROPIC_API_KEY para habilitarla." });
  }
  try {
    let text: string = req.body?.text ?? "";

    /* If caller sends raw base64 PDF, extract text server-side with pdf-parse */
    if (!text && req.body?.pdfBase64) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = (await import("pdf-parse")).default;
        const buf = Buffer.from(req.body.pdfBase64, "base64");
        const parsed = await pdfParse(buf);
        text = parsed.text;
      } catch (parseErr: any) {
        return res.status(400).json({ error: `No se pudo extraer texto del PDF: ${parseErr.message}` });
      }
    }

    if (!text?.trim() || text.trim().length < 100) return res.status(400).json({ error: "Texto del documento muy corto o vacío" });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: `Eres un analista senior de inteligencia de seguridad corporativa para Colombia. Analiza el siguiente documento gubernamental o de fuente oficial y genera un resumen de inteligencia en estilo "Apreciación de Situación" para una empresa de logística y transporte terrestre de carga colombiana.

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

Responde SOLO con el JSON, sin texto antes ni después.`,
      }],
    });

    const aiText = message.content[0]?.type === "text" ? message.content[0].text : "{}";
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
