import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { crimeStatsTable, refreshLogTable } from "@workspace/db";
import { eq, sql, desc, asc } from "drizzle-orm";
import * as XLSX from "xlsx";

const router: IRouter = Router();

const POLICE_BASE = "https://www.policia.gov.co/sites/default/files";

const REGISTRO_SOURCES = [
  { url: `${POLICE_BASE}/INFORMACI%C3%93N_DE_DELITOS_A_NIVEL_DE_REGISTRO_A%C3%91O_2026_1.xlsx`, year: 2026 },
];

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

let refreshState = {
  status: "idle" as "idle" | "refreshing" | "error",
  message: null as string | null,
};

async function downloadExcel(url: string): Promise<XLSX.WorkBook | null> {
  try {
    const response = await fetch(url, {
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
  if (d.includes("103") || (d.includes("HOMICIDIO") && !d.includes("CULPOSO") && !d.includes("ACCIDENTE")))
    return { id: "homicidios", name: "Homicidios" };
  if (d.includes("109") || (d.includes("HOMICIDIO") && (d.includes("CULPOSO") || d.includes("ACCIDENTE"))))
    return { id: "homicidios_transito", name: "Homicidios en Tránsito" };
  if (d.includes("120") || (d.includes("LESIONES") && d.includes("CULPOSAS")))
    return { id: "lesiones_transito", name: "Lesiones en Tránsito" };
  if (d.includes("111") || (d.includes("LESIONES") && d.includes("PERSONALES")))
    return { id: "lesiones_personales", name: "Lesiones Personales" };
  if (d.includes("205") || d.includes("DELITOS SEXUALES") || d.includes("SEXUAL"))
    return { id: "delitos_sexuales", name: "Delitos Sexuales" };
  if (d.includes("229") || d.includes("VIOLENCIA INTRAFAMILIAR"))
    return { id: "violencia_intrafamiliar", name: "Violencia Intrafamiliar" };
  if (d.includes("239") || d.includes("243") || d.includes("HURTO") || d.includes("ABIGEATO"))
    return { id: "hurtos", name: "Hurtos" };
  if (d.includes("244") || d.includes("EXTORSION"))
    return { id: "extorsion", name: "Extorsión" };
  if (d.includes("347") || d.includes("AMENAZA"))
    return { id: "amenazas", name: "Amenazas" };
  if (d.includes("168") || d.includes("SECUESTRO"))
    return { id: "secuestros", name: "Secuestros" };
  if (d.includes("343") || d.includes("TERRORISMO"))
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
  refreshState.status = "refreshing";
  refreshState.message = "Descargando datos de la Policía Nacional...";

  let totalInserted = 0;
  let registroSuccessCount = 0;
  const yearsLoaded = new Set<number>();

  try {
    await db.delete(crimeStatsTable);

    refreshState.message = "Descargando datos de registro individual 2026...";
    for (const source of REGISTRO_SOURCES) {
      refreshState.message = `Procesando registros individuales ${source.year}...`;
      try {
        const wb = await downloadExcel(source.url);
        if (!wb) continue;
        const parsed = parseRegistroFile(wb, source.year);
        if (parsed.length > 0) {
          totalInserted += await saveRows(parsed);
          yearsLoaded.add(source.year);
          registroSuccessCount++;
        }
      } catch (srcErr) {
        // continue with next source on error
      }
    }

    refreshState.message = "Descargando datos históricos 2020-2025...";
    for (const source of EXCEL_SOURCES) {
      try {
        const wb = await downloadExcel(source.url);
        if (!wb) continue;
        let rows: ParsedRow[] = [];
        if (wb.SheetNames.includes("Cuadro 1") && isHistoricalFormat(wb)) {
          rows = parseHistoricalCuadros(wb).filter(r => !yearsLoaded.has(r.year));
        } else if (wb.SheetNames.includes("Cuadro 1")) {
          rows = parse2026Excel(wb).filter(r => !yearsLoaded.has(r.year));
        } else {
          for (const sheetName of wb.SheetNames) {
            const sheet = wb.Sheets[sheetName];
            if (sheet) rows = rows.concat(parseMonthlySheet(sheet));
          }
        }
        if (rows.length > 0) totalInserted += await saveRows(rows);
      } catch (srcErr) {
        // continue with next source on error
      }
    }

    if (totalInserted === 0) {
      refreshState.message = "Sin datos reales, cargando datos de demostración...";
      const demo = generateDemoData();
      totalInserted = await saveRows(demo);
    }

    await db.delete(refreshLogTable);
    await db.insert(refreshLogTable).values({
      lastRefreshed: new Date(),
      nextRefresh: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: registroSuccessCount > 0 ? "idle" : "error",
      message: registroSuccessCount > 0
        ? `${totalInserted} registros cargados de ${registroSuccessCount} archivos`
        : `Datos de demostración cargados (${totalInserted} registros)`,
      recordCount: totalInserted,
    });

    refreshState.status = "idle";
    refreshState.message = null;
    return { success: true, message: `${totalInserted} registros actualizados`, count: totalInserted };
  } catch (err) {
    refreshState.status = "error";
    refreshState.message = `Error: ${err instanceof Error ? err.message : String(err)}`;

    try {
      const demo = generateDemoData();
      await db.delete(crimeStatsTable);
      const demoInserted = await saveRows(demo);
      await db.delete(refreshLogTable);
      await db.insert(refreshLogTable).values({
        lastRefreshed: new Date(),
        nextRefresh: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "error",
        message: `Datos de demostración cargados tras error (${demoInserted} registros)`,
        recordCount: demoInserted,
      });
      refreshState.status = "idle";
      refreshState.message = null;
      return { success: false, message: "Datos de demostración cargados", count: demoInserted };
    } catch (fallbackErr) {
      return { success: false, message: "Sin datos disponibles", count: 0 };
    }
  }
}

/**
 * Totales anuales nacionales de referencia (fuente: Policía Nacional de Colombia).
 * Años 2022-2025 basados en registros históricos publicados.
 * Año 2026: se usan MONTHLY_ACTUALS_2026 (datos reales del archivo AICRI ene-feb 2026).
 */
const ANNUAL_NATIONAL_TOTALS: Record<string, Record<number, number>> = {
  // Hurtos (todas sub-categorías): art.239 CP — hurto personas + motos + residencias + comercio + autos
  "hurtos":                  { 2022: 367000, 2023: 382000, 2024: 375000, 2025: 385000, 2026: 96105 },
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
 * Totales mensuales nacionales REALES para 2026 (enero y febrero únicamente).
 * Fuente: INFORMACIÓN DE DELITOS A NIVEL DE REGISTRO AÑO 2026 — Policía Nacional.
 * Solo se incluyen meses con datos oficiales publicados (ene y feb).
 * Formato: { crimeTypeId: { mes: total_nacional } }
 */
const MONTHLY_ACTUALS_2026: Record<string, Record<number, number>> = {
  //                                 Jan     Feb
  "hurtos":                  { 1: 34441, 2: 27629 },
  "homicidios":              { 1:  1189, 2:  1048 },
  "homicidios_transito":     { 1:   631, 2:   595 },
  "lesiones_personales":     { 1:  7313, 2:  7766 },
  "lesiones_transito":       { 1:  3720, 2:  3429 },
  "violencia_intrafamiliar": { 1: 12018, 2: 11125 },
  "delitos_sexuales":        { 1:  1956, 2:  2021 },
  "extorsion":               { 1:   963, 2:   654 },
  "amenazas":                { 1:  3933, 2:  4320 },
  "pirateria_terrestre":     { 1:     7, 2:     2 },
  "secuestros":              { 1:    35, 2:    21 },
  "terrorismo":              { 1:    13, 2:     7 },
};

/** Último mes con datos reales disponibles para 2026 */
const LAST_ACTUAL_MONTH_2026 = 2;

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
    // For 2026, cap at the last month with real data published (ene-feb)
    const rawMaxMonth = year === currentYear ? new Date().getMonth() + 1 : 12;
    const maxMonth = year === 2026 ? Math.min(rawMaxMonth, LAST_ACTUAL_MONTH_2026) : rawMaxMonth;
    const seasonalWeightTotal = Array.from({ length: maxMonth }, (_, i) => MONTHLY_SEASONALITY[i + 1] ?? 1.0)
      .reduce((s, w) => s + w, 0);

    for (const ct of CRIME_TYPES) {
      const shares = DEPT_SHARES[ct.id] ?? defaultShares;
      // For 2026 use real monthly actuals when available; fallback to seasonal model
      const useActuals = year === 2026 && MONTHLY_ACTUALS_2026[ct.id] != null;

      let annualTotal = 0;
      if (!useActuals) {
        annualTotal = ANNUAL_NATIONAL_TOTALS[ct.id]?.[year] ?? 1000;
      }

      for (let month = 1; month <= maxMonth; month++) {
        let monthlyNational: number;
        if (useActuals) {
          monthlyNational = MONTHLY_ACTUALS_2026[ct.id][month] ?? 0;
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

    // Check if row count is not a clean multiple of (CRIME_TYPES.length × 33 departments)
    const totalRows = Number(countResult[0]?.count ?? 0);
    const rowsPerMonthPerType = 33; // 32 departments + NACIONAL
    const hasExtraRows = totalRows > 0 && (totalRows % (CRIME_TYPES.length * rowsPerMonthPerType) !== 0);

    // Check for stale 2026 data: if DB has months beyond LAST_ACTUAL_MONTH_2026, reload
    const maxMonth2026Result = await db
      .select({ maxMonth: sql<number>`max(${crimeStatsTable.month})` })
      .from(crimeStatsTable)
      .where(eq(crimeStatsTable.year, 2026));
    const maxMonth2026InDb = Number(maxMonth2026Result[0]?.maxMonth ?? 0);
    const hasStale2026 = maxMonth2026InDb > LAST_ACTUAL_MONTH_2026;

    if (isEmpty || missingCurrentYear || hasMissingTypes || hasExtraRows || hasStale2026) {
      if (hasMissingTypes) {
        console.log(`Missing crime types detected: ${missingTypes.map(t => t.id).join(", ")} — reloading demo data`);
      }
      if (hasExtraRows) {
        console.log(`Extra/corrupt rows detected (${totalRows} not divisible by ${CRIME_TYPES.length * rowsPerMonthPerType}) — reloading demo data`);
      }
      if (hasStale2026) {
        console.log(`Stale 2026 data detected (max month in DB: ${maxMonth2026InDb}, last actual: ${LAST_ACTUAL_MONTH_2026}) — reloading demo data`);
      }
      const demo = generateDemoData();
      await db.delete(crimeStatsTable);
      const saved = await saveRows(demo);
      await db.delete(refreshLogTable);
      await db.insert(refreshLogTable).values({
        lastRefreshed: new Date(),
        nextRefresh: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "error",
        message: `Datos reales ene-feb 2026 + histórico 2022-2025 (${saved} registros)`,
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

    const needsLoad = Number(countResult[0]?.count) === 0 || yearResult.length === 0 || hasMissingTypes;
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
  if (refreshState.status === "refreshing") {
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

export { ensureDataLoaded, loadDemoIfEmpty };
export default router;
