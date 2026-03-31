import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { pool } from "@workspace/db";
import { requireAuth } from "./auth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function parseCoord(s: string): [number, number] | null {
  if (!s) return null;
  s = String(s).replace(/\r\n|\n/g, " ");
  let m = s.match(/N\s*(\d+)[°]\s*([\d.]+)[´']\s*W\s*(\d+)[°]\s*([\d.]+)[´']/);
  if (m) {
    const lat = parseFloat(m[1]) + parseFloat(m[2]) / 60;
    const lng = -(parseFloat(m[3]) + parseFloat(m[4]) / 60);
    return [parseFloat(lat.toFixed(5)), parseFloat(lng.toFixed(5))];
  }
  m = s.match(/([\d.]+)[°]([\d.]+)'([\d.]+)"?\s*N\s*([\d.]+)[°]([\d.]+)'([\d.]+)"?\s*W/);
  if (m) {
    const lat = parseFloat(m[1]) + parseFloat(m[2]) / 60 + parseFloat(m[3]) / 3600;
    const lng = -(parseFloat(m[4]) + parseFloat(m[5]) / 60 + parseFloat(m[6]) / 3600);
    return [parseFloat(lat.toFixed(5)), parseFloat(lng.toFixed(5))];
  }
  return null;
}

function parseExcel(buffer: Buffer): {
  sheetName: string;
  origin: string;
  destination: string;
  points: any[];
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

  // Row 7 (index 7) = headers, row 8+ = data
  const points: any[] = [];
  for (let i = 8; i < data.length; i++) {
    const row = data[i];
    const n = row[0];
    if (!n || String(n).trim() === "") continue;
    const coord = parseCoord(String(row[6] ?? ""));
    if (!coord) continue;
    points.push({
      n: Number(n),
      dept: String(row[1] ?? "").trim(),
      mun: String(row[2] ?? "").trim(),
      nombre: String(row[3] ?? "").trim(),
      tipo: String(row[4] ?? "").trim(),
      desc: String(row[5] ?? "").trim().slice(0, 200),
      lat: coord[0],
      lng: coord[1],
      alt: Number(row[7]) || 0,
      vel: Number(row[8]) || 0,
      controles: String(row[10] ?? "").trim().slice(0, 150),
      riesgo: Math.round((Number(row[53]) || 0) * 10) / 10,
    });
  }

  return { sheetName, origin, destination, points };
}

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
  if (parsed.points.length === 0)
    return res.status(400).json({ error: "El archivo no tiene puntos con coordenadas GPS válidas" });

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
