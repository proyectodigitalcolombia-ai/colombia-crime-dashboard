import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const SOURCE_URL =
  "https://www.policia.gov.co/sites/default/files/INFORMACI%C3%93N_DE_DELITOS_A_NIVEL_DE_REGISTRO_A%C3%91O_2026_4.xlsx";
const EXPECTED_MONTHS = [1, 2, 3, 4, 5];
const CRIME_TYPES = [
  "hurtos",
  "hurtos_personas",
  "hurtos_automotores",
  "hurtos_motocicletas",
  "hurtos_comercio",
  "homicidios",
  "homicidios_transito",
  "lesiones_personales",
  "lesiones_transito",
  "violencia_intrafamiliar",
  "delitos_sexuales",
  "extorsion",
  "amenazas",
  "pirateria_terrestre",
  "secuestros",
  "terrorismo",
];

function removeAccents(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function mapCrimeType(value) {
  const crime = removeAccents(value.toUpperCase());
  if (crime.includes("103") || (crime.includes("HOMICIDIO") && !crime.includes("CULPOSO") && !crime.includes("ACCIDENTE"))) return "homicidios";
  if (crime.includes("109") || (crime.includes("HOMICIDIO") && (crime.includes("CULPOSO") || crime.includes("ACCIDENTE")))) return "homicidios_transito";
  if (crime.includes("120") || (crime.includes("LESIONES") && crime.includes("CULPOSAS"))) return "lesiones_transito";
  if (crime.includes("111") || (crime.includes("LESIONES") && crime.includes("PERSONALES"))) return "lesiones_personales";
  if (crime.includes("205") || crime.includes("DELITOS SEXUALES") || crime.includes("SEXUAL")) return "delitos_sexuales";
  if (crime.includes("229") || crime.includes("VIOLENCIA INTRAFAMILIAR")) return "violencia_intrafamiliar";
  if (crime.includes("HURTO") && (crime.includes("AUTOMOTOR") || crime.includes("VEHICULO"))) return "hurtos_automotores";
  if (crime.includes("HURTO") && (crime.includes("MOTOCICLET") || crime.includes("MOTO"))) return "hurtos_motocicletas";
  if (crime.includes("HURTO") && (crime.includes("PERSONA") || crime.includes("ATRACO"))) return "hurtos_personas";
  if (crime.includes("HURTO") && (crime.includes("COMERCIO") || crime.includes("COMERCIAL") || crime.includes("ESTABLECIMIENTO") || crime.includes("NEGOCIO"))) return "hurtos_comercio";
  if (crime.includes("PIRATERIA TERRESTRE")) return "pirateria_terrestre";
  if (crime.includes("239") || crime.includes("243") || crime.includes("HURTO") || crime.includes("ABIGEATO")) return "hurtos";
  if (crime.includes("244") || crime.includes("EXTORSION")) return "extorsion";
  if (crime.includes("347") || crime.includes("AMENAZA")) return "amenazas";
  if (crime.includes("168") || crime.includes("SECUESTRO")) return "secuestros";
  if (crime.includes("343") || crime.includes("TERRORISMO")) return "terrorismo";
  return null;
}

function parseFallback(source) {
  const start = source.indexOf("const MONTHLY_ACTUALS_2026");
  const end = source.indexOf("const LAST_ACTUAL_MONTH_2026", start);
  if (start < 0 || end < 0) throw new Error("No se encontró el bloque MONTHLY_ACTUALS_2026");
  const monthlyBlock = source.slice(start, end);
  const fallback = {};
  for (const crimeType of CRIME_TYPES) {
    const match = monthlyBlock.match(new RegExp(`"${crimeType}"\\s*:\\s*\\{([^}]+)\\}`));
    if (!match) throw new Error(`No se encontró el respaldo para ${crimeType}`);
    fallback[crimeType] = Object.fromEntries(
      [...match[1].matchAll(/(\d+)\s*:\s*(\d+)/g)].map((entry) => [Number(entry[1]), Number(entry[2])]),
    );
  }
  return fallback;
}

function aggregateWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false, raw: false });
  const totals = Object.fromEntries(CRIME_TYPES.map((crimeType) => [crimeType, {}]));

  for (const row of rows.slice(1)) {
    const month = Number(String(row[7] ?? "").trim());
    const crime = String(row[6] ?? "").trim();
    const count = Number(String(row[8] ?? "1").replace(/[.,\s]/g, "")) || 1;
    if (!EXPECTED_MONTHS.includes(month) || !crime) continue;

    const crimeType = mapCrimeType(crime);
    if (!crimeType) continue;
    totals[crimeType][month] = (totals[crimeType][month] ?? 0) + count;

    const normalizedCrime = removeAccents(crime.toUpperCase());
    const isTheft = normalizedCrime.includes("HURTO") || normalizedCrime.includes("ABIGEATO");
    if (isTheft && crimeType !== "hurtos") {
      totals.hurtos[month] = (totals.hurtos[month] ?? 0) + count;
    }
  }

  return totals;
}

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`No se pudo descargar el Excel oficial: HTTP ${response.status}`);

const workbookTotals = aggregateWorkbook(Buffer.from(await response.arrayBuffer()));
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const routeSource = fs.readFileSync(path.join(scriptDir, "../src/routes/crimes.ts"), "utf8");
const fallbackTotals = parseFallback(routeSource);
const differences = [];

for (const crimeType of CRIME_TYPES) {
  for (const month of EXPECTED_MONTHS) {
    const official = workbookTotals[crimeType][month] ?? 0;
    const fallback = fallbackTotals[crimeType][month] ?? 0;
    if (official !== fallback) differences.push({ crimeType, month, official, fallback });
  }
}

if (differences.length > 0) {
  console.error(JSON.stringify(differences, null, 2));
  throw new Error(`El respaldo difiere del Excel oficial en ${differences.length} valores`);
}

console.log(`Validación correcta: ${CRIME_TYPES.length} tipos × ${EXPECTED_MONTHS.length} meses coinciden con el Excel oficial.`);