import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { pool } from "@workspace/db";
import { requireAuth } from "./auth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function parseCoord(s: string): [number, number] | null {
  if (!s) return null;
  s = String(s).replace(/\r\n|\n|\t/g, " ").trim();
  if (!s) return null;

  let m: RegExpMatchArray | null;

  // ── Formato 1: N 10° 24.234' W 075° 32.456'  (minutos decimales, N al inicio)
  m = s.match(/N\s*(\d{1,3})[°º]\s*([\d.]+)\s*[´''`]\s*W\s*(\d{1,3})[°º]\s*([\d.]+)\s*[´''`]/i);
  if (m) {
    const lat = parseFloat(m[1]) + parseFloat(m[2]) / 60;
    const lng = -(parseFloat(m[3]) + parseFloat(m[4]) / 60);
    if (lat >= -5 && lat <= 14 && lng >= -82 && lng <= -66) return [+lat.toFixed(6), +lng.toFixed(6)];
  }

  // ── Formato 2: N 10° 24' 13" W 075° 32' 15"  (DMS con segundos, N al inicio)
  m = s.match(/N\s*(\d{1,3})[°º]\s*(\d{1,2})[´''`]\s*([\d.]+)["""]\s*W\s*(\d{1,3})[°º]\s*(\d{1,2})[´''`]\s*([\d.]+)["""]/i);
  if (m) {
    const lat = parseFloat(m[1]) + parseFloat(m[2]) / 60 + parseFloat(m[3]) / 3600;
    const lng = -(parseFloat(m[4]) + parseFloat(m[5]) / 60 + parseFloat(m[6]) / 3600);
    if (lat >= -5 && lat <= 14 && lng >= -82 && lng <= -66) return [+lat.toFixed(6), +lng.toFixed(6)];
  }

  // ── Formato 3: 10°24'13"N 075°32'15"W  (DMS, N/W al final)
  m = s.match(/([\d.]+)[°º]([\d.]+)[´''`]([\d.]+)["""]?\s*N\s*([\d.]+)[°º]([\d.]+)[´''`]([\d.]+)["""]?\s*W/i);
  if (m) {
    const lat = parseFloat(m[1]) + parseFloat(m[2]) / 60 + parseFloat(m[3]) / 3600;
    const lng = -(parseFloat(m[4]) + parseFloat(m[5]) / 60 + parseFloat(m[6]) / 3600);
    if (lat >= -5 && lat <= 14 && lng >= -82 && lng <= -66) return [+lat.toFixed(6), +lng.toFixed(6)];
  }

  // ── Formato 4: 10°24.234'N 075°32.456'W  (minutos decimales, N/W al final)
  m = s.match(/([\d.]+)[°º]([\d.]+)[´''`]\s*N\s*([\d.]+)[°º]([\d.]+)[´''`]\s*W/i);
  if (m) {
    const lat = parseFloat(m[1]) + parseFloat(m[2]) / 60;
    const lng = -(parseFloat(m[3]) + parseFloat(m[4]) / 60);
    if (lat >= -5 && lat <= 14 && lng >= -82 && lng <= -66) return [+lat.toFixed(6), +lng.toFixed(6)];
  }

  // ── Formato 5: 10.4034, -75.5376  o  10.4034 -75.5376  (grados decimales)
  m = s.match(/^(-?[\d.]+)\s*[,;]\s*(-?[\d.]+)$/);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    const lat = a >= -5 && a <= 14 ? a : b;
    const lng = b >= -82 && b <= -66 ? b : -a;
    if (lat >= -5 && lat <= 14 && lng >= -82 && lng <= -66) return [+lat.toFixed(6), +lng.toFixed(6)];
  }

  // ── Formato 6: N 10 24 13 W 75 32 15  (sin símbolos, espaciado)
  m = s.match(/N\s+(\d{1,3})\s+(\d{1,2})\s+([\d.]+)\s+W\s+(\d{1,3})\s+(\d{1,2})\s+([\d.]+)/i);
  if (m) {
    const lat = parseFloat(m[1]) + parseFloat(m[2]) / 60 + parseFloat(m[3]) / 3600;
    const lng = -(parseFloat(m[4]) + parseFloat(m[5]) / 60 + parseFloat(m[6]) / 3600);
    if (lat >= -5 && lat <= 14 && lng >= -82 && lng <= -66) return [+lat.toFixed(6), +lng.toFixed(6)];
  }

  // ── Formato 7: cualquier par numérico dentro del rango Colombia
  const nums = s.match(/-?[\d]+\.[\d]+/g);
  if (nums && nums.length >= 2) {
    const candidates = nums.map(parseFloat);
    for (let i = 0; i < candidates.length - 1; i++) {
      const a = candidates[i], b = candidates[i + 1];
      if (a >= -5 && a <= 14 && b >= -82 && b <= -66) return [+a.toFixed(6), +b.toFixed(6)];
      if (b >= -5 && b <= 14 && a >= -82 && a <= -66) return [+b.toFixed(6), +a.toFixed(6)];
    }
  }

  return null;
}

// Auto-detect header row + column indices, then parse data rows
function parseExcel(buffer: Buffer): {
  sheetName: string;
  origin: string;
  destination: string;
  points: any[];
  debug?: string;
} | null {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return null;
  const ws = wb.Sheets[sheetName];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Detect origin/destination from sheet name e.g. "BUENAVENTURA - BOGOTA"
  const parts = sheetName.split(/[-–—]+/).map((s: string) => s.trim());
  const origin = parts[0] ?? "ORIGEN";
  const destination = parts[1] ?? "DESTINO";

  // ── Auto-detect header row by looking for COORDENADAS/N°/DEPTO ──
  let headerRow = 7; // default row index 7
  let colCoord = 6, colLat = -1, colLng = -1;
  let colN = 0, colDept = 1, colMun = 2, colNombre = 3, colTipo = 4, colDesc = 5, colAlt = 7, colVel = 8, colControles = 10, colRiesgo = 53;

  for (let ri = 0; ri < Math.min(20, data.length); ri++) {
    const row = data[ri];
    const rowStr = row.map((c: any) => String(c).toUpperCase()).join("|");
    if (rowStr.includes("COORDENADA") || rowStr.includes("GPS") || (rowStr.includes("DEPTO") && rowStr.includes("NOMBRE"))) {
      headerRow = ri;
      // Try to find column indices from headers
      row.forEach((cell: any, ci: number) => {
        const h = String(cell).toUpperCase().trim();
        if (/^N[°º\s]?$/.test(h) || h === "N°" || h === "NO" || h === "N.") colN = ci;
        else if (h.includes("DEPTO") || h.includes("DPTO") || h.includes("DEPARTAMENTO")) colDept = ci;
        else if (h.includes("MUNIC") || h.includes("MUN")) colMun = ci;
        else if (h.includes("NOMBRE") || h.includes("PUNTO")) colNombre = ci;
        else if (h.includes("TIPO")) colTipo = ci;
        else if (h.includes("DESC")) colDesc = ci;
        else if (h.includes("COORD") || h.includes("GPS")) colCoord = ci;
        else if ((h.startsWith("LAT") || h.includes("LATITUD")) && !h.includes("LONG")) colLat = ci;
        else if (h.startsWith("LON") || h.includes("LONGITUD") || h.includes("LONG")) colLng = ci;
        else if (h.includes("ALT") && !h.includes("LONG")) colAlt = ci;
        else if (h.includes("VEL") || h.includes("VELOC")) colVel = ci;
        else if (h.includes("CONTROL")) colControles = ci;
        else if (h.includes("RIESGO") || h.includes("GRADO")) colRiesgo = ci;
      });
      break;
    }
  }

  const points: any[] = [];
  const failedCoords: string[] = [];
  const skippedN: string[] = [];
  let autoIndex = 0;

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    // Skip completely blank rows
    const rowText = row.map((c: any) => String(c ?? "").trim()).join("");
    if (!rowText) continue;

    // Strategy A: separate lat/lng columns (most reliable when headers detected)
    let coord: [number, number] | null = null;
    if (colLat >= 0 && colLng >= 0) {
      const lat = parseFloat(String(row[colLat] ?? ""));
      const lng = parseFloat(String(row[colLng] ?? ""));
      if (!isNaN(lat) && !isNaN(lng) && lat >= -5 && lat <= 14 && lng >= -82 && lng <= -66) {
        coord = [+lat.toFixed(6), +lng.toFixed(6)];
      }
    }

    // Strategy B: combined coordinate column
    const rawCoord = String(row[colCoord] ?? "");
    if (!coord) coord = parseCoord(rawCoord);

    // Strategy C: scan every cell in the row for any valid GPS string
    if (!coord) {
      for (let ci = 0; ci < row.length && !coord; ci++) {
        if (ci === colN) continue;
        const cellStr = String(row[ci] ?? "").trim();
        if (cellStr.length > 5) coord = parseCoord(cellStr);
      }
    }

    // Strategy D: look for two adjacent numeric cells in Colombia ranges
    if (!coord) {
      for (let ci = 0; ci < row.length - 1 && !coord; ci++) {
        const a = parseFloat(String(row[ci] ?? ""));
        const b = parseFloat(String(row[ci + 1] ?? ""));
        if (!isNaN(a) && !isNaN(b)) {
          if (a >= -5 && a <= 14 && b >= -82 && b <= -66) coord = [+a.toFixed(6), +b.toFixed(6)];
          else if (b >= -5 && b <= 14 && a >= -82 && a <= -66) coord = [+b.toFixed(6), +a.toFixed(6)];
        }
      }
    }

    if (!coord) {
      if (failedCoords.length < 6) failedCoords.push(`F${i}(col${colCoord})="${rawCoord.slice(0, 50)}"`);
      continue;
    }

    // N° can come from the expected column or be auto-assigned
    const nRaw = row[colN];
    const n = (nRaw !== undefined && nRaw !== "" && !isNaN(Number(nRaw))) ? Number(nRaw) : ++autoIndex;

    points.push({
      n,
      dept: String(row[colDept] ?? "").trim(),
      mun: String(row[colMun] ?? "").trim(),
      nombre: String(row[colNombre] ?? "").trim(),
      tipo: String(row[colTipo] ?? "").trim(),
      desc: String(row[colDesc] ?? "").trim().slice(0, 200),
      lat: coord[0],
      lng: coord[1],
      alt: Number(row[colAlt]) || 0,
      vel: Number(row[colVel]) || 0,
      controles: String(row[colControles] ?? "").trim().slice(0, 150),
      riesgo: Math.round((Number(row[colRiesgo]) || 0) * 10) / 10,
    });
  }

  const headerContent = (data[headerRow] ?? []).slice(0, 12).map((c: any, ci: number) => `[${ci}]=${String(c).slice(0, 20)}`).join(" ");
  const row9Sample = (data[headerRow + 1] ?? []).slice(0, 8).map((c: any, ci: number) => `[${ci}]=${String(c).slice(0, 15)}`).join(" ");
  const debug = points.length === 0
    ? `DIAGNÓSTICO: hoja="${sheetName}" filaHeader=${headerRow} colCoord=${colCoord} colLat=${colLat} colLng=${colLng} colN=${colN} totalFilas=${data.length}\nCABECERA: ${headerContent}\nFILA DATOS+1: ${row9Sample}\nCoordsNoRec: ${failedCoords.join(" | ")}`
    : undefined;

  return { sheetName, origin, destination, points, debug };
}

// POST /api/user-routes/debug — parse Excel and return raw preview (no DB storage)
router.post("/user-routes/debug", requireAuth, (req, res, next) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });
  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  // Return first 12 rows and column count
  const preview = data.slice(0, 12).map((row, i) => ({
    rowIndex: i,
    cells: row.slice(0, 15).map((c: any) => String(c).slice(0, 60)),
  }));
  const parsed = parseExcel(req.file.buffer);
  res.json({ sheetName, totalRows: data.length, preview, parsedPoints: parsed?.points?.length ?? 0, firstPoint: parsed?.points?.[0] ?? null });
});

// GET /api/user-routes — list all routes for current user
router.get("/user-routes", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, name, origin, destination, ruta_code, description, total_points, sheet_name, created_at
       FROM safenode_routes ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener rutas" });
  } finally {
    client.release();
  }
});

// GET /api/user-routes/:id/points — get all points for a route
router.get("/user-routes/:id/points", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT n, dept, mun, nombre, tipo, descripcion as desc, lat, lng, alt, vel, controles, riesgo
       FROM safenode_route_points WHERE route_id = $1 ORDER BY n`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener puntos" });
  } finally {
    client.release();
  }
});

// POST /api/user-routes/upload — upload Excel file, parse, store
router.post("/user-routes/upload", requireAuth, (req, res, next) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "Archivo demasiado grande (máx 200 MB). El archivo Excel no debería superar ese tamaño." });
      }
      return res.status(400).json({ error: `Error al recibir el archivo: ${err.message}` });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });

  const parsed = parseExcel(req.file.buffer);
  if (!parsed) return res.status(400).json({ error: "No se pudo leer el archivo Excel" });
  if (parsed.points.length === 0) {
    return res.status(400).json({ error: parsed.debug ?? "El archivo no tiene puntos con coordenadas GPS válidas" });
  }

  const { sheetName, origin, destination, points } = parsed;
  const customName = req.body.name?.trim() || `${origin} → ${destination}`;
  const userId = (req as any).user?.id ?? null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const routeRes = await client.query(
      `INSERT INTO safenode_routes (name, origin, destination, ruta_code, description, total_points, sheet_name, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [customName, origin, destination, req.body.ruta_code || "", req.body.description || "", points.length, sheetName, userId]
    );
    const routeId = routeRes.rows[0].id;

    for (const p of points) {
      await client.query(
        `INSERT INTO safenode_route_points (route_id,n,dept,mun,nombre,tipo,descripcion,lat,lng,alt,vel,controles,riesgo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [routeId, p.n, p.dept, p.mun, p.nombre, p.tipo, p.desc, p.lat, p.lng, p.alt, p.vel, p.controles, p.riesgo]
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ id: routeId, name: customName, total_points: points.length, origin, destination });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Error al guardar la ruta en la base de datos" });
  } finally {
    client.release();
  }
});

// DELETE /api/user-routes/:id
router.delete("/user-routes/:id", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM safenode_routes WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar la ruta" });
  } finally {
    client.release();
  }
});

export default router;
