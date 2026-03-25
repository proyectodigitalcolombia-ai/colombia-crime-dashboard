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
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as unknown[][];

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

async function refreshData(): Promise<{ success: boolean; message: string; count: number }> {
  refreshState.status = "refreshing";
  refreshState.message = "Descargando datos de la Policía Nacional...";

  let allRows: ParsedRow[] = [];
  let registroSuccessCount = 0;
  const yearsLoaded = new Set<number>();

  refreshState.message = "Descargando datos de registro individual 2026...";

  for (const source of REGISTRO_SOURCES) {
    refreshState.message = `Procesando registros individuales ${source.year}...`;
    const wb = await downloadExcel(source.url);
    if (!wb) continue;
    const parsed = parseRegistroFile(wb, source.year);
    if (parsed.length > 0) {
      allRows = allRows.concat(parsed);
      yearsLoaded.add(source.year);
      registroSuccessCount++;
    }
  }

  refreshState.message = "Descargando datos históricos 2020-2025...";
  for (const source of EXCEL_SOURCES) {
    const wb = await downloadExcel(source.url);
    if (!wb) continue;
    if (wb.SheetNames.includes("Cuadro 1") && isHistoricalFormat(wb)) {
      const historicalRows = parseHistoricalCuadros(wb);
      const filteredHistorical = historicalRows.filter(r => !yearsLoaded.has(r.year));
      allRows = allRows.concat(filteredHistorical);
    } else if (wb.SheetNames.includes("Cuadro 1")) {
      const rows2026 = parse2026Excel(wb);
      const filtered2026 = rows2026.filter(r => !yearsLoaded.has(r.year));
      allRows = allRows.concat(filtered2026);
    } else {
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;
        allRows = allRows.concat(parseMonthlySheet(sheet));
      }
    }
  }

  if (allRows.length === 0) {
    refreshState.status = "error";
    refreshState.message = "No se pudieron obtener datos. Generando datos de demostración.";

    allRows = generateDemoData();
  }

  if (allRows.length > 0) {
    await db.delete(crimeStatsTable);

    const BATCH = 500;
    for (let i = 0; i < allRows.length; i += BATCH) {
      const batch = allRows.slice(i, i + BATCH);
      await db.insert(crimeStatsTable).values(batch);
    }

    await db.delete(refreshLogTable);
    await db.insert(refreshLogTable).values({
      lastRefreshed: new Date(),
      nextRefresh: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: registroSuccessCount > 0 ? "idle" : "error",
      message: registroSuccessCount > 0
        ? `${allRows.length} registros cargados de ${registroSuccessCount} archivos de registro`
        : "Datos de demostración cargados (fuente no disponible)",
      recordCount: allRows.length,
    });

    refreshState.status = "idle";
    refreshState.message = null;
    return { success: true, message: `${allRows.length} registros actualizados`, count: allRows.length };
  }

  refreshState.status = "error";
  refreshState.message = "No se pudo obtener ningún dato";
  return { success: false, message: "Sin datos disponibles", count: 0 };
}

function generateDemoData(): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const departments = [
    "Bogotá D.C.", "Antioquia", "Valle del Cauca", "Cundinamarca", "Santander",
    "Atlántico", "Bolívar", "Nariño", "Córdoba", "Tolima", "Cauca", "Huila",
    "Magdalena", "Meta", "Cesar", "Risaralda", "Sucre", "Norte de Santander",
    "Boyacá", "Caldas", "Chocó", "Arauca", "Casanare", "Caquetá", "Putumayo",
    "La Guajira", "Quindío", "Vichada", "Guainía", "Vaupés", "Amazonas", "Guaviare",
  ];

  const baseCounts: Record<string, Record<string, number>> = {
    "homicidios": { "Bogotá D.C.": 450, "Antioquia": 520, "Valle del Cauca": 480 },
    "hurtos": { "Bogotá D.C.": 8500, "Antioquia": 6200, "Valle del Cauca": 5100 },
    "violencia_intrafamiliar": { "Bogotá D.C.": 2200, "Antioquia": 1800, "Valle del Cauca": 1400 },
    "lesiones_personales": { "Bogotá D.C.": 3200, "Antioquia": 2800, "Valle del Cauca": 2100 },
  };

  for (const year of [2022, 2023, 2024, 2025]) {
    for (const ct of CRIME_TYPES) {
      for (let month = 1; month <= 12; month++) {
        let nationalCount = 0;
        departments.forEach((dept) => {
          const base = baseCounts[ct.id]?.[dept] ??
            Math.round(Math.random() * 200 + 10);
          const variation = 0.8 + Math.random() * 0.4;
          const yearFactor = 1 + (year - 2022) * 0.05;
          const monthFactor = month === 12 || month === 1 ? 1.15 : 1;
          const count = Math.round(base * variation * yearFactor * monthFactor / 12);
          nationalCount += count;
          rows.push({ year, month, crimeTypeId: ct.id, crimeTypeName: ct.name, department: dept, count });
        });
        rows.push({ year, month, crimeTypeId: ct.id, crimeTypeName: ct.name, department: "NACIONAL", count: nationalCount });
      }
    }
  }

  return rows;
}

let refreshInProgress = false;

async function ensureDataLoaded() {
  const count = await db
    .select({ count: sql<number>`count(*)` })
    .from(crimeStatsTable);
  if (Number(count[0]?.count) === 0 && !refreshInProgress) {
    refreshInProgress = true;
    refreshData().finally(() => { refreshInProgress = false; });
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
    res.json([2022, 2023, 2024, 2025]);
  }
});

router.get("/crimes/national-monthly", async (req, res) => {
  try {
    await ensureDataLoaded();
    const yearParam = req.query["year"] as string | undefined;
    const crimeTypeParam = req.query["crimeType"] as string | undefined;

    const conditions = [eq(crimeStatsTable.department, "NACIONAL")];
    if (yearParam) {
      const yr = parseInt(yearParam);
      if (!isNaN(yr)) conditions.push(eq(crimeStatsTable.year, yr));
    }
    if (crimeTypeParam) {
      conditions.push(eq(crimeStatsTable.crimeTypeId, crimeTypeParam));
    }

    const rows = await db
      .select()
      .from(crimeStatsTable)
      .where(sql`${crimeStatsTable.department} = 'NACIONAL'${yearParam ? sql` AND ${crimeStatsTable.year} = ${parseInt(yearParam)}` : sql``}${crimeTypeParam ? sql` AND ${crimeStatsTable.crimeTypeId} = ${crimeTypeParam}` : sql``}`)
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

  res.json({
    lastRefreshed: null,
    nextRefresh: null,
    status: "refreshing",
    message: "Actualización iniciada",
    recordCount: 0,
  });
});

export { ensureDataLoaded };
export default router;
