import { Router, type IRouter } from "express";
import { parse } from "node-html-parser";

const router: IRouter = Router();

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface InviasClosure {
  via: string;
  department: string;
  sector: string;
  km: string;
  condition: string;
  conditionCode: "cierre_total" | "cierre_parcial" | "obra" | "derrumbe" | "otro";
  reason: string;
  alternativeRoute: string;
  startDate: string;
  endDate: string;
  indefinite: boolean;
  municipality: string;
}

interface Cache {
  data: InviasClosure[];
  fetchedAt: number;
  error: string | null;
  source: string;
}

let cache: Cache = { data: [], fetchedAt: 0, error: null, source: "" };

function normalizeCondition(raw: string): InviasClosure["conditionCode"] {
  const l = raw.toLowerCase();
  if (l.includes("total")) return "cierre_total";
  if (l.includes("parcial")) return "cierre_parcial";
  if (l.includes("obra") || l.includes("mantenimiento") || l.includes("construcción") || l.includes("construccion")) return "obra";
  if (l.includes("derrumbe") || l.includes("deslizamiento") || l.includes("avalancha")) return "derrumbe";
  return "otro";
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").replace(/["""]/g, '"').trim();
}

function extractMunicipality(text: string): string {
  const patterns = [
    /municipio de ([A-ZÁÉÍÓÚÑa-záéíóúñ\s]+)/i,
    /en ([A-ZÁÉÍÓÚÑa-záéíóúñ\s]+),\s*(departamento|depto)/i,
    /sector ([A-ZÁÉÍÓÚÑa-záéíóúñ\s]+)-([A-ZÁÉÍÓÚÑa-záéíóúñ\s]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

async function fetchInvias(): Promise<void> {
  const URLS = [
    "https://www.invias.gov.co/index.php/estado-vias",
    "https://www.invias.gov.co/index.php/estado-vias/cierre-de-vias",
  ];

  for (const url of URLS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);

      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SafeNodeBot/2.0)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
        },
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      const html = await res.text();
      const root = parse(html);

      const tables = root.querySelectorAll("table");
      const target = tables.find(t => {
        const txt = t.text.toLowerCase();
        return txt.includes("cierre") || txt.includes("condición") || txt.includes("condicion") || txt.includes("vía");
      }) ?? tables[0];

      if (!target) continue;

      const rows = target.querySelectorAll("tbody tr");
      const results: InviasClosure[] = [];

      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        if (cells.length < 4) continue;

        const g = (i: number) => clean(cells[i]?.text ?? "");
        const via = g(0);
        const dept = g(1);
        if (!via && !dept) continue;

        const condition = g(4) || g(3) || "N/A";
        const sector = g(2) || "";
        const km = g(3) || "";

        results.push({
          via,
          department: dept,
          sector,
          km,
          condition,
          conditionCode: normalizeCondition(condition + " " + (g(5) || "")),
          reason: g(5) || g(4) || "N/A",
          alternativeRoute: g(6) || "Sin información",
          startDate: g(7) || "N/A",
          endDate: g(8) || "N/A",
          indefinite: (g(9) || "").toLowerCase().includes("si") || (g(9) || "").toLowerCase().includes("sí"),
          municipality: extractMunicipality(sector + " " + via),
        });
      }

      if (results.length > 0) {
        cache = { data: results, fetchedAt: Date.now(), error: null, source: url };
        console.log(`[INVIAS] Fetched ${results.length} closures from ${url}`);
        return;
      }
    } catch (err: any) {
      console.warn(`[INVIAS] Failed to fetch from ${err?.message ?? err}`);
    }
  }

  /* Keep previous cache data on failure, just mark the error */
  cache = {
    ...cache,
    fetchedAt: Date.now(),
    error: "No se pudo conectar con INVIAS. Se muestran datos en caché.",
    source: "invias.gov.co (caché)",
  };
  console.warn("[INVIAS] All endpoints failed — keeping cached data");
}

/* Warm up on startup and refresh every 2h */
fetchInvias();
setInterval(fetchInvias, CACHE_TTL_MS);

/* GET /api/invias-closures */
router.get("/invias-closures", async (_req, res) => {
  if (cache.fetchedAt === 0) await fetchInvias();
  res.json({
    closures: cache.data,
    fetchedAt: new Date(cache.fetchedAt).toISOString(),
    source: cache.source,
    error: cache.error,
    totalCount: cache.data.length,
    closureCount: cache.data.filter(c => c.conditionCode === "cierre_total" || c.conditionCode === "cierre_parcial").length,
  });
});

/* GET /api/invias-closures/by-department/:dept */
router.get("/invias-closures/by-department/:dept", async (req, res) => {
  if (cache.fetchedAt === 0) await fetchInvias();
  const dept = req.params.dept.toLowerCase();
  const filtered = cache.data.filter(c => c.department.toLowerCase().includes(dept));
  res.json({ department: req.params.dept, closures: filtered, source: cache.source, error: cache.error });
});

/* POST /api/invias-closures/refresh */
router.post("/invias-closures/refresh", async (_req, res) => {
  await fetchInvias();
  res.json({ ok: true, fetchedAt: new Date(cache.fetchedAt).toISOString(), totalCount: cache.data.length, error: cache.error });
});

export default router;
