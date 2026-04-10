import { Router, type IRouter } from "express";
import Imap from "imap-simple";
import { simpleParser } from "mailparser";
import { Readable } from "stream";
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import { pool } from "@workspace/db";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { createRequire } from "module";

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

  // Intento 1: pdftotext (poppler-utils) — más robusto, maneja AcroForms
  const tmpPdf = join(tmpdir(), `ditra_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  const tmpTxt = tmpPdf.replace(".pdf", ".txt");
  try {
    writeFileSync(tmpPdf, buffer);
    execSync(`pdftotext -layout -enc UTF-8 "${tmpPdf}" "${tmpTxt}"`, { timeout: 15000, stdio: "pipe" });
    const text = readFileSync(tmpTxt, "utf-8").trim();
    console.log(`[DitraMonitor] pdftotext: ${text.length} chars extraídos`);
    if (text.length > 20) return text;
    console.log("[DitraMonitor] pdftotext: texto vacío, probando siguiente método");
  } catch (e) {
    console.warn("[DitraMonitor] pdftotext falló:", (e as Error).message?.slice(0, 100));
  } finally {
    try { unlinkSync(tmpPdf); } catch {}
    try { unlinkSync(tmpTxt); } catch {}
  }

  // Intento 2: pdfjs-dist legacy — worker configurado explícitamente para Node.js
  try {
    const pdfjsMod = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
    const pdfjs = pdfjsMod.default ?? pdfjsMod;

    // Resolver worker path en tiempo de ejecución
    try {
      const _require = createRequire(import.meta.url);
      const workerPath = _require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
    } catch {
      // Si no se puede resolver, probar con el path de Render
      const baseDir = resolve(import.meta.url.replace("file://", "").replace("/dist/index.mjs", ""));
      pdfjs.GlobalWorkerOptions.workerSrc = `file://${baseDir}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`;
    }

    const doc = await (pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }) as any).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((item: any) => item.str ?? "").join(" "));
      try {
        const anns = await page.getAnnotations();
        for (const ann of anns) {
          if (ann.fieldValue && ann.fieldName) parts.push(`${ann.fieldName}: ${ann.fieldValue}`);
        }
      } catch { /* sin annotations */ }
    }

    const text = parts.join("\n").trim();
    console.log(`[DitraMonitor] pdfjs-dist: ${text.length} chars extraídos`);
    if (text.length > 20) return text;
  } catch (e) {
    console.warn("[DitraMonitor] pdfjs-dist falló:", (e as Error).message?.slice(0, 200));
  }

  // Intento 3: pdf-parse v2 con nueva API (PDFParse class)
  try {
    const { PDFParse } = await import("pdf-parse") as any;
    const parser = new PDFParse();
    await parser.load(buffer);
    const text = (await parser.getText() ?? "").trim();
    console.log(`[DitraMonitor] pdf-parse v2: ${text.length} chars extraídos`);
    if (text.length > 20) return text;
  } catch (e) {
    console.warn("[DitraMonitor] pdf-parse v2 falló:", (e as Error).message?.slice(0, 100));
  }

  return "";
}

/* ── JSON schema que la IA debe devolver ────────────────────────────────── */
const JSON_SCHEMA = `{
  "fecha_reporte": "YYYY-MM-DD o vacío",
  "periodo": "período que cubre el reporte",
  "tipo_reporte": "DITRA | RISTRA | INVIAS | Estado de Vías | Manifestaciones | Condición Climática | otro",
  "total_accidentes": 0,
  "total_muertos": 0,
  "total_heridos": 0,
  "total_cierres": 0,
  "total_obras": 0,
  "departamentos_afectados": ["lista"],
  "vias_afectadas": ["lista"],
  "puntos_criticos": [
    {
      "ubicacion": "municipio o punto kilométrico",
      "departamento": "departamento de Colombia",
      "via": "nombre de la vía o ruta",
      "tipo_evento": "accidente|cierre|obra|derrumbe|manifestacion|restriccion|condicion_climatica|otro",
      "descripcion": "descripción breve"
    }
  ],
  "condiciones_climaticas": "descripción o vacío",
  "manifestaciones": "descripción o vacío",
  "resumen_ejecutivo": "2-3 oraciones con las principales novedades",
  "fuente": "entidad que generó el reporte",
  "pdf_legible": true
}`;

const INSTRUCCION_BASE = `Eres un analista experto de seguridad vial y movilidad de Colombia. Extrae y CUENTA todos los eventos del reporte DITRA/RISTRA/INVIAS.

REGLAS ESTRICTAS DE EXTRACCIÓN:
1. CUENTA cada evento individualmente. Si se mencionan 3 cierres en lugares distintos, total_cierres=3.
2. total_cierres = número de cierres TOTALES o PARCIALES de vía (por deslizamiento, manifestación, accidente, obra, derrumbe, etc.)
3. total_obras = número de obras o trabajos viales activos en la vía que generan restricción
4. total_accidentes = número de accidentes de tránsito mencionados
5. total_muertos = número de fallecidos CONFIRMADOS
6. total_heridos = número de heridos CONFIRMADOS
7. puntos_criticos = lista de TODOS los puntos mencionados (cierres, obras, derrumbes, manifestaciones, accidentes, restricciones)
8. Para cada punto_critico incluye: ubicacion exacta (km, sector), departamento, vía, tipo_evento, descripcion breve
9. departamentos_afectados = lista completa de departamentos donde hay eventos
10. vias_afectadas = lista de vías afectadas (rutas nacionales, transversales, etc.)
11. Si el asunto tiene fecha como "09-04-2026", úsala como fecha_reporte en formato YYYY-MM-DD
12. tipo_reporte: "ESTADO DE VIAS"→Estado de Vías, "MANIFESTACIONES"→Manifestaciones, "CONDICION CLIMATICA"→Condición Climática
13. Responde SOLO con JSON válido, sin markdown, sin texto adicional, sin comentarios

IMPORTANTE: Si el texto menciona cierres u obras, total_cierres y total_obras DEBEN ser > 0. No uses los valores por defecto.`;

/* ── Extraer datos con Claude Vision (PDF como documento nativo con OCR) ─── */
async function extractWithClaudeVision(pdfBuffer: Buffer, subject: string, emailBodyText: string): Promise<Record<string, any> | null> {
  if (!_anthropic) {
    console.warn("[DitraMonitor] Claude Vision: no hay cliente Anthropic disponible");
    return null;
  }

  // Limitar tamaño: Anthropic acepta hasta ~5MB base64
  if (pdfBuffer.length > 4_000_000) {
    console.warn(`[DitraMonitor] Claude Vision: PDF muy grande (${pdfBuffer.length} bytes), omitiendo`);
    return null;
  }

  try {
    const b64 = pdfBuffer.toString("base64");
    const promptText = `${INSTRUCCION_BASE}

Asunto del correo: ${subject}
${emailBodyText ? `\nCuerpo del correo:\n${emailBodyText.slice(0, 2000)}` : ""}

IMPORTANTE: Lee el PDF adjunto con atención. Incluso si es un formulario escaneado, extrae todos los datos visibles.
Si el PDF parece ser una plantilla en blanco, indícalo en resumen_ejecutivo.

Responde SOLO con este JSON (sin texto adicional):
${JSON_SCHEMA}`;

    // Usar beta.messages para soporte nativo de PDF
    const betaClient = (_anthropic as any).beta?.messages ?? (_anthropic as any).messages;
    const createOptions: any = {
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: b64 },
          },
          { type: "text", text: promptText },
        ],
      }],
    };

    // Añadir betas si está disponible el método beta
    if ((_anthropic as any).beta?.messages) {
      createOptions.betas = ["pdfs-2024-09-25"];
    }

    const msg = await betaClient.create(createOptions);
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    console.log(`[DitraMonitor] Claude Vision respuesta: ${raw.slice(0, 200)}`);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      parsed.pdf_legible = true;
      parsed._source = "claude_vision";
      console.log("[DitraMonitor] ✅ Claude Vision extrajo datos del PDF");
      return parsed;
    }
  } catch (e) {
    console.warn("[DitraMonitor] Claude Vision falló:", (e as Error).message?.slice(0, 200));
  }
  return null;
}

/* ── Extraer datos estructurados del DITRA con IA ──────────────────────── */
async function extractDitraData(
  pdfText: string,
  subject: string,
  emailBodyText: string = "",
  pdfBuffer?: Buffer,
): Promise<Record<string, any>> {

  const pdfAvailable = pdfText.trim().length > 50 &&
    !pdfText.includes("No se pudo leer el texto del PDF");

  // Estrategia 1: PDF con texto extraído → usar texto
  if (pdfAvailable) {
    const prompt = `${INSTRUCCION_BASE}

Asunto del correo: ${subject}

Texto extraído del PDF:
${pdfText.slice(0, 7000)}
${emailBodyText ? `\nCuerpo del correo:\n${emailBodyText.slice(0, 2000)}` : ""}

Responde SOLO con este JSON (sin texto adicional):
${JSON_SCHEMA}`;

    try {
      const raw = await askAI(prompt);
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {
      console.warn("[DitraMonitor] Error IA (texto):", e);
    }
  }

  // Estrategia 2: PDF escaneado → Claude Vision con el PDF como documento nativo
  if (pdfBuffer && pdfBuffer.length > 100) {
    console.log(`[DitraMonitor] PDF sin texto (${pdfBuffer.length} bytes) → intentando Claude Vision`);
    const visionResult = await extractWithClaudeVision(pdfBuffer, subject, emailBodyText);
    if (visionResult) return visionResult;
  }

  // Estrategia 3: Solo asunto + cuerpo del email
  console.log("[DitraMonitor] Extrayendo solo de asunto + cuerpo del email");
  const prompt3 = `${INSTRUCCION_BASE}

Asunto del correo: ${subject}
${emailBodyText ? `\nCuerpo del correo:\n${emailBodyText.slice(0, 4000)}` : ""}

NOTA: El PDF adjunto es escaneado y no pudo leerse. Extrae lo que puedas del asunto y cuerpo del correo.
En el resumen ejecutivo indica claramente que el PDF no fue legible.

Responde SOLO con este JSON (sin texto adicional):
${JSON_SCHEMA}`;

  try {
    const raw = await askAI(prompt3);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      parsed.pdf_legible = false;
      return parsed;
    }
  } catch (e) {
    console.warn("[DitraMonitor] Error IA (fallback):", e);
  }

  return {
    resumen_ejecutivo: `Reporte recibido: ${subject}. PDF escaneado no legible; sin datos de IA.`,
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
            parsedData = await extractDitraData(pdfText, subject, bodyFallback, Buffer.isBuffer(pdfBuffer) ? pdfBuffer : undefined);
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

/* GET /api/ditra-reports/:id/raw — texto crudo del PDF para diagnóstico */
router.get("/ditra-reports/:id/raw", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email_subject, pdf_filename, length(raw_text) as raw_len, raw_text FROM ditra_reports WHERE id = $1",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Reporte no encontrado" });
    res.json({
      id: rows[0].id,
      email_subject: rows[0].email_subject,
      pdf_filename: rows[0].pdf_filename,
      raw_text_length: rows[0].raw_len,
      raw_text_preview: (rows[0].raw_text ?? "").slice(0, 1000),
      raw_text_full: rows[0].raw_text,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* GET /api/ditra-monitor/check-pdf — verifica disponibilidad de pdftotext */
router.get("/ditra-monitor/check-pdf", (_req, res) => {
  const results: Record<string, any> = {};
  // Verificar pdftotext
  try {
    const out = execSync("pdftotext -v 2>&1", { timeout: 3000 }).toString();
    results.pdftotext = { available: true, version: out.slice(0, 100) };
  } catch (e: any) {
    results.pdftotext = { available: false, error: e.message?.slice(0, 100) };
  }
  // Verificar pdfjs-dist
  try {
    require.resolve("pdfjs-dist");
    results.pdfjs_dist = { available: true };
  } catch {
    results.pdfjs_dist = { available: false };
  }
  results.anthropic_configured = !!_anthropic;
  results.groq_configured = !!_groq;
  res.json(results);
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

/* DELETE /api/ditra-reports/:id — borra un reporte (para re-procesamiento manual) */
router.delete("/ditra-reports/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM ditra_reports WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Reporte no encontrado" });
    res.json({ ok: true, deleted: req.params.id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* DELETE /api/ditra-reports — borra reportes con raw_text vacío (datos incompletos) */
router.delete("/ditra-reports", async (req, res) => {
  try {
    const { rows, rowCount } = await pool.query(
      "DELETE FROM ditra_reports WHERE (raw_text IS NULL OR raw_text = '') RETURNING id, email_subject"
    );
    res.json({ ok: true, deleted: rowCount, ids: rows.map(r => r.id), subjects: rows.map(r => r.email_subject) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* POST /api/ditra-reports/:id/reprocess — re-extrae datos con IA del raw_text guardado */
router.post("/ditra-reports/:id/reprocess", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email_subject, raw_text, parsed_data FROM ditra_reports WHERE id = $1",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Reporte no encontrado" });

    const { id, email_subject, raw_text } = rows[0];
    const rawText = raw_text ?? "";

    if (rawText.length < 30) {
      return res.status(422).json({ error: "raw_text insuficiente para reprocesar" });
    }

    res.json({ message: "Reprocesando en background...", id });

    // Ejecutar en background
    (async () => {
      try {
        const parsedData = await extractDitraData(rawText, email_subject ?? "", "");
        await pool.query(
          `UPDATE ditra_reports SET
             parsed_data = $1, periodo = $2, fecha_reporte = $3, tipo_reporte = $4,
             total_accidentes = $5, total_muertos = $6, total_heridos = $7,
             resumen_ejecutivo = $8
           WHERE id = $9`,
          [
            JSON.stringify(parsedData),
            parsedData.periodo ?? null,
            parsedData.fecha_reporte ?? null,
            parsedData.tipo_reporte ?? "DITRA",
            parsedData.total_accidentes ?? 0,
            parsedData.total_muertos ?? 0,
            parsedData.total_heridos ?? 0,
            parsedData.resumen_ejecutivo ?? null,
            id,
          ]
        );
        console.log(`[DitraMonitor] ✅ Reporte ${id} reprocesado: ${parsedData.total_cierres ?? 0} cierres, ${parsedData.total_obras ?? 0} obras`);
      } catch (err: any) {
        console.error(`[DitraMonitor] Error reprocesando reporte ${id}:`, err?.message);
      }
    })();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* POST /api/ditra-reports/reprocess-all — reprocesa todos los reportes con IA actualizada */
router.post("/ditra-reports/reprocess-all", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email_subject, raw_text FROM ditra_reports WHERE length(raw_text) > 30 ORDER BY created_at DESC LIMIT 20"
    );
    res.json({ message: `Reprocesando ${rows.length} reportes en background...`, count: rows.length });

    (async () => {
      for (const report of rows) {
        try {
          const parsedData = await extractDitraData(report.raw_text, report.email_subject ?? "", "");
          await pool.query(
            `UPDATE ditra_reports SET
               parsed_data = $1, periodo = $2, fecha_reporte = $3, tipo_reporte = $4,
               total_accidentes = $5, total_muertos = $6, total_heridos = $7,
               resumen_ejecutivo = $8
             WHERE id = $9`,
            [
              JSON.stringify(parsedData),
              parsedData.periodo ?? null,
              parsedData.fecha_reporte ?? null,
              parsedData.tipo_reporte ?? "DITRA",
              parsedData.total_accidentes ?? 0,
              parsedData.total_muertos ?? 0,
              parsedData.total_heridos ?? 0,
              parsedData.resumen_ejecutivo ?? null,
              report.id,
            ]
          );
          console.log(`[DitraMonitor] ✅ Reporte ${report.id} (${report.email_subject}) reprocesado`);
          await new Promise(r => setTimeout(r, 1000)); // rate limit IA
        } catch (err: any) {
          console.error(`[DitraMonitor] Error reprocesando reporte ${report.id}:`, err?.message);
        }
      }
      console.log("[DitraMonitor] ✅ Reprocesamiento masivo completado");
    })();
  } catch (err) {
    res.status(500).json({ error: String(err) });
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
