import { Router, type IRouter } from "express";
import Imap from "imap-simple";
import { simpleParser } from "mailparser";
import { Readable } from "stream";
import { PDFParse } from "pdf-parse";
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import { pool } from "@workspace/db";

const router: IRouter = Router();

/* ── AI setup (mismo patrón que blockades/telegram) ────────────────────── */
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
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  }
  if (_groq) {
    const c = await _groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
    });
    return c.choices[0]?.message?.content ?? "{}";
  }
  throw new Error("No AI backend available");
}

/* ── Estado del monitor ─────────────────────────────────────────────────── */
interface MonitorState {
  lastRun:      Date | null;
  nextRun:      Date | null;
  running:      boolean;
  errors:       string[];
  totalScanned: number;
  totalInserted:number;
}

const state: MonitorState = {
  lastRun:       null,
  nextRun:       null,
  running:       false,
  errors:        [],
  totalScanned:  0,
  totalInserted: 0,
};

/* ── Parsear PDF a texto ────────────────────────────────────────────────── */
async function pdfToText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text ?? "";
}

/* ── Extraer datos estructurados del DITRA con IA ──────────────────────── */
async function extractDitraData(pdfText: string, subject: string): Promise<Record<string, any>> {
  const prompt = `Eres un analista de seguridad vial de Colombia. Analiza este reporte DITRA/RISTRA del INVIAS y extrae la información estructurada.

Asunto del correo: ${subject}

Texto del PDF:
${pdfText.slice(0, 8000)}

Extrae y responde SOLO con un JSON con estos campos (deja vacío "" o 0 si no encuentras el dato):
{
  "fecha_reporte": "fecha del reporte en formato YYYY-MM-DD",
  "periodo": "descripción del período que cubre (ej: Semana 15 del 7 al 13 de abril de 2025)",
  "tipo_reporte": "DITRA o RISTRA u otro",
  "total_accidentes": número total de accidentes registrados,
  "total_muertos": número total de muertos,
  "total_heridos": número total de heridos,
  "departamentos_afectados": ["lista", "de", "departamentos"],
  "vias_afectadas": ["lista de vías principales mencionadas"],
  "puntos_criticos": [
    {
      "ubicacion": "nombre del lugar",
      "departamento": "departamento",
      "via": "nombre de la vía",
      "tipo_evento": "accidente|derrumbe|cierre|otro",
      "descripcion": "breve descripción"
    }
  ],
  "resumen_ejecutivo": "resumen en 2-3 oraciones de lo más relevante del reporte",
  "fuente": "entidad que generó el reporte"
}`;

  try {
    const raw = await askAI(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.warn("[DitraMonitor] Error parseando respuesta IA:", e);
  }
  return { resumen_ejecutivo: pdfText.slice(0, 500), raw_extraction_failed: true };
}

/* ── Escaneo IMAP ───────────────────────────────────────────────────────── */
async function scanInbox(): Promise<number> {
  const email    = process.env.DITRA_EMAIL;
  const password = process.env.DITRA_APP_PASSWORD;

  if (!email || !password) {
    throw new Error("DITRA_EMAIL o DITRA_APP_PASSWORD no configurados");
  }

  const config = {
    imap: {
      user:     email,
      password: password,
      host:     "imap.gmail.com",
      port:     993,
      tls:      true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
    },
  };

  let inserted = 0;
  const connection = await Imap.connect(config);

  try {
    await connection.openBox("INBOX");

    // Busca correos no leídos de los últimos 30 días
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().split("T")[0];

    const searchCriteria = ["UNSEEN", ["SINCE", sinceStr]];
    const fetchOptions   = { bodies: ["HEADER", ""], markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);
    state.totalScanned += messages.length;
    console.log(`[DitraMonitor] ${messages.length} correo(s) no leídos encontrados`);

    for (const msg of messages) {
      try {
        const all   = msg.parts.find((p: any) => p.which === "");
        if (!all) continue;

        const raw    = Buffer.isBuffer(all.body) ? all.body : Buffer.from(all.body as string);
        const parsed = await simpleParser(Readable.from(raw));

        const subject = parsed.subject ?? "";
        const from    = parsed.from?.text ?? "";
        const date    = parsed.date ?? new Date();

        // Filtra solo correos con PDF adjunto
        const pdfAttachments = (parsed.attachments ?? []).filter(
          (a: any) => a.contentType === "application/pdf" ||
                      (a.filename ?? "").toLowerCase().endsWith(".pdf")
        );

        if (pdfAttachments.length === 0) {
          console.log(`[DitraMonitor] Correo sin PDF (${subject}) — ignorado`);
          continue;
        }

        console.log(`[DitraMonitor] Procesando: "${subject}" — ${pdfAttachments.length} PDF(s)`);

        for (const att of pdfAttachments) {
          const pdfBuffer = att.content as Buffer;
          const filename  = att.filename ?? `ditra_${Date.now()}.pdf`;

          // Verificar si ya procesamos este archivo (por nombre + fecha)
          const existing = await pool.query(
            "SELECT id FROM ditra_reports WHERE email_subject = $1 AND pdf_filename = $2 AND email_date::date = $3::date",
            [subject, filename, date.toISOString()]
          );
          if (existing.rows.length > 0) {
            console.log(`[DitraMonitor] Ya procesado: ${filename} — omitido`);
            continue;
          }

          // Extraer texto del PDF
          let pdfText = "";
          try {
            pdfText = await pdfToText(pdfBuffer);
          } catch (e) {
            console.warn(`[DitraMonitor] Error leyendo PDF ${filename}:`, e);
            pdfText = "(No se pudo leer el texto del PDF)";
          }

          // Extraer datos estructurados con IA
          let parsedData: Record<string, any> = {};
          try {
            parsedData = await extractDitraData(pdfText, subject);
          } catch (e) {
            console.warn(`[DitraMonitor] Error IA para ${filename}:`, e);
            parsedData = { error: "No se pudo procesar con IA", raw_text_preview: pdfText.slice(0, 500) };
          }

          // Guardar en BD
          await pool.query(
            `INSERT INTO ditra_reports
               (email_subject, email_from, email_date, pdf_filename,
                raw_text, parsed_data, periodo, fecha_reporte, tipo_reporte,
                total_accidentes, total_muertos, total_heridos,
                resumen_ejecutivo, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
            [
              subject,
              from,
              date.toISOString(),
              filename,
              pdfText.slice(0, 50000),
              JSON.stringify(parsedData),
              parsedData.periodo        ?? null,
              parsedData.fecha_reporte  ?? null,
              parsedData.tipo_reporte   ?? "DITRA",
              parsedData.total_accidentes ?? 0,
              parsedData.total_muertos    ?? 0,
              parsedData.total_heridos    ?? 0,
              parsedData.resumen_ejecutivo ?? null,
            ]
          );

          inserted++;
          console.log(`[DitraMonitor] ✅ Reporte guardado: ${filename} — ${parsedData.total_accidentes ?? 0} accidentes`);
        }

        // Marcar correo como leído después de procesar
        if (pdfAttachments.length > 0 && inserted > 0) {
          const uid = (msg as any).attributes?.uid;
          if (uid) {
            await connection.addFlags(uid, ["\\Seen"]);
          }
        }
      } catch (err: any) {
        console.error("[DitraMonitor] Error procesando mensaje:", err?.message);
        state.errors.push(err?.message ?? String(err));
      }
    }
  } finally {
    connection.end();
  }

  state.totalInserted += inserted;
  return inserted;
}

/* ── Monitor periódico ──────────────────────────────────────────────────── */
export function startDitraMonitor(): void {
  const INTERVAL_MS = 15 * 60 * 1000; // cada 15 minutos

  const tick = async () => {
    if (state.running) return;
    state.running = true;
    state.lastRun = new Date();
    state.nextRun = new Date(Date.now() + INTERVAL_MS);

    try {
      const n = await scanInbox();
      if (n > 0) console.log(`[DitraMonitor] ${n} reporte(s) DITRA procesado(s)`);
      else        console.log("[DitraMonitor] Sin reportes nuevos.");
    } catch (err: any) {
      console.error("[DitraMonitor] Error en escaneo:", err?.message);
      state.errors = [err?.message ?? String(err), ...state.errors.slice(0, 4)];
    } finally {
      state.running = false;
    }
  };

  // Primera ejecución al arrancar
  tick();
  setInterval(tick, INTERVAL_MS);
  console.log("[DitraMonitor] Monitor DITRA activado — revisa ditra.safenode@gmail.com cada 15 min.");
}

/* ── API Endpoints ──────────────────────────────────────────────────────── */

/* GET /api/ditra-reports — lista los últimos reportes */
router.get("/ditra-reports", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email_subject, email_from, email_date, pdf_filename,
              periodo, fecha_reporte, tipo_reporte,
              total_accidentes, total_muertos, total_heridos,
              resumen_ejecutivo, created_at
       FROM ditra_reports
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/ditra-reports error:", err);
    res.status(500).json({ error: "Error fetching DITRA reports" });
  }
});

/* GET /api/ditra-reports/:id — reporte completo con datos IA */
router.get("/ditra-reports/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM ditra_reports WHERE id = $1",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Reporte no encontrado" });
    const report = rows[0];
    if (typeof report.parsed_data === "string") {
      try { report.parsed_data = JSON.parse(report.parsed_data); } catch {}
    }
    res.json(report);
  } catch (err) {
    console.error("GET /api/ditra-reports/:id error:", err);
    res.status(500).json({ error: "Error fetching report" });
  }
});

/* GET /api/ditra-monitor/status */
router.get("/ditra-monitor/status", (_req, res) => {
  res.json({
    lastRun:       state.lastRun,
    nextRun:       state.nextRun,
    running:       state.running,
    errors:        state.errors.slice(0, 5),
    totalScanned:  state.totalScanned,
    totalInserted: state.totalInserted,
    inbox:         process.env.DITRA_EMAIL ?? "(no configurado)",
    configured:    !!(process.env.DITRA_EMAIL && process.env.DITRA_APP_PASSWORD),
  });
});

/* POST /api/ditra-monitor/scan — escaneo manual */
router.post("/ditra-monitor/scan", async (_req, res) => {
  if (state.running) return res.json({ message: "Escaneo ya en progreso", running: true });
  res.json({ message: "Escaneo iniciado", nextRun: state.nextRun });
  // ejecutar en background
  (async () => {
    state.running = true;
    state.lastRun = new Date();
    try {
      const n = await scanInbox();
      console.log(`[DitraMonitor] Escaneo manual: ${n} reporte(s)`);
    } catch (err: any) {
      console.error("[DitraMonitor] Error escaneo manual:", err?.message);
      state.errors = [err?.message, ...state.errors.slice(0, 4)];
    } finally {
      state.running = false;
    }
  })();
});

export default router;
