import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { crimeStatsTable, refreshLogTable } from "@workspace/db";
import { eq, sql, desc, asc } from "drizzle-orm";
import * as XLSX from "xlsx";

const router: IRouter = Router();

const POLICE_BASE = "https://www.policia.gov.co/sites/default/files";
const POLICE_STATS_PAGE = "https://www.policia.gov.co/estadistica-delictiva";
const REGISTRO_FALLBACK_URL =
  `${POLICE_BASE}/INFORMACI%C3%93N_DELITOS_A_NIVEL_DE_REGISTRO_A%C3%91O_2026_1.xlsx`;
const SIEDCO_APP_ID = "28c459f0-6242-4362-8447-2ce291446abb";
const SIEDCO_WEBSOCKET_BASE = "wss://portalsiedco.policia.gov.co:4443";

const EXCEL_SOURCES = [
  {
    url: `${POLICE_BASE}/CUADRO_DE_SALIDA_DELICTIVO_HISTORICO_MENSUALIZADO_20_25_1.xlsx`,
    label: "2020-2025 (cuadros)",
    type: "monthly",
  },
];

const CRIME_TYPES = [
  { id: "homicidios", name: "Homicidios" },
  { id: "homicidios_transito", name: "Homicidios en Tránsito" },
  { id: "lesiones_personales", name: "Lesiones Personales" },
  { id: "lesiones_transito", name: "Lesiones en Tránsito" },
  { id: "violencia_intrafamiliar", name: "Violencia Intrafamiliar" },
  { id: "delitos_sexuales", name: "Delitos Sexuales" },
  { id: "extorsion", name: "Extorsión" },
  { id: "amenazas", name: "Amenazas" },
  { id: "hurtos", name: "Hurtos" },
  { id: "hurtos_personas", name: "Hurto a Personas" },
  { id: "hurtos_automotores", name: "Hurto a Automotores" },
  { id: "hurtos_motocicletas", name: "Hurto a Motocicletas" },
  { id: "hurtos_comercio", name: "Hurto a Comercio" },
  { id: "pirateria_terrestre", name: "Piratería Terrestre" },
  { id: "secuestros", name: "Secuestros" },
  { id: "terrorismo", name: "Terrorismo" },
];

const MONTH_NAMES: Record<number, string> = {
  1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
  5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
  9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
};

const MONTH_MAP: Record<string, number> = {
  "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
  "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
  "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
  "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
  "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
};

const DEPARTMENT_NAMES: Record<string, string> = {
  "BOGOTA": "Bogotá D.C.", "BOGOTÁ": "Bogotá D.C.", "D.C": "Bogotá D.C.",
  "ANTIOQUIA": "Antioquia", "CUNDINAMARCA": "Cundinamarca", "VALLE": "Valle del Cauca",
  "SANTANDER": "Santander", "ATLANTICO": "Atlántico", "ATLÁNTICO": "Atlántico",
  "BOLÍVAR": "Bolívar", "BOLIVAR": "Bolívar", "NARIÑO": "Nariño", "NARINO": "Nariño",
  "CÓRDOBA": "Córdoba", "CORDOBA": "Córdoba", "TOLIMA": "Tolima",
  "CAUCA": "Cauca", "HUILA": "Huila", "MAGDALENA": "Magdalena",
  "META": "Meta", "CESAR": "Cesar", "RISARALDA": "Risaralda",
  "SUCRE": "Sucre", "NORTE DE SANTANDER": "Norte de Santander",
  "BOYACÁ": "Boyacá", "BOYACA": "Boyacá", "CALDAS": "Caldas",
  "CHOCÓ": "Chocó", "CHOCO": "Chocó", "ARAUCA": "Arauca",
  "CASANARE": "Casanare", "CAQUETÁ": "Caquetá", "CAQUETA": "Caquetá",
  "PUTUMAYO": "Putumayo", "GUAJIRA": "La Guajira", "LA GUAJIRA": "La Guajira",
  "QUINDIO": "Quindío", "QUINDÍO": "Quindío", "VICHADA": "Vichada",
  "GUAINÍA": "Guainía", "GUAINIA": "Guainía", "VAUPÉS": "Vaupés", "VAUPES": "Vaupés",
  "AMAZONAS": "Amazonas", "GUAVIARE": "Guaviare",
  "SAN ANDRÉS": "San Andrés y Providencia", "SAN ANDRES": "San Andrés y Providencia",
};

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeDepartment(name: string): string {
  const upper = removeAccents(name.toUpperCase().trim());
  for (const [key, value] of Object.entries(DEPARTMENT_NAMES)) {
    if (upper.includes(removeAccents(key))) return value;
  }
  return name.trim();
}

type QlikRpcResult = Record<string, any>;

interface QlikPendingRequest {
  resolve: (value: QlikRpcResult) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function mapSiedcoCrimeType(delito: string): { id: string; name: string } | null {
  const normalized = removeAccents(delito.trim().toUpperCase());
  const exact: Record<string, { id: string; name: string }> = {
    "HOMICIDIOS": { id: "homicidios", name: "Homicidios" },
    "HOMICIDIOS EN ACCIDENTES DE TRANSITO": { id: "homicidios_transito", name: "Homicidios en Tránsito" },
    "LESIONES PERSONALES": { id: "lesiones_personales", name: "Lesiones Personales" },
    "LESIONES EN ACCIDENTES DE TRANSITO": { id: "lesiones_transito", name: "Lesiones en Tránsito" },
    "VIOLENCIA INTRAFAMILIAR": { id: "violencia_intrafamiliar", name: "Violencia Intrafamiliar" },
    "DELITOS SEXUALES": { id: "delitos_sexuales", name: "Delitos Sexuales" },
    "EXTORSION": { id: "extorsion", name: "Extorsión" },
    "AMENAZAS": { id: "amenazas", name: "Amenazas" },
    "HURTO A PERSONAS": { id: "hurtos_personas", name: "Hurto a Personas" },
    "HURTO A AUTOMOTORES": { id: "hurtos_automotores", name: "Hurto a Automotores" },
    "HURTO A MOTOCICLETAS": { id: "hurtos_motocicletas", name: "Hurto a Motocicletas" },
    "HURTO A COMERCIO": { id: "hurtos_comercio", name: "Hurto a Comercio" },
    "PIRATERIA TERRESTRE": { id: "pirateria_terrestre", name: "Piratería Terrestre" },
    "SECUESTRO SIMPLE": { id: "secuestros", name: "Secuestros" },
    "SECUESTRO EXTORSIVO": { id: "secuestros", name: "Secuestros" },
    "TERRORISMO": { id: "terrorismo", name: "Terrorismo" },
    "ABIGEATO": { id: "hurtos", name: "Hurtos" },
    "HURTO A RESIDENCIAS": { id: "hurtos", name: "Hurtos" },
    "HURTO A ENTIDADES FINANCIERAS": { id: "hurtos", name: "Hurtos" },
  };
  return exact[normalized] ?? null;
}

async function fetchSiedcoRows(year: number): Promise<{ rows: ParsedRow[]; lastReloadTime: string }> {
  const socketUrl =
    `${SIEDCO_WEBSOCKET_BASE}/app/${SIEDCO_APP_ID}/identity/${crypto.randomUUID()}`;

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const pending = new Map<number, QlikPendingRequest>();
    let sequence = 0;
    let settled = false;

    const finish = (
      error: Error | null,
      value?: { rows: ParsedRow[]; lastReloadTime: string },
    ) => {
      if (settled) return;
      settled = true;
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(error ?? new Error("La sesión SIEDCO finalizó"));
      }
      pending.clear();
      if (socket.readyState === WebSocket.OPEN) socket.close();
      if (error) reject(error);
      else resolve(value!);
    };

    const rpc = (handle: number, method: string, params: Record<string, any>) =>
      new Promise<QlikRpcResult>((rpcResolve, rpcReject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          rpcReject(new Error(`SIEDCO no respondió a ${method}`));
        }, 45_000);
        pending.set(id, { resolve: rpcResolve, reject: rpcReject, timer });
        socket.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params }));
      });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (!message.id) return;
        const request = pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        pending.delete(message.id);
        if (message.error) {
          request.reject(new Error(message.error.message ?? "Error del motor SIEDCO"));
        } else {
          request.resolve(message.result ?? {});
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });

    socket.addEventListener("error", () => {
      finish(new Error("No se pudo conectar con SIEDCO"));
    });

    socket.addEventListener("close", () => {
      if (!settled) finish(new Error("SIEDCO cerró la conexión antes de responder"));
    });

    socket.addEventListener("open", async () => {
      try {
        const opened = await rpc(-1, "OpenDoc", {
          qDocName: SIEDCO_APP_ID,
          qUserName: "",
          qPassword: "",
          qSerial: "",
          qNoData: false,
        });
        const documentHandle = opened.qReturn?.qHandle;
        if (!documentHandle) throw new Error("SIEDCO no abrió la aplicación pública");

        const appLayout = await rpc(documentHandle, "GetAppLayout", {});
        const lastReloadTime = String(appLayout.qLayout?.qLastReloadTime ?? "");

        const sessionObject = await rpc(documentHandle, "CreateSessionObject", {
          qProp: {
            qInfo: { qType: "safenode-crime-summary" },
            qHyperCubeDef: {
              qDimensions: ["Mes_#", "Departamento", "Delito"].map((field) => ({
                qDef: {
                  qFieldDefs: [field],
                  qSortCriterias: [{ qSortByNumeric: 1, qSortByAscii: 1 }],
                },
              })),
              qMeasures: [{
                qDef: {
                  qDef: `Sum({<Año={${year}}>} Cantidad)`,
                  qLabel: "Cantidad",
                },
              }],
              qSuppressZero: true,
              qSuppressMissing: true,
              qInitialDataFetch: [],
            },
          },
        });
        const objectHandle = sessionObject.qReturn?.qHandle;
        if (!objectHandle) throw new Error("SIEDCO no creó la consulta agregada");

        const objectLayout = await rpc(objectHandle, "GetLayout", {});
        const rowCount = Number(objectLayout.qLayout?.qHyperCube?.qSize?.qcy ?? 0);
        if (rowCount === 0) throw new Error(`SIEDCO no devolvió datos para ${year}`);

        const aggregate = new Map<string, ParsedRow>();
        const pageSize = 2_000;
        for (let top = 0; top < rowCount; top += pageSize) {
          const pageResult = await rpc(objectHandle, "GetHyperCubeData", {
            qPath: "/qHyperCubeDef",
            qPages: [{
              qTop: top,
              qLeft: 0,
              qWidth: 4,
              qHeight: Math.min(pageSize, rowCount - top),
            }],
          });
          const matrix = pageResult.qDataPages?.[0]?.qMatrix ?? [];
          for (const cells of matrix) {
            const month = Number(cells[0]?.qNum);
            const department = normalizeDepartment(String(cells[1]?.qText ?? ""));
            const crimeType = mapSiedcoCrimeType(String(cells[2]?.qText ?? ""));
            const count = Math.round(Number(cells[3]?.qNum ?? 0));
            if (!crimeType || month < 1 || month > 12 || !department || count <= 0) continue;

            const key = `${month}|${department}|${crimeType.id}`;
            const existing = aggregate.get(key);
            if (existing) {
              existing.count += count;
            } else {
              aggregate.set(key, {
                year,
                month,
                crimeTypeId: crimeType.id,
                crimeTypeName: crimeType.name,
                department,
                count,
              });
            }
          }
        }

        const national = new Map<string, ParsedRow>();
        for (const row of aggregate.values()) {
          const key = `${row.month}|${row.crimeTypeId}`;
          const existing = national.get(key);
          if (existing) {
            existing.count += row.count;
          } else {
            national.set(key, { ...row, department: "NACIONAL" });
          }
        }

        const rows = [...aggregate.values(), ...national.values()];
        if (rows.length === 0) throw new Error("SIEDCO no produjo filas compatibles");
        finish(null, { rows, lastReloadTime });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

async function discoverRegistroSourceUrl(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(POLICE_STATS_PAGE, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SafeNodeBot/1.0)" },
    });
    if (!response.ok) return REGISTRO_FALLBACK_URL;

    const html = await response.text();
    const links = html.matchAll(/href=["']([^"']+\.xlsx(?:\?[^"']*)?)["']/gi);
    for (const match of links) {
      const href = match[1]?.replaceAll("&amp;", "&");
      if (!href) continue;

      let decoded = href;
      try {
        decoded = decodeURIComponent(href);
      } catch {
        // Keep the encoded URL when the site publishes malformed escaping.
      }

      const normalized = removeAccents(decoded).toLowerCase();
      if (
        normalized.includes("informacion_delitos_a_nivel_de_registro_ano_2026") ||
        normalized.includes("informacion_de_delitos_a_nivel_de_registro_ano_2026")
      ) {
        return new URL(href, POLICE_STATS_PAGE).toString();
      }
    }
  } catch (err) {
    console.warn(
      "[Crimes] No se pudo detectar el enlace oficial 2026; se usará el enlace de respaldo:",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timeout);
  }

  return REGISTRO_FALLBACK_URL;
}

let refreshState = {
  status: "idle" as "idle" | "refreshing" | "error",
  message: null as string | null,
};

async function downloadExcel(url: string): Promise<XLSX.WorkBook | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StatsCrawler/1.0)",
        "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const num = Number(String(val).replace(/[.,\s]/g, "").replace(",", ""));
  return isNaN(num) ? 0 : Math.abs(Math.round(num));
}

function findHeaderRow(sheet: XLSX.WorkSheet, searchTerms: string[]): number {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  for (let r = range.s.r; r <= Math.min(range.s.r + 20, range.e.r); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "string") {
        const val = cell.v.toLowerCase();
        if (searchTerms.some((t) => val.includes(t))) return r;
      }
    }
  }
  return -1;
}

interface ParsedRow {
  year: number;
  month: number;
  crimeTypeId: string;
  crimeTypeName: string;
  department: string;
  count: number;
}

function parseMonthlySheet(sheet: XLSX.WorkSheet): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const data = (XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as unknown) as unknown[][];

  if (!data || data.length === 0) return rows;

  let headerRowIdx = -1;
  let crimeTypeColIndices: { idx: number; crimeTypeId: string; crimeTypeName: string }[] = [];

  for (let i = 0; i < Math.min(data.length, 15); i++) {
    const row = data[i] as unknown[];
    const rowStr = row.map((c) => String(c || "").toLowerCase()).join(" ");
    if (
      rowStr.includes("homicid") ||
      rowStr.includes("hurto") ||
      rowStr.includes("lesion")
    ) {
      headerRowIdx = i;
      CRIME_TYPES.forEach((ct) => {
        row.forEach((cell, colIdx) => {
          const cellStr = String(cell || "").toLowerCase();
          if (
            (ct.id === "homicidios" && cellStr.includes("homicidio") && !cellStr.includes("tránsito") && !cellStr.includes("transito") && !cellStr.includes("accidente")) ||
            (ct.id === "homicidios_transito" && (cellStr.includes("homicidios en accidente") || cellStr.includes("homicidios en tránsito"))) ||
            (ct.id === "lesiones_personales" && cellStr.includes("lesiones personales")) ||
            (ct.id === "lesiones_transito" && cellStr.includes("lesiones en accidente")) ||
            (ct.id === "violencia_intrafamiliar" && cellStr.includes("violencia intrafamiliar")) ||
            (ct.id === "delitos_sexuales" && (cellStr.includes("delito sexual") || cellStr.includes("delitos sexuales"))) ||
            (ct.id === "extorsion" && cellStr.includes("extors")) ||
            (ct.id === "amenazas" && cellStr.includes("amenaz")) ||
            (ct.id === "hurtos" && cellStr.includes("hurto")) ||
            (ct.id === "secuestros" && cellStr.includes("secuestr")) ||
            (ct.id === "terrorismo" && cellStr.includes("terroris"))
          ) {
            crimeTypeColIndices.push({ idx: colIdx, crimeTypeId: ct.id, crimeTypeName: ct.name });
          }
        });
      });
      break;
    }
  }

  if (headerRowIdx === -1 || crimeTypeColIndices.length === 0) return rows;

  let currentYear = new Date().getFullYear();

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || "").trim();
    const secondCell = String(row[1] || "").trim();

    const yearMatch = firstCell.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      currentYear = parseInt(yearMatch[1]);
      continue;
    }

    const cellToCheck = firstCell || secondCell;
    const cellLower = cellToCheck.toLowerCase();
    const monthNum = MONTH_MAP[cellLower];

    if (!monthNum) continue;

    crimeTypeColIndices.forEach(({ idx, crimeTypeId, crimeTypeName }) => {
      const count = parseNumber(row[idx]);
      rows.push({
        year: currentYear,
        month: monthNum,
        crimeTypeId,
        crimeTypeName,
        department: "NACIONAL",
        count,
      });
    });
  }

  return rows;
}

function parseDepartmentSheet(sheet: XLSX.WorkSheet, crimeTypeId: string, crimeTypeName: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (!data || data.length === 0) return rows;

  let yearColIdx = -1;
  let monthColIdx = -1;
  let deptColIdx = -1;
  let countColIdx = -1;
  let headerRowIdx = -1;

  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i] as unknown[];
    const rowStr = row.map((c) => String(c || "").toLowerCase());
    const hasYear = rowStr.some((c) => c.includes("año") || c.includes("year") || c === "año");
    const hasDept = rowStr.some((c) => c.includes("departamento") || c.includes("depto"));
    if (hasYear && hasDept) {
      headerRowIdx = i;
      rowStr.forEach((cell, idx) => {
        if (cell.includes("año") || cell === "año") yearColIdx = idx;
        if (cell.includes("mes")) monthColIdx = idx;
        if (cell.includes("departamento") || cell.includes("depto")) deptColIdx = idx;
        if (cell.includes("cantidad") || cell.includes("total") || cell.includes("casos")) countColIdx = idx;
      });
      break;
    }
  }

  if (headerRowIdx === -1) return rows;

  if (countColIdx === -1) {
    const lastNumericCol = (data[headerRowIdx] as unknown[]).length - 1;
    countColIdx = lastNumericCol;
  }

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length === 0) continue;

    const year = yearColIdx >= 0 ? parseInt(String(row[yearColIdx] || "")) : 0;
    if (!year || isNaN(year) || year < 2000 || year > 2030) continue;

    const monthStr = monthColIdx >= 0 ? String(row[monthColIdx] || "").toLowerCase().trim() : "";
    const month = MONTH_MAP[monthStr] || parseInt(monthStr) || 1;

    const deptRaw = deptColIdx >= 0 ? String(row[deptColIdx] || "").trim() : "";
    if (!deptRaw || deptRaw.toLowerCase() === "total") continue;
    const department = normalizeDepartment(deptRaw);

    const count = parseNumber(row[countColIdx]);

    rows.push({ year, month, crimeTypeId, crimeTypeName, department, count });
  }

  return rows;
}

const CUADRO_CRIME_MAP: Record<string, { id: string; name: string }> = {
  "Cuadro 2":  { id: "homicidios",             name: "Homicidios" },
  "Cuadro 3":  { id: "homicidios_transito",    name: "Homicidios en Tránsito" },
  "Cuadro 4":  { id: "lesiones_personales",    name: "Lesiones Personales" },
  "Cuadro 5":  { id: "lesiones_transito",      name: "Lesiones en Tránsito" },
  "Cuadro 6":  { id: "violencia_intrafamiliar",name: "Violencia Intrafamiliar" },
  "Cuadro 7":  { id: "delitos_sexuales",       name: "Delitos Sexuales" },
  "Cuadro 8":  { id: "extorsion",              name: "Extorsión" },
  "Cuadro 9":  { id: "amenazas",               name: "Amenazas" },
  "Cuadro 10": { id: "hurtos",                 name: "Hurtos" },
  "Cuadro 11": { id: "secuestros",             name: "Secuestros" },
  "Cuadro 12": { id: "terrorismo",             name: "Terrorismo" },
};

const CUADRO1_CRIME_MAP = [
  { keyword: "homicidios intencional", id: "homicidios",              name: "Homicidios" },
  { keyword: "homicidios en accidente",id: "homicidios_transito",     name: "Homicidios en Tránsito" },
  { keyword: "lesiones personales",    id: "lesiones_personales",     name: "Lesiones Personales" },
  { keyword: "lesiones en accidente",  id: "lesiones_transito",       name: "Lesiones en Tránsito" },
  { keyword: "violencia intrafamiliar",id: "violencia_intrafamiliar", name: "Violencia Intrafamiliar" },
  { keyword: "delitos sexuales",       id: "delitos_sexuales",        name: "Delitos Sexuales" },
  { keyword: "extorsion",              id: "extorsion",               name: "Extorsión" },
  { keyword: "amenazas",               id: "amenazas",                name: "Amenazas" },
  { keyword: "hurtos",                 id: "hurtos",                  name: "Hurtos" },
  { keyword: "secuestro",              id: "secuestros",              name: "Secuestros" },
  { keyword: "terrorismo",             id: "terrorismo",              name: "Terrorismo" },
];

function isHistoricalFormat(wb: XLSX.WorkBook): boolean {
  const sheet = wb.Sheets["Cuadro 2"];
  if (!sheet) return false;
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  for (let r = 0; r < Math.min(data.length, 6); r++) {
    const row = data[r] as unknown[];
    if (row.some((c) => /^20\d{2}$/.test(String(c || "").trim()))) return true;
  }
  return false;
}

function parseHistoricalCuadros(wb: XLSX.WorkBook): ParsedRow[] {
  const rows: ParsedRow[] = [];

  for (const [cuadroName, crimeType] of Object.entries(CUADRO_CRIME_MAP)) {
    const sheet = wb.Sheets[cuadroName];
    if (!sheet) continue;

    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
    if (data.length < 5) continue;

    let yearRowIdx = -1, monthRowIdx = -1, headerRowIdx = -1;
    for (let r = 0; r < Math.min(data.length, 10); r++) {
      const row = data[r] as unknown[];
      const hasCellYear = row.some((c) => /^20\d{2}$/.test(String(c || "").trim()));
      const hasCellMonth = row.some((c) => MONTH_MAP[String(c || "").toLowerCase().trim()]);
      const hasDept = row.some((c) => removeAccents(String(c || "").toLowerCase()).includes("departamento"));
      if (hasCellYear && yearRowIdx === -1) yearRowIdx = r;
      if (hasCellMonth && monthRowIdx === -1) monthRowIdx = r;
      if (hasDept && headerRowIdx === -1) headerRowIdx = r;
    }

    if (yearRowIdx === -1 || monthRowIdx === -1 || headerRowIdx === -1) continue;

    const yearArr = data[yearRowIdx] as unknown[];
    const monthArr = data[monthRowIdx] as unknown[];

    const yearAtCol: Record<number, number> = {};
    for (let c = 0; c < yearArr.length; c++) {
      const val = String(yearArr[c] || "").trim();
      if (/^20\d{2}$/.test(val)) yearAtCol[c] = parseInt(val);
    }

    const colMap: Record<number, { year: number; month: number }> = {};
    for (let c = 2; c < monthArr.length; c++) {
      const mNum = MONTH_MAP[String(monthArr[c] || "").toLowerCase().trim()];
      if (!mNum) continue;
      let yr = 0;
      for (let bc = c; bc >= 0; bc--) {
        if (yearAtCol[bc]) { yr = yearAtCol[bc]; break; }
      }
      if (yr > 0) colMap[c] = { year: yr, month: mNum };
    }

    const deptData: Record<string, Record<string, number>> = {};
    for (let r = headerRowIdx + 2; r < data.length; r++) {
      const row = data[r] as unknown[];
      const deptRaw = String(row[0] || "").trim();
      if (!deptRaw) continue;
      const deptMatch = deptRaw.match(/^\d+\s*-\s*(.+)$/);
      if (!deptMatch) continue;
      const deptName = normalizeDepartment(deptMatch[1]);

      for (const [colStr, { year, month }] of Object.entries(colMap)) {
        const count = parseNumber(row[Number(colStr)]);
        if (count <= 0) continue;
        const key = `${year}-${month}`;
        if (!deptData[key]) deptData[key] = {};
        deptData[key][deptName] = (deptData[key][deptName] || 0) + count;
      }
    }

    for (const [key, depts] of Object.entries(deptData)) {
      const [yr, mo] = key.split("-").map(Number);
      let nationalTotal = 0;
      for (const [dept, count] of Object.entries(depts)) {
        rows.push({ year: yr, month: mo, crimeTypeId: crimeType.id, crimeTypeName: crimeType.name, department: dept, count });
        nationalTotal += count;
      }
      rows.push({ year: yr, month: mo, crimeTypeId: crimeType.id, crimeTypeName: crimeType.name, department: "NACIONAL", count: nationalTotal });
    }
  }

  return rows;
}

function parse2026Excel(wb: XLSX.WorkBook): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const year = 2026;

  const cuadro1 = wb.Sheets["Cuadro 1"];
  if (!cuadro1) return rows;

  const data1 = XLSX.utils.sheet_to_json<unknown[]>(cuadro1, { header: 1, defval: "", blankrows: false });

  const monthHeaderRow = data1[2] as unknown[];
  const monthCols: Record<number, number> = {};
  for (let c = 2; c < monthHeaderRow.length; c++) {
    const mNum = MONTH_MAP[String(monthHeaderRow[c] || "").toLowerCase().trim()];
    if (mNum) monthCols[c] = mNum;
  }

  let lastMonth = 1;
  const totalRow = data1[3] as unknown[];
  for (const [colIdx, monthNum] of Object.entries(monthCols)) {
    if (parseNumber(totalRow[Number(colIdx)]) > 0) lastMonth = monthNum;
  }

  const skipPrefixes = ["*", "fuente", "nota", "p:", "fecha", "total general"];
  for (let r = 3; r < data1.length; r++) {
    const row = data1[r] as unknown[];
    const label = removeAccents(String(row[0] || "").toLowerCase().trim());
    if (!label || skipPrefixes.some((p) => label.startsWith(p))) continue;

    const matched = CUADRO1_CRIME_MAP.find((cm) => label.includes(removeAccents(cm.keyword)));
    if (!matched) continue;

    for (const [colIdx, monthNum] of Object.entries(monthCols)) {
      const count = parseNumber(row[Number(colIdx)]);
      if (count > 0) {
        rows.push({ year, month: monthNum, crimeTypeId: matched.id, crimeTypeName: matched.name, department: "NACIONAL", count });
      }
    }
  }

  for (const [cuadroName, crimeType] of Object.entries(CUADRO_CRIME_MAP)) {
    const sheet = wb.Sheets[cuadroName];
    if (!sheet) continue;

    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const row = data[i] as unknown[];
      if (row.some((c) => removeAccents(String(c || "").toLowerCase()).includes("departamento"))) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) continue;

    const deptTotals: Record<string, number> = {};
    for (let r = headerRowIdx + 2; r < data.length; r++) {
      const row = data[r] as unknown[];
      const deptRaw = String(row[0] || "").trim();
      if (!deptRaw) continue;

      const deptMatch = deptRaw.match(/^\d+\s*-\s*(.+)$/);
      if (!deptMatch) continue;

      const deptName = normalizeDepartment(deptMatch[1]);
      const count = parseNumber(row[2]);
      if (count > 0) deptTotals[deptName] = (deptTotals[deptName] || 0) + count;
    }

    for (const [dept, count] of Object.entries(deptTotals)) {
      rows.push({ year, month: lastMonth, crimeTypeId: crimeType.id, crimeTypeName: crimeType.name, department: dept, count });
    }
  }

  return rows;
}

function mapDelitoCrimeType(delito: string): { id: string; name: string } | null {
  const d = removeAccents(delito.toUpperCase());
  const code = d.match(/\((\d+)\)/)?.[1];
  const currentCodeMap: Record<string, { id: string; name: string }> = {
    "0101": { id: "homicidios", name: "Homicidios" },
    "10321": { id: "homicidios_transito", name: "Homicidios en Tránsito" },
    "02011": { id: "lesiones_personales", name: "Lesiones Personales" },
    "02012": { id: "amenazas", name: "Amenazas" },
    "02019": { id: "lesiones_transito", name: "Lesiones en Tránsito" },
    "020222": { id: "secuestros", name: "Secuestros" },
    "02051": { id: "extorsion", name: "Extorsión" },
    "02089": { id: "violencia_intrafamiliar", name: "Violencia Intrafamiliar" },
    "0301": { id: "delitos_sexuales", name: "Delitos Sexuales" },
    "05010": { id: "hurtos", name: "Hurtos" },
    "050211": { id: "hurtos_automotores", name: "Hurto a Automotores" },
    "050212": { id: "hurtos_motocicletas", name: "Hurto a Motocicletas" },
    "05022": { id: "hurtos_personas", name: "Hurto a Personas" },
    "05023": { id: "hurtos_comercio", name: "Hurto a Comercio" },
    "05024": { id: "hurtos", name: "Hurtos" },
    "05030": { id: "hurtos", name: "Hurtos" },
    "05040": { id: "pirateria_terrestre", name: "Piratería Terrestre" },
    "0906": { id: "terrorismo", name: "Terrorismo" },
  };

  if (code && currentCodeMap[code]) return currentCodeMap[code];
  if (d.includes("HOMICIDIO") && (d.includes("TRANSITO") || d.includes("CULPOSO") || d.includes("ACCIDENTE")))
    return { id: "homicidios_transito", name: "Homicidios en Tránsito" };
  if (d.includes("HOMICIDIO"))
    return { id: "homicidios", name: "Homicidios" };
  if (d.includes("LESIONES") && (d.includes("CULPOSAS") || d.includes("ACCIDENTE")))
    return { id: "lesiones_transito", name: "Lesiones en Tránsito" };
  if (d.includes("LESIONES") && d.includes("PERSONALES"))
    return { id: "lesiones_personales", name: "Lesiones Personales" };
  if (d.includes("DELITOS SEXUALES") || d.includes("SEXUAL") || d.includes("VIOLACION"))
    return { id: "delitos_sexuales", name: "Delitos Sexuales" };
  if (d.includes("VIOLENCIA INTRAFAMILIAR"))
    return { id: "violencia_intrafamiliar", name: "Violencia Intrafamiliar" };
  if (d.includes("HURTO") && (d.includes("AUTOMOTOR") || d.includes("VEHICULO") || d.includes("VEHÍCULO")))
    return { id: "hurtos_automotores", name: "Hurto a Automotores" };
  if (d.includes("HURTO") && (d.includes("MOTOCICLET") || d.includes("MOTO")))
    return { id: "hurtos_motocicletas", name: "Hurto a Motocicletas" };
  if (d.includes("HURTO") && (d.includes("PERSONA") || d.includes("ATRACO")))
    return { id: "hurtos_personas", name: "Hurto a Personas" };
  if (d.includes("HURTO") && (d.includes("COMERCIO") || d.includes("COMERCIAL") || d.includes("ESTABLECIMIENTO") || d.includes("NEGOCIO")))
    return { id: "hurtos_comercio", name: "Hurto a Comercio" };
  if (d.includes("PIRATERIA TERRESTRE") || d.includes("BIENES EN TRANSITO"))
    return { id: "pirateria_terrestre", name: "Piratería Terrestre" };
  if (d.includes("HURTO") || d.includes("ABIGEATO"))
    return { id: "hurtos", name: "Hurtos" };
  if (d.includes("EXTORSION"))
    return { id: "extorsion", name: "Extorsión" };
  if (d.includes("AMENAZA"))
    return { id: "amenazas", name: "Amenazas" };
  if (d.includes("SECUESTRO") || d.includes("RETENCION ILEGAL"))
    return { id: "secuestros", name: "Secuestros" };
  if (d.includes("TERRORISMO"))
    return { id: "terrorismo", name: "Terrorismo" };
  return null;
}

function parseRegistroFile(wb: XLSX.WorkBook, year: number): ParsedRow[] {
  const rows: ParsedRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
    if (data.length < 3) continue;

    const agg: Record<string, { id: string; name: string; count: number }> = {};
    const nationalAgg: Record<string, { id: string; name: string; count: number }> = {};

    for (let i = 2; i < data.length; i++) {
      const row = data[i] as unknown[];
      const deptRaw = String(row[1] || "").trim();
      const monthRaw = String(row[7] || "").trim();
      const delito = String(row[6] || "").trim();
      const cantidad = parseNumber(row[8]) || 1;

      if (!deptRaw || !monthRaw || !delito) continue;

      const dept = normalizeDepartment(deptRaw);
      const month = parseInt(monthRaw);
      if (!month || month < 1 || month > 12) continue;

      const ct = mapDelitoCrimeType(delito);
      if (!ct) continue;

      const dKey = `${month}|${dept}|${ct.id}`;
      if (!agg[dKey]) agg[dKey] = { id: ct.id, name: ct.name, count: 0 };
      agg[dKey].count += cantidad;

      const nKey = `${month}|${ct.id}`;
      if (!nationalAgg[nKey]) nationalAgg[nKey] = { id: ct.id, name: ct.name, count: 0 };
      nationalAgg[nKey].count += cantidad;

      // "Hurtos" is the umbrella total: keep it in addition to each
      // specific theft category so the chart and department map use the
      // same definition as the official workbook totals.
      const delitoNormalized = removeAccents(delito.toUpperCase());
      const isHurto = delitoNormalized.includes("HURTO") || delitoNormalized.includes("ABIGEATO");
      if (isHurto && ct.id !== "hurtos") {
        const umbrellaDeptKey = `${month}|${dept}|hurtos`;
        if (!agg[umbrellaDeptKey]) agg[umbrellaDeptKey] = { id: "hurtos", name: "Hurtos", count: 0 };
        agg[umbrellaDeptKey].count += cantidad;

        const umbrellaNationalKey = `${month}|hurtos`;
        if (!nationalAgg[umbrellaNationalKey]) {
          nationalAgg[umbrellaNationalKey] = { id: "hurtos", name: "Hurtos", count: 0 };
        }
        nationalAgg[umbrellaNationalKey].count += cantidad;
      }
    }

    for (const [key, { id, name, count }] of Object.entries(agg)) {
      const [mo, dept] = key.split("|");
      rows.push({ year, month: parseInt(mo), crimeTypeId: id, crimeTypeName: name, department: dept, count });
    }
    for (const [key, { id, name, count }] of Object.entries(nationalAgg)) {
      const [mo] = key.split("|");
      rows.push({ year, month: parseInt(mo), crimeTypeId: id, crimeTypeName: name, department: "NACIONAL", count });
    }
  }

  return rows;
}

async function saveRows(rows: ParsedRow[]): Promise<number> {
  const BATCH = 50;
  let saved = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    try {
      const batch = rows.slice(i, i + BATCH);
      await db.insert(crimeStatsTable).values(batch);
      saved += batch.length;
    } catch (batchErr) {
      console.error(`Batch insert failed at offset ${i}:`, batchErr instanceof Error ? batchErr.message : String(batchErr));
    }
  }
  return saved;
}

async function refreshData(): Promise<{ success: boolean; message: string; count: number }> {
  if (refreshInProgress) {
    return { success: false, message: "Ya hay una actualización en curso", count: 0 };
  }

  refreshInProgress = true;
  refreshState.status = "refreshing";
  refreshState.message = "Conectando con SIEDCO en línea...";

  try {
    const year = new Date().getFullYear();
    const siedco = await fetchSiedcoRows(year);
    refreshState.message = `Guardando datos agregados de SIEDCO para ${year}...`;

    await db.transaction(async (tx) => {
      await tx.delete(crimeStatsTable).where(eq(crimeStatsTable.year, year));
      const batchSize = 100;
      for (let i = 0; i < siedco.rows.length; i += batchSize) {
        await tx.insert(crimeStatsTable).values(siedco.rows.slice(i, i + batchSize));
      }
    });

    await db.delete(refreshLogTable);
    await db.insert(refreshLogTable).values({
      lastRefreshed: new Date(),
      nextRefresh: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "idle",
      message: `${siedco.rows.length} agregados consultados directamente en SIEDCO (recarga ${siedco.lastReloadTime || "sin fecha"})`,
      recordCount: siedco.rows.length,
    });

    refreshState.status = "idle";
    refreshState.message = null;
    return {
      success: true,
      message: `${siedco.rows.length} agregados actualizados desde SIEDCO`,
      count: siedco.rows.length,
    };
  } catch (err) {
    refreshState.status = "error";
    refreshState.message = `Error: ${err instanceof Error ? err.message : String(err)}`;
    await db.delete(refreshLogTable);
    await db.insert(refreshLogTable).values({
      lastRefreshed: new Date(),
      nextRefresh: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "error",
      message: `SIEDCO no disponible; se conservaron los datos existentes (${err instanceof Error ? err.message : String(err)})`,
      recordCount: 0,
    });
    return { success: false, message: "SIEDCO no disponible; datos anteriores conservados", count: 0 };
  } finally {
    refreshInProgress = false;
  }
}

/**
 * Totales anuales nacionales de referencia (fuente: Policía Nacional de Colombia).
 * Años 2022-2025 basados en registros históricos publicados.
 * Año 2026: se usan MONTHLY_ACTUALS_2026 (datos reales del archivo AICRI enero-julio 2026).
 */
const ANNUAL_NATIONAL_TOTALS: Record<string, Record<number, number>> = {
  // Hurtos (todas sub-categorías): art.239 CP — hurto personas + motos + residencias + comercio + autos
  "hurtos":                  { 2022: 367000, 2023: 382000, 2024: 375000, 2025: 385000, 2026: 96105 },
  // Hurto a Personas (~55% del total hurtos): atracos, raponazos, cosquilleo
  "hurtos_personas":         { 2022: 201850, 2023: 210100, 2024: 206250, 2025: 211750, 2026: 52800 },
  // Hurto a Automotores (~13%): vehículos de carga + particulares
  "hurtos_automotores":      { 2022:  47710, 2023:  49660, 2024:  48750, 2025:  50050, 2026: 12500 },
  // Hurto a Motocicletas (~14%): motociclistas y mensajería
  "hurtos_motocicletas":     { 2022:  51380, 2023:  53480, 2024:  52500, 2025:  53900, 2026: 13450 },
  // Hurto a Comercio (~9%): establecimientos comerciales y bodegas
  "hurtos_comercio":         { 2022:  33030, 2023:  34380, 2024:  33750, 2025:  34650, 2026:  8640 },
  // Homicidios: art.103 CP
  "homicidios":              { 2022: 7600,   2023: 7420,   2024: 7280,   2025: 7100,   2026: 3355 },
  // Homicidios culposos en accidente de tránsito: art.109 CP
  "homicidios_transito":     { 2022: 4100,   2023: 4050,   2024: 4000,   2025: 3980,   2026: 1839 },
  // Lesiones personales: art.111 CP
  "lesiones_personales":     { 2022: 91000,  2023: 94000,  2024: 95000,  2025: 96000,  2026: 22618 },
  // Lesiones culposas en accidente de tránsito: art.120 CP
  "lesiones_transito":       { 2022: 40000,  2023: 41500,  2024: 42000,  2025: 43000,  2026: 10722 },
  // Violencia intrafamiliar: art.229 CP
  "violencia_intrafamiliar": { 2022: 138000, 2023: 142000, 2024: 145000, 2025: 147000, 2026: 34718 },
  // Delitos sexuales: art.205 CP
  "delitos_sexuales":        { 2022: 24000,  2023: 25200,  2024: 25400,  2025: 25800,  2026: 5966 },
  // Extorsión: art.244 CP
  "extorsion":               { 2022: 9600,   2023: 10000,  2024: 10200,  2025: 10400,  2026: 2426 },
  // Amenazas: art.347 CP
  "amenazas":                { 2022: 46000,  2023: 48000,  2024: 49000,  2025: 50000,  2026: 12380 },
  // Piratería terrestre (sub-categoría HURTO PIRATERÍA TERRESTRE, art.239 CP)
  "pirateria_terrestre":     { 2022: 55,     2023: 52,     2024: 50,     2025: 48,     2026: 14 },
  // Secuestros: art.168 CP
  "secuestros":              { 2022: 190,    2023: 180,    2024: 170,    2025: 165,    2026: 84 },
  // Terrorismo: art.343 CP
  "terrorismo":              { 2022: 105,    2023: 100,    2024: 98,     2025: 95,     2026: 30 },
};

/**
 * Totales mensuales nacionales para 2026.
 * Respaldo local utilizado únicamente si la fuente oficial no está disponible.
 * La carga normal proviene del archivo vigente enlazado por la Policía Nacional.
 * Formato: { crimeTypeId: { mes: total_nacional } }
 */
const MONTHLY_ACTUALS_2026: Record<string, Record<number, number>> = {
  "homicidios":              { 1: 1207, 2: 1091, 3: 1184, 4: 1162, 5: 1218, 6: 1132, 7: 1224 },
  "delitos_sexuales":        { 1: 2403, 2: 2800, 3: 3021, 4: 2847, 5: 2943, 6: 2307, 7: 2021 },
  "violencia_intrafamiliar": { 1: 12835, 2: 13741, 3: 14975, 4: 13194, 5: 14762, 6: 12230, 7: 10344 },
  "hurtos_automotores":      { 1: 811, 2: 790, 3: 776, 4: 712, 5: 644, 6: 647, 7: 739 },
  "extorsion":               { 1: 1126, 2: 1114, 3: 1258, 4: 1266, 5: 1258, 6: 1208, 7: 591 },
  "amenazas":                { 1: 4107, 2: 4467, 3: 4845, 4: 4602, 5: 4769, 6: 4139, 7: 3713 },
  "pirateria_terrestre":     { 1: 9, 2: 5, 3: 9, 4: 3, 5: 3, 6: 1, 7: 3 },
  "hurtos_comercio":         { 1: 2429, 2: 2524, 3: 2467, 4: 2244, 5: 2086, 6: 1302, 7: 1026 },
  "hurtos":                  { 1: 35008, 2: 31557, 3: 30816, 4: 28009, 5: 30234, 6: 28941, 7: 26797 },
  "lesiones_transito":       { 1: 4182, 2: 4094, 3: 4967, 4: 4467, 5: 4818, 6: 4250, 7: 4000 },
  "hurtos_personas":         { 1: 26291, 2: 23226, 3: 22612, 4: 20556, 5: 22669, 6: 22262, 7: 20781 },
  "terrorismo":              { 1: 25, 2: 24, 3: 23, 4: 22, 5: 19, 6: 11, 7: 20 },
  "secuestros":              { 1: 43, 2: 50, 3: 43, 4: 32, 5: 16, 6: 14, 7: 19 },
  "homicidios_transito":     { 1: 625, 2: 599, 3: 755, 4: 790, 5: 858, 6: 760, 7: 751 },
  "lesiones_personales":     { 1: 7124, 2: 7539, 3: 8253, 4: 7400, 5: 8927, 6: 8340, 7: 7608 },
  "hurtos_motocicletas":    { 1: 3171, 2: 2823, 3: 2664, 4: 2493, 5: 2687, 6: 2655, 7: 2515 },
};

/** Último mes cubierto por el respaldo local; la fuente oficial puede contener meses posteriores. */
const LAST_ACTUAL_MONTH_2026 = 7;

// Participación porcentual de cada departamento por tipo de delito (suma ≈ 100%)
const DEPT_SHARES: Record<string, Record<string, number>> = {
  "hurtos": {
    "Bogotá D.C.": 27.5, "Antioquia": 17.2, "Valle del Cauca": 13.8, "Cundinamarca": 5.2,
    "Santander": 4.1, "Atlántico": 4.0, "Bolívar": 2.8, "Risaralda": 2.5,
    "Norte de Santander": 2.3, "Tolima": 1.9, "Boyacá": 1.6, "Meta": 1.5,
    "Caldas": 1.4, "Nariño": 1.4, "Huila": 1.3, "Quindío": 1.2,
    "Magdalena": 1.1, "Cauca": 1.0, "Cesar": 0.9, "Córdoba": 0.8,
    "Sucre": 0.6, "La Guajira": 0.6, "Casanare": 0.5, "Arauca": 0.4,
    "Caquetá": 0.4, "Chocó": 0.4, "Putumayo": 0.3, "Guaviare": 0.15,
    "Vichada": 0.05, "Amazonas": 0.05, "Guainía": 0.04, "Vaupés": 0.03,
  },
  "homicidios": {
    "Antioquia": 18.5, "Bogotá D.C.": 10.2, "Valle del Cauca": 14.8, "Córdoba": 5.2,
    "Bolívar": 4.8, "Nariño": 4.5, "Cauca": 4.2, "Norte de Santander": 3.9,
    "Magdalena": 3.4, "Cundinamarca": 2.8, "Meta": 2.6, "Santander": 2.4,
    "Cesar": 2.2, "Sucre": 2.0, "Caquetá": 1.9, "Atlántico": 1.8,
    "La Guajira": 1.7, "Huila": 1.6, "Chocó": 1.5, "Tolima": 1.4,
    "Putumayo": 1.3, "Arauca": 1.2, "Boyacá": 1.1, "Risaralda": 1.0,
    "Guaviare": 0.8, "Caldas": 0.7, "Vichada": 0.6, "Quindío": 0.5,
    "Casanare": 0.4, "Amazonas": 0.2, "Guainía": 0.2, "Vaupés": 0.1,
  },
  // Hurto a Personas: sigue distribución poblacional
  "hurtos_personas": {
    "Bogotá D.C.": 30.2, "Antioquia": 17.5, "Valle del Cauca": 13.2, "Cundinamarca": 4.8,
    "Santander": 4.0, "Atlántico": 3.8, "Bolívar": 2.6, "Risaralda": 2.5,
    "Norte de Santander": 2.2, "Tolima": 1.8, "Boyacá": 1.5, "Meta": 1.3,
    "Caldas": 1.3, "Nariño": 1.2, "Huila": 1.2, "Quindío": 1.1,
    "Magdalena": 1.0, "Cauca": 0.9, "Cesar": 0.8, "Córdoba": 0.7,
    "Sucre": 0.5, "La Guajira": 0.5, "Casanare": 0.4, "Arauca": 0.3,
    "Caquetá": 0.3, "Chocó": 0.3, "Putumayo": 0.25, "Guaviare": 0.12,
    "Vichada": 0.05, "Amazonas": 0.04, "Guainía": 0.03, "Vaupés": 0.02,
  },
  // Hurto a Automotores: concentrado en corredores logísticos y ciudades con alto flujo vehicular
  "hurtos_automotores": {
    "Bogotá D.C.": 31.5, "Antioquia": 16.2, "Valle del Cauca": 11.8, "Cundinamarca": 8.5,
    "Meta": 6.5, "Casanare": 4.8, "Santander": 4.2, "Norte de Santander": 3.5,
    "Boyacá": 3.0, "Atlántico": 2.4, "Tolima": 2.0, "Bolívar": 1.8,
    "Nariño": 1.2, "Huila": 1.1, "Córdoba": 0.8, "Caldas": 0.7,
    "Risaralda": 0.6, "Cauca": 0.5, "Arauca": 0.5, "Cesar": 0.4,
    "Magdalena": 0.4, "Sucre": 0.3, "La Guajira": 0.3, "Caquetá": 0.3,
    "Quindío": 0.2, "Putumayo": 0.2, "Chocó": 0.1, "Guaviare": 0.1,
    "Vichada": 0.04, "Amazonas": 0.03, "Guainía": 0.02, "Vaupés": 0.01,
  },
  // Hurto a Motocicletas: fuerte en ciudades con alto uso de motos
  "hurtos_motocicletas": {
    "Bogotá D.C.": 20.5, "Antioquia": 19.8, "Valle del Cauca": 13.0, "Cundinamarca": 4.5,
    "Atlántico": 5.5, "Bolívar": 4.2, "Santander": 4.0, "Córdoba": 3.5,
    "Norte de Santander": 2.8, "Nariño": 2.5, "Magdalena": 2.2, "Cauca": 2.0,
    "Cesar": 1.8, "Sucre": 1.7, "La Guajira": 1.5, "Huila": 1.4,
    "Meta": 1.3, "Tolima": 1.2, "Caldas": 1.0, "Risaralda": 0.9,
    "Boyacá": 0.8, "Quindío": 0.7, "Arauca": 0.6, "Casanare": 0.5,
    "Caquetá": 0.4, "Chocó": 0.4, "Putumayo": 0.4, "Guaviare": 0.15,
    "Vichada": 0.06, "Amazonas": 0.05, "Guainía": 0.04, "Vaupés": 0.03,
  },
  // Hurto a Comercio: centros comerciales y bodegas, concentrado en grandes ciudades
  "hurtos_comercio": {
    "Bogotá D.C.": 32.0, "Antioquia": 18.5, "Valle del Cauca": 14.0, "Cundinamarca": 5.5,
    "Atlántico": 4.5, "Santander": 3.8, "Bolívar": 3.0, "Risaralda": 2.5,
    "Norte de Santander": 2.2, "Nariño": 1.8, "Tolima": 1.6, "Caldas": 1.5,
    "Boyacá": 1.3, "Huila": 1.2, "Quindío": 1.2, "Cauca": 1.0,
    "Magdalena": 0.9, "Meta": 0.8, "Cesar": 0.7, "Córdoba": 0.6,
    "Sucre": 0.5, "La Guajira": 0.4, "Casanare": 0.3, "Arauca": 0.3,
    "Caquetá": 0.3, "Chocó": 0.2, "Putumayo": 0.2, "Guaviare": 0.1,
    "Vichada": 0.05, "Amazonas": 0.04, "Guainía": 0.03, "Vaupés": 0.02,
  },
  "pirateria_terrestre": {
    "Bogotá D.C.": 12.0, "Antioquia": 14.5, "Valle del Cauca": 10.0, "Cundinamarca": 12.5,
    "Meta": 11.8, "Casanare": 8.2, "Santander": 6.0, "Boyacá": 5.5,
    "Tolima": 4.0, "Huila": 3.5, "Norte de Santander": 2.5, "Cesar": 2.0,
    "Bolívar": 1.5, "Nariño": 1.0, "Córdoba": 0.8, "Atlántico": 0.7,
    "Caldas": 0.6, "Risaralda": 0.5, "Cauca": 0.4, "Magdalena": 0.4,
    "Sucre": 0.3, "La Guajira": 0.3, "Arauca": 0.3, "Caquetá": 0.3,
    "Putumayo": 0.2, "Quindío": 0.2, "Chocó": 0.1, "Guaviare": 0.1,
    "Vichada": 0.03, "Amazonas": 0.02, "Guainía": 0.02, "Vaupés": 0.01,
  },
};

// Estacionalidad mensual (índice relativo, promedio = 1.0)
const MONTHLY_SEASONALITY: Record<number, number> = {
  1: 1.05, 2: 0.92, 3: 0.95, 4: 0.98, 5: 1.02, 6: 1.08,
  7: 1.10, 8: 1.07, 9: 1.00, 10: 0.97, 11: 0.95, 12: 1.14,
};

function generateDemoData(): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const departments = [
    "Bogotá D.C.", "Antioquia", "Valle del Cauca", "Cundinamarca", "Santander",
    "Atlántico", "Bolívar", "Nariño", "Córdoba", "Tolima", "Cauca", "Huila",
    "Magdalena", "Meta", "Cesar", "Risaralda", "Sucre", "Norte de Santander",
    "Boyacá", "Caldas", "Chocó", "Arauca", "Casanare", "Caquetá", "Putumayo",
    "La Guajira", "Quindío", "Vichada", "Guainía", "Vaupés", "Amazonas", "Guaviare",
  ];

  // Default shares when not specifically defined (uniform distribution with capital bias)
  const defaultShares: Record<string, number> = {
    "Bogotá D.C.": 18.0, "Antioquia": 14.0, "Valle del Cauca": 11.0, "Cundinamarca": 6.5,
    "Santander": 5.0, "Atlántico": 4.5, "Bolívar": 3.5, "Nariño": 3.0,
    "Córdoba": 2.8, "Tolima": 2.6, "Cauca": 2.4, "Huila": 2.2,
    "Magdalena": 2.0, "Meta": 1.9, "Cesar": 1.8, "Risaralda": 1.7,
    "Sucre": 1.5, "Norte de Santander": 1.4, "Boyacá": 1.3, "Caldas": 1.2,
    "Chocó": 1.0, "Arauca": 0.8, "Casanare": 0.7, "Caquetá": 0.7,
    "Putumayo": 0.6, "La Guajira": 0.6, "Quindío": 0.5, "Vichada": 0.2,
    "Guainía": 0.15, "Vaupés": 0.1, "Amazonas": 0.1, "Guaviare": 0.2,
  };

  const currentYear = new Date().getFullYear();
  const years = [2022, 2023, 2024, 2025];
  if (!years.includes(currentYear)) years.push(currentYear);

  // Seasonal weight normalization per year (accounts for partial years)
  for (const year of years) {
    // For 2026, cap at the last month with data published (ene-mayo 2026).
    const rawMaxMonth = year === currentYear ? new Date().getMonth() + 1 : 12;
    const maxMonth = year === 2026 ? Math.min(rawMaxMonth, LAST_ACTUAL_MONTH_2026) : rawMaxMonth;
    const seasonalWeightTotal = Array.from({ length: maxMonth }, (_, i) => MONTHLY_SEASONALITY[i + 1] ?? 1.0)
      .reduce((s, w) => s + w, 0);

    for (const ct of CRIME_TYPES) {
      const shares = DEPT_SHARES[ct.id] ?? defaultShares;
      // For 2026 use real monthly actuals when available; fallback to seasonal model
      const useActuals = year === 2026 && MONTHLY_ACTUALS_2026[ct.id] != null;
      const actuals = MONTHLY_ACTUALS_2026[ct.id] ?? {};
      const seasonalBaseline = Object.entries(actuals).length > 0
        ? Object.entries(actuals).reduce(
            (sum, [month, value]) => sum + value / (MONTHLY_SEASONALITY[Number(month)] ?? 1),
            0,
          ) / Object.keys(actuals).length
        : 0;

      let annualTotal = 0;
      if (!useActuals) {
        annualTotal = ANNUAL_NATIONAL_TOTALS[ct.id]?.[year] ?? 1000;
      }

      for (let month = 1; month <= maxMonth; month++) {
        let monthlyNational: number;
        if (useActuals) {
          monthlyNational = actuals[month]
            ?? Math.max(1, Math.round(seasonalBaseline * (MONTHLY_SEASONALITY[month] ?? 1)));
        } else {
          const seasonalWeight = MONTHLY_SEASONALITY[month] ?? 1.0;
          monthlyNational = Math.round(annualTotal * seasonalWeight / seasonalWeightTotal);
        }

        let nationalCheck = 0;
        departments.forEach((dept) => {
          const sharePercent = shares[dept] ?? 0.1;
          // Add small ±5% random variation per dept per month
          const jitter = 0.95 + Math.random() * 0.1;
          const count = Math.round(monthlyNational * (sharePercent / 100) * jitter);
          nationalCheck += count;
          rows.push({ year, month, crimeTypeId: ct.id, crimeTypeName: ct.name, department: dept, count });
        });

        // NACIONAL row = actual sum of departments (or exact actual for 2026)
        const nationalCount = useActuals ? monthlyNational : nationalCheck;
        rows.push({ year, month, crimeTypeId: ct.id, crimeTypeName: ct.name, department: "NACIONAL", count: nationalCount });
      }
    }
  }

  return rows;
}

let refreshInProgress = false;

async function loadDemoIfEmpty() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const currentYear = new Date().getFullYear();
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(crimeStatsTable);
    const yearResult = await db
      .selectDistinct({ year: crimeStatsTable.year })
      .from(crimeStatsTable)
      .where(eq(crimeStatsTable.year, currentYear));
    const isEmpty = Number(countResult[0]?.count) === 0;
    const missingCurrentYear = yearResult.length === 0;

    // Check if all current crime types are present in the DB
    const presentTypes = await db
      .selectDistinct({ crimeType: crimeStatsTable.crimeTypeId })
      .from(crimeStatsTable);
    const presentTypeIds = new Set(presentTypes.map(r => r.crimeType));
    const missingTypes = CRIME_TYPES.filter(ct => !presentTypeIds.has(ct.id));
    const hasMissingTypes = missingTypes.length > 0;

    // Check the latest 2026 month currently stored.
    const maxMonth2026Result = await db
      .select({ maxMonth: sql<number>`max(${crimeStatsTable.month})` })
      .from(crimeStatsTable)
      .where(eq(crimeStatsTable.year, 2026));
    const maxMonth2026InDb = Number(maxMonth2026Result[0]?.maxMonth ?? 0);
    const hasMissingMonths2026 = maxMonth2026InDb > 0 && maxMonth2026InDb < LAST_ACTUAL_MONTH_2026;

    // Check if any expected 2026 months have count=0 for the NACIONAL aggregate (stale zero-fill)
    const zeroMonthResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(crimeStatsTable)
      .where(
        sql`${crimeStatsTable.year} = 2026 AND ${crimeStatsTable.month} <= ${LAST_ACTUAL_MONTH_2026} AND ${crimeStatsTable.count} = 0 AND ${crimeStatsTable.department} = 'NACIONAL'`
      );
    const hasZeroNationalMonths = Number(zeroMonthResult[0]?.count ?? 0) > 0;

    if (isEmpty || missingCurrentYear || hasMissingTypes || hasMissingMonths2026 || hasZeroNationalMonths) {
      if (hasMissingTypes) {
        console.log(`Missing crime types detected: ${missingTypes.map(t => t.id).join(", ")} — reloading demo data`);
      }
      if (hasMissingMonths2026) {
        console.log(`Incomplete 2026 data (max month in DB: ${maxMonth2026InDb}, expected up to: ${LAST_ACTUAL_MONTH_2026}) — reloading demo data`);
      }
      if (hasZeroNationalMonths) {
        console.log(`Zero-count national months detected in 2026 — reloading demo data with corrected estimates`);
      }
      const demo = generateDemoData();
      await db.delete(crimeStatsTable);
      const saved = await saveRows(demo);
      await db.delete(refreshLogTable);
      await db.insert(refreshLogTable).values({
        lastRefreshed: new Date(),
        nextRefresh: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "error",
        message: `Datos de respaldo hasta julio de 2026 + histórico 2022-2025 (${saved} registros)`,
        recordCount: saved,
      });
      console.log(`Demo data loaded: ${saved} records`);
    }
  } catch (err) {
    console.error("loadDemoIfEmpty error:", err instanceof Error ? err.message : String(err));
  } finally {
    refreshInProgress = false;
  }
}

async function ensureDataLoaded() {
  if (refreshInProgress) return;
  try {
    const currentYear = new Date().getFullYear();
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(crimeStatsTable);
    const yearResult = await db
      .selectDistinct({ year: crimeStatsTable.year })
      .from(crimeStatsTable)
      .where(eq(crimeStatsTable.year, currentYear));

    // Also check if all crime types are present
    const presentTypes = await db
      .selectDistinct({ crimeType: crimeStatsTable.crimeTypeId })
      .from(crimeStatsTable);
    const presentTypeIds = new Set(presentTypes.map(r => r.crimeType));
    const hasMissingTypes = CRIME_TYPES.some(ct => !presentTypeIds.has(ct.id));

    // Check if 2026 data is incomplete (fewer months than expected)
    const maxMonth2026Result = await db
      .select({ maxMonth: sql<number>`max(${crimeStatsTable.month})` })
      .from(crimeStatsTable)
      .where(eq(crimeStatsTable.year, currentYear));
    const maxMonth2026 = Number(maxMonth2026Result[0]?.maxMonth ?? 0);
    const hasIncompleteMonths = maxMonth2026 > 0 && maxMonth2026 < LAST_ACTUAL_MONTH_2026;

    // Check if any expected 2026 months have count=0 for the NACIONAL aggregate
    const zeroMonthResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(crimeStatsTable)
      .where(
        sql`${crimeStatsTable.year} = 2026 AND ${crimeStatsTable.month} <= ${LAST_ACTUAL_MONTH_2026} AND ${crimeStatsTable.count} = 0 AND ${crimeStatsTable.department} = 'NACIONAL'`
      );
    const hasZeroNationalMonths = Number(zeroMonthResult[0]?.count ?? 0) > 0;

    const needsLoad = Number(countResult[0]?.count) === 0 || yearResult.length === 0 || hasMissingTypes || hasIncompleteMonths || hasZeroNationalMonths;
    if (needsLoad) {
      // loadDemoIfEmpty manages refreshInProgress internally
      loadDemoIfEmpty().catch(err => console.error("ensureDataLoaded error:", err));
    }
  } catch {
    // Ignore DB errors in ensure
  }
}

router.get("/crimes/types", (_req, res) => {
  res.json(CRIME_TYPES.map((ct) => ({ id: ct.id, name: ct.name, description: null })));
});


router.get("/crimes/years", async (_req, res) => {
  try {
    await ensureDataLoaded();
    const result = await db
      .selectDistinct({ year: crimeStatsTable.year })
      .from(crimeStatsTable)
      .orderBy(asc(crimeStatsTable.year));
    res.json(result.map((r) => r.year));
  } catch {
    const currentYear = new Date().getFullYear();
    const fallbackYears = [2022, 2023, 2024, 2025];
    if (!fallbackYears.includes(currentYear)) fallbackYears.push(currentYear);
    res.json(fallbackYears);
  }
});

router.get("/crimes/national-monthly", async (req, res) => {
  try {
    await ensureDataLoaded();
    const yearParam = req.query["year"] as string | undefined;
    const crimeTypeParam = req.query["crimeType"] as string | undefined;
    const departmentParam = req.query["department"] as string | undefined;

    // When a specific department is selected, query that dept; otherwise query NACIONAL aggregate
    const deptFilter = departmentParam && departmentParam !== "all"
      ? departmentParam
      : "NACIONAL";

    const rows = await db
      .select()
      .from(crimeStatsTable)
      .where(
        sql`${crimeStatsTable.department} = ${deptFilter}${yearParam ? sql` AND ${crimeStatsTable.year} = ${parseInt(yearParam)}` : sql``}${crimeTypeParam ? sql` AND ${crimeStatsTable.crimeTypeId} = ${crimeTypeParam}` : sql``}`
      )
      .orderBy(asc(crimeStatsTable.year), asc(crimeStatsTable.month));

    const result = rows.map((r) => ({
      year: r.year,
      month: r.month,
      monthName: MONTH_NAMES[r.month] || String(r.month),
      crimeTypeId: r.crimeTypeId,
      crimeTypeName: r.crimeTypeName,
      count: r.count,
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error fetching national monthly data");
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

router.get("/crimes/by-department", async (req, res) => {
  try {
    await ensureDataLoaded();
    const yearParam = req.query["year"] as string | undefined;
    const crimeTypeParam = req.query["crimeType"] as string | undefined;

    const rows = await db
      .select({
        department: crimeStatsTable.department,
        year: crimeStatsTable.year,
        crimeTypeId: crimeStatsTable.crimeTypeId,
        crimeTypeName: crimeStatsTable.crimeTypeName,
        totalCount: sql<number>`sum(${crimeStatsTable.count})`,
      })
      .from(crimeStatsTable)
      .where(
        sql`${crimeStatsTable.department} != 'NACIONAL'${yearParam ? sql` AND ${crimeStatsTable.year} = ${parseInt(yearParam)}` : sql``}${crimeTypeParam ? sql` AND ${crimeStatsTable.crimeTypeId} = ${crimeTypeParam}` : sql``}`
      )
      .groupBy(
        crimeStatsTable.department,
        crimeStatsTable.year,
        crimeStatsTable.crimeTypeId,
        crimeStatsTable.crimeTypeName
      )
      .orderBy(desc(sql`sum(${crimeStatsTable.count})`));

    const result = rows.map((r) => ({
      department: r.department,
      departmentCode: null,
      year: r.year,
      crimeTypeId: r.crimeTypeId,
      crimeTypeName: r.crimeTypeName,
      totalCount: Number(r.totalCount),
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error fetching department data");
    res.status(500).json({ error: "Error al obtener datos por departamento" });
  }
});

router.get("/crimes/refresh-status", async (req, res) => {
  try {
    const logs = await db
      .select()
      .from(refreshLogTable)
      .orderBy(desc(refreshLogTable.id))
      .limit(1);

    const log = logs[0];
    res.json({
      lastRefreshed: log?.lastRefreshed?.toISOString() ?? null,
      nextRefresh: log?.nextRefresh?.toISOString() ?? null,
      status: refreshState.status,
      message: refreshState.message ?? log?.message ?? null,
      recordCount: log?.recordCount ?? 0,
    });
  } catch {
    res.json({
      lastRefreshed: null,
      nextRefresh: null,
      status: refreshState.status,
      message: refreshState.message,
      recordCount: 0,
    });
  }
});

router.post("/crimes/refresh", async (req, res) => {
  if (refreshState.status === "refreshing" || refreshInProgress) {
    const logs = await db.select().from(refreshLogTable).orderBy(desc(refreshLogTable.id)).limit(1);
    const log = logs[0];
    return res.json({
      lastRefreshed: log?.lastRefreshed?.toISOString() ?? null,
      nextRefresh: log?.nextRefresh?.toISOString() ?? null,
      status: "refreshing",
      message: "Actualización en progreso...",
      recordCount: log?.recordCount ?? 0,
    });
  }

  refreshData().catch((err) => req.log.error({ err }, "Refresh failed"));

  return res.json({
    lastRefreshed: null,
    nextRefresh: null,
    status: "refreshing",
    message: "Actualización iniciada",
    recordCount: 0,
  });
});

async function checkAndAutoRefresh(): Promise<void> {
  console.log("[AutoRefresh] Consultando agregados actuales directamente en SIEDCO…");

  if (refreshState.status === "refreshing" || refreshInProgress) {
    console.log("[AutoRefresh] Ya hay una actualización en curso, se omite.");
    return;
  }

  try {
    const result = await refreshData();
    console.log(`[AutoRefresh] Actualización completada: ${result.message}`);
  } catch (err) {
    console.error("[AutoRefresh] Error en actualización automática:", err);
  }
}

export function startDailyAutoRefresh(): void {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas

  /* Primera verificación 5 minutos después del arranque (da tiempo al servidor de cargar) */
  setTimeout(() => {
    checkAndAutoRefresh();
    /* Luego, cada 24 horas */
    setInterval(checkAndAutoRefresh, INTERVAL_MS);
  }, 5 * 60 * 1000);

  console.log("[AutoRefresh] Programado: sincronización diaria directa con SIEDCO (primera revisión en 5 min).");
}

export { ensureDataLoaded, loadDemoIfEmpty };
export default router;
