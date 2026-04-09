import { Router, type IRouter } from "express";
import Imap from "imap-simple";
import { simpleParser } from "mailparser";
import { Readable } from "stream";
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
  const mod = await import("pdf-parse");
  const pdfParse: any = mod.default ?? mod;
  const data = await pdfParse(buffer);
  return data.text ?? "";
}

/* ── Extraer datos estructurados del DITRA con IA ──────────────────────── */
async function extractDitraData(
  pdfText: string,
  subject: string,
  emailBodyText: string = "",
): Promise<Record<string, any>> {

  // Construir el contenido a analizar: PDF + cuerpo del correo como fuentes
  const pdfAvailable = pdfText.trim().length > 50 &&
    !pdfText.includes("No se pudo leer el texto del PDF");

  const contenidoPDF = pdfAvailable
    ? `Texto extraído del PDF:\n${pdfText.slice(0, 6000)}`
    : "(El PDF no pudo extraerse como texto — es posible que sea un archivo escaneado o de imagen)";

  const contenidoBody = emailBodyText.trim().length > 30
    ? `\n\nCuerpo del correo electrónico:\n${emailBodyText.slice(0, 4000)}`
    : "";

  const prompt = `Eres un analista de seguridad vial de Colombia. Analiza la siguiente información de un correo DITRA/RISTRA/INVIAS (Estado de Vías) y extrae toda la información relevante de movilidad y seguridad vial.

IMPORTANTE:
- Extrae TODO lo que encuentres: obras, cierres, manifestaciones, condiciones climáticas, accidentes, restricciones. No solo accidentes.
- Si el PDF no tiene texto, usa el cuerpo del correo y el asunto como fuente.
- El asunto puede indicar el tipo de reporte: "MANIFESTACIONES Y CONDICION CLIMATICA", "ESTADO DE VIAS", etc.
- Si el asunto tiene una fecha (ej. "09-04-2026"), úsala como fecha_reporte.

Asunto del correo: ${subject}

${contenidoPDF}${contenidoBody}

Responde SOLO con un JSON válido (sin texto adicional, sin markdown):
{
  "fecha_reporte": "fecha en formato YYYY-MM-DD o vacío si no se encuentra",
  "periodo": "período que cubre el reporte o descripción del tipo",
  "tipo_reporte": "DITRA | RISTRA | INVIAS | Estado de Vías | Manifestaciones | Condición Climática | otro",
  "total_accidentes": 0,
  "total_muertos": 0,
  "total_heridos": 0,
  "total_cierres": 0,
  "total_obras": 0,
  "departamentos_afectados": [],
  "vias_afectadas": [],
  "puntos_criticos": [
    {
      "ubicacion": "nombre del punto o municipio",
      "departamento": "departamento",
      "via": "nombre de la vía o ruta",
      "tipo_evento": "accidente | cierre | obra | derrumbe | manifestacion | restriccion | condicion_climatica | otro",
      "descripcion": "descripción breve del evento o novedad"
    }
  ],
  "condiciones_climaticas": "descripción de alertas o condiciones climáticas si aplica, o vacío",
  "manifestaciones": "descripción de manifestaciones o paros si aplica, o vacío",
  "resumen_ejecutivo": "resumen ejecutivo de 2-3 oraciones. Si no hay datos en PDF, indicar que es un reporte de tipo [tipo] recibido el [fecha del asunto]",
  "fuente": "entidad o área que generó el reporte",
  "pdf_legible": ${pdfAvailable}
}`;

  try {
    const raw = await askAI(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.warn("[DitraMonitor] Error parseando respuesta IA:", e);
  }
  return {
    resumen_ejecutivo: emailBodyText.slice(0, 300) || pdfText.slice(0, 300) || "Reporte recibido sin contenido legible.",
    raw_extraction_failed: true,
    pdf_legible: false,
  };
}

/* ── Escaneo IMAP ───────────────────────────────────────────────────────── */
async function scanInbox(searchAll = false): Promise<number> {
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

    // Busca correos (no leídos en modo normal, todos en modo rescan) de los últimos 30 días
    const since = new Date();
    since.setDate(since.getDate() - (searchAll ? 30 : 30));
    const sinceStr = since.toISOString().split("T")[0];

    const searchCriteria = searchAll
      ? [["SINCE", sinceStr]]
      : ["UNSEEN", ["SINCE", sinceStr]];
    const fetchOptions   = { bodies: ["HEADER", ""], markSeen: false };
    console.log(`[DitraMonitor] Modo: ${searchAll ? "ALL (rescan)" : "UNSEEN"} desde ${sinceStr}`);

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

        // Capturar cuerpo del correo (texto plano o HTML limpio) como respaldo al PDF
        const emailBodyText = parsed.text?.trim() ??
          parsed.html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";

        // Buscar PDFs también en adjuntos de correos reenviados (message/rfc822)
        const allAttachments = parsed.attachments ?? [];
        const nestedPdfs: any[] = [];
        for (const a of allAttachments) {
          if (a.contentType === "message/rfc822" && a.content) {
            try {
              const innerParsed = await simpleParser(
                Buffer.isBuffer(a.content) ? Readable.from(a.content) : Readable.from(Buffer.from(a.content as string))
              );
              const innerPdfs = (innerParsed.attachments ?? []).filter(
                (ia: any) => ia.contentType === "application/pdf" ||
                              (ia.filename ?? "").toLowerCase().endsWith(".pdf")
              );
              nestedPdfs.push(...innerPdfs);
              if (!emailBodyText && (innerParsed.text || innerParsed.html)) {
                const innerBody = innerParsed.text?.trim() ??
                  innerParsed.html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
                if (innerBody) (parsed as any)._innerBody = innerBody;
              }
            } catch { /* nested parse failed */ }
          }
        }

        // Filtra solo correos con PDF adjunto (directo o dentro de reenvío)
        const pdfAttachments = [
          ...allAttachments.filter(
            (a: any) => a.contentType === "application/pdf" ||
                        (a.filename ?? "").toLowerCase().endsWith(".pdf")
          ),
          ...nestedPdfs,
        ];

        if (pdfAttachments.length === 0) {
          console.log(`[DitraMonitor] Correo sin PDF (${subject}) — ignorado`);
          continue;
        }

        console.log(`[DitraMonitor] Procesando: "${subject}" — ${pdfAttachments.length} PDF(s), body: ${emailBodyText.length} chars`);

        for (const att of pdfAttachments) {
          const pdfBuffer = att.content as Buffer;
          const filename  = att.filename ?? `ditra_${Date.now()}.pdf`;

          // Verificar si ya procesamos este archivo (por nombre + fecha)
          const existing = await pool.query(
            "SELECT id, raw_text, parsed_data FROM ditra_reports WHERE email_subject = $1 AND pdf_filename = $2 AND email_date::date = $3::date",
            [subject, filename, date.toISOString()]
          );
          const existingRow = existing.rows[0];
          if (existingRow) {
            // Considerar "malo" si: sin texto, error de PDF, o el resumen dice que no hay información
            const rawBad = !existingRow.raw_text || existingRow.raw_text.includes("No se pudo leer");
            let parsedBad = false;
            try {
              const pd = typeof existingRow.parsed_data === "string"
                ? JSON.parse(existingRow.parsed_data) : existingRow.parsed_data;
              parsedBad = !!(pd?.raw_extraction_failed || pd?.pdf_legible === false);
            } catch {}
            if (!rawBad && !parsedBad) {
              console.log(`[DitraMonitor] Ya procesado: ${filename} — omitido`);
              continue;
            }
            // Reintentar: eliminar registro fallido
            console.log(`[DitraMonitor] Reprocesando ${filename} (registro anterior incompleto)`);
            await pool.query("DELETE FROM ditra_reports WHERE id = $1", [existingRow.id]);
          }

          // Extraer texto del PDF
          let pdfText = "";
          try {
            if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 10) throw new Error("Buffer inválido o vacío");
            pdfText = await pdfToText(pdfBuffer);
            console.log(`[DitraMonitor] PDF "${filename}": ${pdfBuffer.length} bytes → ${pdfText.length} chars texto`);
          } catch (e) {
            console.warn(`[DitraMonitor] Error leyendo PDF ${filename} (${(pdfBuffer as any)?.length ?? 0} bytes):`, (e as Error).message);
            pdfText = "";
          }

          // Fuente de texto para IA: PDF + cuerpo del email
          const bodyFallback = emailBodyText || (parsed as any)._innerBody || "";

          // Extraer datos estructurados con IA
          let parsedData: Record<string, any> = {};
          try {
            parsedData = await extractDitraData(pdfText, subject, bodyFallback);
          } catch (e) {
            console.warn(`[DitraMonitor] Error IA para ${filename}:`, e);
            parsedData = {
              resumen_ejecutivo: `Reporte recibido: ${subject}. PDF de ${(pdfBuffer as any)?.length ?? 0} bytes (no legible como texto).`,
              pdf_legible: false,
              raw_extraction_failed: true,
            };
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

/* POST /api/ditra-monitor/scan — escaneo manual (busca TODOS los correos, no solo no leídos) */
router.post("/ditra-monitor/scan", async (_req, res) => {
  if (state.running) return res.json({ message: "Escaneo ya en progreso", running: true });
  res.json({ message: "Escaneo iniciado (modo rescan: todos los correos de los últimos 30 días)", nextRun: state.nextRun });
  // ejecutar en background con searchAll=true para reprocesar PDFs fallidos
  (async () => {
    state.running = true;
    state.lastRun = new Date();
    try {
      const n = await scanInbox(true);
      console.log(`[DitraMonitor] Escaneo manual completo: ${n} reporte(s) nuevos o reprocesados`);
    } catch (err: any) {
      console.error("[DitraMonitor] Error escaneo manual:", err?.message);
      state.errors = [err?.message, ...state.errors.slice(0, 4)];
    } finally {
      state.running = false;
    }
  })();
});

export default router;
