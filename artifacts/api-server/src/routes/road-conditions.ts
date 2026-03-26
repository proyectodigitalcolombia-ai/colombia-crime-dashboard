import { Router, type IRouter } from "express";
import { parse } from "node-html-parser";

const router: IRouter = Router();

const SOURCE_URL = "https://www.policia.gov.co/estado-de-las-vias";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — source updates daily

interface RoadCondition {
  via: string;
  department: string;
  sector: string;
  km: string;
  condition: string;
  conditionCode: "cierre_total" | "cierre_parcial" | "desvio" | "otro";
  reason: string;
  alternativeRoute: string;
  startDate: string;
  endDate: string;
  indefinite: boolean;
  responsibleEntity: string;
}

interface Cache {
  data: RoadCondition[];
  fetchedAt: number;
  error: string | null;
}

let cache: Cache = { data: [], fetchedAt: 0, error: null };

function normalizeConditionCode(raw: string): RoadCondition["conditionCode"] {
  const lower = raw.toLowerCase();
  if (lower.includes("total")) return "cierre_total";
  if (lower.includes("parcial")) return "cierre_parcial";
  if (lower.includes("desvío") || lower.includes("desvio")) return "desvio";
  return "otro";
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").replace(/["""]/g, '"').trim();
}

async function fetchPage(pageIndex: number): Promise<RoadCondition[] | null> {
  const url = pageIndex === 0 ? SOURCE_URL : `${SOURCE_URL}?page=${pageIndex}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SafeNodeBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-CO,es;q=0.9",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const root = parse(html);

    /* Find the data table */
    const tables = root.querySelectorAll("table");
    const dataTable = tables.find(t =>
      t.text.toLowerCase().includes("condición") ||
      t.text.toLowerCase().includes("condicion") ||
      t.text.toLowerCase().includes("cierre")
    ) ?? tables[0];

    if (!dataTable) return [];

    const rows = dataTable.querySelectorAll("tbody tr");
    const conditions: RoadCondition[] = [];

    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 6) continue;

      const getText = (i: number) => cleanText(cells[i]?.text ?? "");

      /* Skip empty rows — pagination artifact on last page */
      const via = getText(0);
      const dept = getText(1);
      if (!via && !dept) continue;

      const condition = getText(4);
      const indef = getText(9).toLowerCase().includes("si") ||
                    getText(9).toLowerCase().includes("sí") ||
                    getText(9) === "Yes";

      conditions.push({
        via,
        department:        dept,
        sector:            getText(2),
        km:                getText(3),
        condition,
        conditionCode:     normalizeConditionCode(condition),
        reason:            getText(5),
        alternativeRoute:  getText(6),
        startDate:         getText(7),
        endDate:           getText(8),
        indefinite:        indef,
        responsibleEntity: getText(10) || "N/A",
      });
    }

    return conditions;
  } catch (err: any) {
    clearTimeout(timeout);
    throw err;
  }
}

async function fetchConditions(): Promise<void> {
  try {
    const all: RoadCondition[] = [];
    const MAX_PAGES = 25;

    for (let page = 0; page < MAX_PAGES; page++) {
      /* Polite delay between pages — avoid hammering the server */
      if (page > 0) await new Promise(r => setTimeout(r, 800));

      const rows = await fetchPage(page);

      /* null = fetch error; empty array = no more data */
      if (rows === null || rows.length === 0) break;

      all.push(...rows);
    }

    cache = { data: all, fetchedAt: Date.now(), error: null };
  } catch (err: any) {
    const msg = err?.name === "AbortError"
      ? "Timeout al conectar con policia.gov.co"
      : String(err?.message ?? err);
    cache = { ...cache, fetchedAt: Date.now(), error: msg };
  }
}

/* Background refresh on startup and every hour */
fetchConditions();
setInterval(fetchConditions, CACHE_TTL_MS);

/* GET /api/road-conditions */
router.get("/road-conditions", async (_req, res) => {
  /* Re-fetch if cache is stale (first boot or over 1h) */
  if (cache.fetchedAt === 0) {
    await fetchConditions();
  }

  res.json({
    conditions: cache.data,
    fetchedAt:  new Date(cache.fetchedAt).toISOString(),
    source:     SOURCE_URL,
    error:      cache.error,
    totalCount: cache.data.length,
    closureCount: cache.data.filter(c => c.conditionCode === "cierre_total").length,
  });
});

/* GET /api/road-conditions/by-department/:dept */
router.get("/road-conditions/by-department/:dept", async (req, res) => {
  if (cache.fetchedAt === 0) await fetchConditions();

  const dept = req.params.dept.toLowerCase();
  const filtered = cache.data.filter(c =>
    c.department.toLowerCase().includes(dept)
  );

  res.json({
    department:  req.params.dept,
    conditions:  filtered,
    fetchedAt:   new Date(cache.fetchedAt).toISOString(),
    source:      SOURCE_URL,
    error:       cache.error,
  });
});

/* POST /api/road-conditions/refresh — manual refresh trigger */
router.post("/road-conditions/refresh", async (_req, res) => {
  await fetchConditions();
  res.json({
    ok:         true,
    fetchedAt:  new Date(cache.fetchedAt).toISOString(),
    totalCount: cache.data.length,
    error:      cache.error,
  });
});

export default router;
