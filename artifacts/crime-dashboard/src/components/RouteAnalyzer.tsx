import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { useGetCrimesByDepartment, useGetCrimeTypes } from "@workspace/api-client-react";
import { AlertTriangle, Shield, Truck, MapPin, ChevronRight, Moon, Radio, CloudRain, Users } from "lucide-react";

const GEO_URL =
  "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9064dd/colombia.geo.json";

const E = {
  bg: "#070c15", panel: "#0c1220", border: "rgba(255,255,255,0.07)",
  cyan: "#00d4ff", amber: "#f59e0b", red: "#ef4444", emerald: "#10b981",
  orange: "#f97316", purple: "#a855f7", textDim: "rgba(255,255,255,0.45)",
};

/* ══════════════════════════════════════════════════════════════════
   FACTORES DE RIESGO ADICIONALES POR DEPARTAMENTO
   Fuentes: INVIAS, FIP, OCHA Colombia, operadores de telecomunicaciones
   ══════════════════════════════════════════════════════════════════ */

/** Riesgo nocturno: porcentaje estimado de incidentes en horario 22h-5h */
const NIGHT_RISK: Record<string, number> = {
  "Bogotá D.C.": 55,    "Cundinamarca": 70,   "Boyacá": 65,
  "Antioquia": 72,       "Caldas": 60,          "Risaralda": 58,
  "Quindío": 55,         "Valle del Cauca": 68, "Cauca": 75,
  "Nariño": 78,          "Tolima": 72,          "Huila": 68,
  "Meta": 80,            "Casanare": 75,        "Arauca": 82,
  "Santander": 65,       "Norte de Santander": 70, "Bolívar": 62,
  "Atlántico": 50,       "Córdoba": 65,         "Sucre": 60,
  "Cesar": 68,           "Magdalena": 65,       "La Guajira": 60,
  "Chocó": 75,           "Caquetá": 80,         "Putumayo": 82,
  "Guaviare": 78,        "Vichada": 70,         "Guainía": 65,
  "Vaupés": 70,          "Amazonas": 60,
};

/** Grupos armados ilegales: 0=sin presencia, 1=baja, 2=media, 3=alta */
const ARMED_GROUPS: Record<string, { level: number; groups: string[] }> = {
  "Bogotá D.C.":       { level: 0, groups: [] },
  "Cundinamarca":      { level: 1, groups: ["Disidencias FARC"] },
  "Boyacá":            { level: 1, groups: ["ELN"] },
  "Antioquia":         { level: 2, groups: ["Clan del Golfo", "Disidencias FARC"] },
  "Caldas":            { level: 1, groups: ["Disidencias FARC"] },
  "Risaralda":         { level: 1, groups: ["Disidencias FARC"] },
  "Quindío":           { level: 0, groups: [] },
  "Valle del Cauca":   { level: 2, groups: ["Disidencias FARC", "Clan del Golfo"] },
  "Cauca":             { level: 3, groups: ["Estado Mayor Central", "ELN"] },
  "Nariño":            { level: 3, groups: ["Estado Mayor Central", "ELN"] },
  "Tolima":            { level: 2, groups: ["Disidencias FARC"] },
  "Huila":             { level: 2, groups: ["Disidencias FARC"] },
  "Meta":              { level: 2, groups: ["Estado Mayor Central"] },
  "Casanare":          { level: 2, groups: ["Disidencias FARC"] },
  "Arauca":            { level: 3, groups: ["ELN", "Disidencias FARC"] },
  "Santander":         { level: 1, groups: ["ELN"] },
  "Norte de Santander":{ level: 2, groups: ["ELN", "Clan del Golfo"] },
  "Bolívar":           { level: 2, groups: ["Clan del Golfo", "ELN"] },
  "Atlántico":         { level: 1, groups: ["Clan del Golfo"] },
  "Córdoba":           { level: 3, groups: ["Clan del Golfo"] },
  "Sucre":             { level: 2, groups: ["Clan del Golfo"] },
  "Cesar":             { level: 2, groups: ["Clan del Golfo", "ELN"] },
  "Magdalena":         { level: 2, groups: ["Clan del Golfo"] },
  "La Guajira":        { level: 1, groups: ["Clan del Golfo"] },
  "Chocó":             { level: 3, groups: ["Clan del Golfo", "ELN"] },
  "Caquetá":           { level: 3, groups: ["Estado Mayor Central"] },
  "Putumayo":          { level: 3, groups: ["Estado Mayor Central"] },
  "Guaviare":          { level: 2, groups: ["Estado Mayor Central"] },
  "Vichada":           { level: 1, groups: ["Disidencias FARC"] },
  "Guainía":           { level: 1, groups: ["Disidencias FARC"] },
  "Vaupés":            { level: 1, groups: ["Disidencias FARC"] },
  "Amazonas":          { level: 0, groups: [] },
};

/** Cobertura de señal celular en vías principales: good/partial/poor */
const CELL_SIGNAL: Record<string, "good" | "partial" | "poor"> = {
  "Bogotá D.C.": "good",    "Cundinamarca": "good",   "Boyacá": "partial",
  "Antioquia": "good",       "Caldas": "partial",      "Risaralda": "good",
  "Quindío": "good",         "Valle del Cauca": "good","Cauca": "partial",
  "Nariño": "partial",       "Tolima": "partial",      "Huila": "partial",
  "Meta": "partial",         "Casanare": "partial",    "Arauca": "poor",
  "Santander": "good",       "Norte de Santander": "partial", "Bolívar": "partial",
  "Atlántico": "good",       "Córdoba": "partial",     "Sucre": "partial",
  "Cesar": "partial",        "Magdalena": "partial",   "La Guajira": "partial",
  "Chocó": "poor",           "Caquetá": "poor",        "Putumayo": "poor",
  "Guaviare": "poor",        "Vichada": "poor",        "Guainía": "poor",
  "Vaupés": "poor",          "Amazonas": "poor",
};

/** Condición vial y riesgos geológicos (deslizamientos, tramos críticos) */
const ROAD_CONDITION: Record<string, { score: "good" | "regular" | "difficult"; notes: string }> = {
  "Bogotá D.C.":       { score: "good",      notes: "Acceso urbano controlado" },
  "Cundinamarca":      { score: "regular",   notes: "Tramo La Vega: curvas y neblina" },
  "Boyacá":            { score: "regular",   notes: "Alto de Sote: deslizamientos en lluvias" },
  "Antioquia":         { score: "regular",   notes: "Túnel de Occidente: restricciones de altura" },
  "Caldas":            { score: "difficult", notes: "Vía Neira-Irra: derrumbes frecuentes" },
  "Risaralda":         { score: "good",      notes: "Doble calzada en buen estado" },
  "Quindío":           { score: "good",      notes: "Autopista del Café en buen estado" },
  "Valle del Cauca":   { score: "good",      notes: "Mayores desvíos en zonas rurales" },
  "Cauca":             { score: "difficult", notes: "Bloqueos frecuentes. Vía Popayán-Piendamó: alto riesgo" },
  "Nariño":            { score: "difficult", notes: "Vía Rumichaca: neblina y deslizamientos" },
  "Tolima":            { score: "regular",   notes: "Zona de Fresno: curvas pronunciadas" },
  "Huila":             { score: "regular",   notes: "Vía Neiva-Mocoa: tramos sin pavimentar" },
  "Meta":              { score: "good",      notes: "Llano abierto, atención en neblina de madrugada" },
  "Casanare":          { score: "regular",   notes: "Tramos sin doble calzada, vigilancia reducida" },
  "Arauca":            { score: "poor",      notes: "Vías en mal estado, sin doble calzada" } as any,
  "Santander":         { score: "good",      notes: "Ruta del Sol en buen estado general" },
  "Norte de Santander":{ score: "regular",   notes: "Tramo Cúcuta-Tibú: zona de conflicto" },
  "Bolívar":           { score: "regular",   notes: "Transición Mompox: barcazas en temporada seca" },
  "Atlántico":         { score: "good",      notes: "Acceso a puertos en buen estado" },
  "Córdoba":           { score: "regular",   notes: "Accesos rurales en mal estado en invierno" },
  "Sucre":             { score: "regular",   notes: "Inundaciones frecuentes en temporada" },
  "Cesar":             { score: "good",      notes: "Troncal del Caribe en buen estado" },
  "Magdalena":         { score: "regular",   notes: "Zona de Santa Marta: tráfico portuario alto" },
  "La Guajira":        { score: "regular",   notes: "Accesos secundarios sin pavimentar" },
  "Chocó":             { score: "difficult", notes: "Sin vías primarias pavimentadas en mayoría" },
  "Caquetá":           { score: "difficult", notes: "Vías en mal estado, lluvias frecuentes" },
  "Putumayo":          { score: "difficult", notes: "Tramos inestables, deslizamientos frecuentes" },
  "Guaviare":          { score: "difficult", notes: "Acceso principalmente fluvial o aéreo" },
  "Vichada":           { score: "difficult", notes: "Sin vías primarias" },
  "Guainía":           { score: "difficult", notes: "Sin vías primarias" },
  "Vaupés":            { score: "difficult", notes: "Sin vías terrestres principales" },
  "Amazonas":          { score: "difficult", notes: "Acceso fluvial/aéreo únicamente" },
};

/* ── Corredores ── */
interface Corridor {
  id: string; name: string; shortName: string; via: string;
  departments: string[]; icon: string;
}

const CORRIDORS: Corridor[] = [
  { id: "bog-med",  name: "Bogotá → Medellín",                shortName: "Bog · Med",    via: "Ruta 60 / Autopista Medellín",           departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Caldas", "Antioquia"],                        icon: "🔴" },
  { id: "bog-cali", name: "Bogotá → Cali",                   shortName: "Bog · Cali",   via: "Ruta 40 / Autopista Panamericana",       departments: ["Bogotá D.C.", "Cundinamarca", "Tolima", "Quindío", "Valle del Cauca"],                    icon: "🟡" },
  { id: "bog-baq",  name: "Bogotá → Barranquilla / Cartagena", shortName: "Bog · Costa",  via: "Ruta del Sol (Ruta 45A)",                departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Santander", "Bolívar", "Atlántico"],             icon: "🔵" },
  { id: "bog-buc",  name: "Bogotá → Bucaramanga",             shortName: "Bog · Buc",    via: "Ruta del Sol Tramo I-II",                departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Santander"],                                    icon: "🟢" },
  { id: "bog-cuc",  name: "Bogotá → Cúcuta",                  shortName: "Bog · Cúcuta", via: "Ruta 45A / Ruta 55",                     departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Santander", "Norte de Santander"],               icon: "🟤" },
  { id: "bog-vil",  name: "Bogotá → Villavicencio / Llanos",  shortName: "Bog · Llanos", via: "Ruta 40 / Vía al Llano",                 departments: ["Bogotá D.C.", "Cundinamarca", "Meta"],                                                   icon: "🟠" },
  { id: "bog-pas",  name: "Bogotá → Pasto / Ipiales",         shortName: "Bog · Sur",    via: "Ruta 25 / Panamericana Sur",             departments: ["Bogotá D.C.", "Cundinamarca", "Tolima", "Huila", "Cauca", "Nariño"],                      icon: "🟣" },
  { id: "med-baq",  name: "Medellín → Barranquilla",          shortName: "Med · Costa",  via: "Ruta 62 / Troncal Occidental",           departments: ["Antioquia", "Córdoba", "Sucre", "Bolívar", "Atlántico"],                                  icon: "⚪" },
  { id: "med-cali", name: "Medellín → Cali",                  shortName: "Med · Cali",   via: "Ruta 25 / Autopista del Café",           departments: ["Antioquia", "Risaralda", "Quindío", "Valle del Cauca"],                                   icon: "🔶" },
  { id: "cali-bue", name: "Cali → Buenaventura (Puerto)",     shortName: "Cali · Puerto",via: "Ruta 40 / Vía Pacífico",                 departments: ["Valle del Cauca"],                                                                        icon: "🔷" },
  { id: "bog-yop",  name: "Bogotá → Yopal / Casanare",        shortName: "Bog · Casanare",via: "Ruta 40 / Marginal del Llano",          departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Casanare"],                                      icon: "🟫" },
  { id: "baq-bog",  name: "Barranquilla → Bogotá",            shortName: "Costa · Bog",  via: "Ruta del Sol completa",                  departments: ["Atlántico", "Bolívar", "Cesar", "Santander", "Boyacá", "Cundinamarca", "Bogotá D.C."],    icon: "⭐" },
];

/* ── Helpers ── */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[,.]/g, "").toLowerCase().trim();
}
const BOGOTA_ALIASES = new Set(["bogota dc","bogota d.c.","bogota","santa fe de bogota"]);
function normKey(s: string): string { const n = normalize(s); return BOGOTA_ALIASES.has(n) ? "bogota dc" : n; }
function normGeo(raw: string): string { const n = normalize(raw); return BOGOTA_ALIASES.has(n) ? "bogota dc" : n; }

function pirataRisk(count: number): { label: string; color: string; bg: string } {
  if (count === 0)  return { label: "SIN DATOS",  color: "#6b7280", bg: "rgba(107,114,128,0.12)" };
  if (count < 5)    return { label: "BAJO",        color: E.emerald,  bg: "rgba(16,185,129,0.12)" };
  if (count < 20)   return { label: "MODERADO",    color: E.amber,    bg: "rgba(245,158,11,0.12)" };
  if (count < 60)   return { label: "ALTO",        color: E.orange,   bg: "rgba(249,115,22,0.12)" };
  return             { label: "CRÍTICO",     color: E.red,      bg: "rgba(239,68,68,0.12)" };
}
function pirataFill(count: number): string {
  if (count === 0)  return "#192438";
  if (count < 5)    return "#1a6a50";
  if (count < 20)   return "#c07a00";
  if (count < 60)   return "#c04000";
  return "#cc1000";
}

function nightLabel(pct: number): { label: string; color: string } {
  if (pct < 55) return { label: `${pct}% — Bajo`,      color: E.emerald };
  if (pct < 68) return { label: `${pct}% — Moderado`,  color: E.amber };
  if (pct < 78) return { label: `${pct}% — Alto`,      color: E.orange };
  return          { label: `${pct}% — Muy alto`,  color: E.red };
}
function armedLabel(level: number): { label: string; color: string } {
  if (level === 0) return { label: "Sin presencia",   color: E.emerald };
  if (level === 1) return { label: "Baja",            color: "#8bc34a" };
  if (level === 2) return { label: "Moderada",        color: E.amber };
  return            { label: "Alta",             color: E.red };
}
function signalLabel(s: "good"|"partial"|"poor"): { label: string; color: string } {
  if (s === "good")    return { label: "Buena cobertura",    color: E.emerald };
  if (s === "partial") return { label: "Cobertura parcial",  color: E.amber };
  return                { label: "Sin cobertura",       color: E.red };
}
function roadLabel(s: "good"|"regular"|"difficult"): { label: string; color: string } {
  if (s === "good")      return { label: "Buen estado",     color: E.emerald };
  if (s === "regular")   return { label: "Estado regular",  color: E.amber };
  return                  { label: "Difícil / cierre",  color: E.red };
}

/** Compute composite risk score (0-100) for a department — piratería, armed groups, night, road */
function compositeScore(dept: string, pirataCount: number): number {
  const pScore = Math.min(pirataCount / 80, 1) * 40;                      // 0-40
  const aScore = (ARMED_GROUPS[dept]?.level ?? 0) / 3 * 30;               // 0-30
  const nScore = ((NIGHT_RISK[dept] ?? 60) - 50) / 35 * 20;               // 0-20
  const rScore = ROAD_CONDITION[dept]?.score === "difficult" ? 10 : ROAD_CONDITION[dept]?.score === "regular" ? 5 : 0; // 0-10
  return Math.min(100, Math.round(pScore + aScore + nScore + rScore));
}
function compositeLabel(score: number): { label: string; color: string; bg: string } {
  if (score < 20) return { label: "BAJO",     color: E.emerald, bg: "rgba(16,185,129,0.12)" };
  if (score < 45) return { label: "MODERADO", color: E.amber,   bg: "rgba(245,158,11,0.12)" };
  if (score < 70) return { label: "ALTO",     color: E.orange,  bg: "rgba(249,115,22,0.12)" };
  return           { label: "CRÍTICO",  color: E.red,     bg: "rgba(239,68,68,0.12)"  };
}

/* ── Operational recommendations ── */
function buildRecommendations(corridor: Corridor, pirataMap: Record<string, number>): string[] {
  const recs: string[] = [];
  const nightMax  = Math.max(...corridor.departments.map(d => NIGHT_RISK[d] ?? 60));
  const armedMax  = Math.max(...corridor.departments.map(d => ARMED_GROUPS[d]?.level ?? 0));
  const roadDiff  = corridor.departments.some(d => ROAD_CONDITION[d]?.score === "difficult");
  const poorSig   = corridor.departments.some(d => CELL_SIGNAL[d] === "poor");
  const totalPirata = corridor.departments.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0);

  if (nightMax >= 75) recs.push("⛔ Evitar tránsito entre 10 PM y 5 AM — alta incidencia nocturna en este corredor");
  if (nightMax >= 60 && nightMax < 75) recs.push("⚠ Reducir velocidad y mantener comunicación constante en horario nocturno");
  if (armedMax >= 3) recs.push("🚨 Coordinar con la Policía Nacional antes de transitar — presencia alta de grupos armados");
  if (armedMax === 2) recs.push("📋 Registrar el despacho en la Policía de Carreteras (DIJIN) antes de salir");
  if (totalPirata >= 30) recs.push("🛡 Considerar escolta de seguridad privada para cargas de valor alto");
  if (totalPirata >= 10) recs.push("📡 Activar GPS con reporte en tiempo real y monitoreo desde centro de control");
  if (roadDiff) recs.push("🔧 Verificar condición vial con INVIAS antes del viaje — riesgo de cierres por derrumbes");
  if (poorSig) recs.push("📻 Llevar radio de comunicación — hay tramos sin cobertura celular en este corredor");
  if (recs.length === 0) recs.push("✅ Corredor de bajo riesgo compuesto. Mantener protocolos estándar de seguridad");
  return recs;
}

/* ── Props ── */
interface Props { dark?: boolean }

export function RouteAnalyzer({ dark = true }: Props) {
  const [selectedCorridor, setSelectedCorridor] = useState<Corridor | null>(null);
  const [activeView, setActiveView]             = useState<"pirateria" | "compuesto">("compuesto");
  const [hovered, setHovered]                   = useState<{ name: string; pirataCount: number; score: number; ex: number; ey: number } | null>(null);

  const panelBg   = dark ? E.panel   : "#ffffff";
  const textMain  = dark ? "#e2eaf4" : "#1a2a3a";
  const textMuted = dark ? E.textDim : "#64748b";
  const borderC   = dark ? E.border  : "rgba(0,0,0,0.07)";

  const { data: crimeTypesRaw = [] } = useGetCrimeTypes();
  const pirataId = useMemo(
    () => (crimeTypesRaw as any[]).find((c: any) => normalize(c.name).includes("pirateria"))?.id,
    [crimeTypesRaw],
  );
  const { data: deptDataRaw = [] } = useGetCrimesByDepartment({ year: 2026, crimeType: pirataId ?? undefined });

  const pirataMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const row of deptDataRaw as any[]) { const k = normKey(row.department); m[k] = (m[k] ?? 0) + row.totalCount; }
    return m;
  }, [deptDataRaw]);

  const routeSet = useMemo(() => !selectedCorridor ? new Set<string>() : new Set(selectedCorridor.departments.map(d => normKey(d))), [selectedCorridor]);

  const routeStats = useMemo(() => {
    if (!selectedCorridor) return { total: 0, avgScore: 0 };
    const total    = selectedCorridor.departments.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0);
    const avgScore = Math.round(selectedCorridor.departments.reduce((s, d) => s + compositeScore(d, pirataMap[normKey(d)] ?? 0), 0) / selectedCorridor.departments.length);
    return { total, avgScore };
  }, [selectedCorridor, pirataMap]);

  const recommendations = useMemo(() =>
    selectedCorridor ? buildRecommendations(selectedCorridor, pirataMap) : [],
    [selectedCorridor, pirataMap],
  );

  /* Corridor card risk for the grid */
  function corridorCardRisk(c: Corridor) {
    const total = c.departments.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0);
    const avg   = total / c.departments.length;
    return pirataRisk(avg);
  }

  /* Map fill based on active view */
  function getMapFill(dept: string, onRoute: boolean): string {
    if (!onRoute) return dark ? "#131e2e" : "#c8d8e8";
    const count = pirataMap[normKey(dept)] ?? 0;
    if (activeView === "pirateria") return pirataFill(count);
    const score = compositeScore(dept, count);
    if (score < 20) return "#1a6a50";
    if (score < 45) return "#c07a00";
    if (score < 70) return "#c04000";
    return "#cc1000";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Header */}
      <div style={{
        background: dark ? "linear-gradient(135deg, #0c1628,#0e1f38)" : "linear-gradient(135deg,#e8f4ff,#dbeafe)",
        border: `1px solid ${dark ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.15)"}`,
        borderRadius: "12px", padding: "14px 18px",
        display: "flex", alignItems: "center", gap: "12px",
      }}>
        <div style={{ width: 36, height: 36, borderRadius: "9px", background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Truck style={{ width: 17, height: 17, color: E.red }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: textMain }}>Gestión de Riesgo en Corredores de Carga — Colombia 2026</div>
          <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>
            Piratería terrestre · Grupos armados · Riesgo nocturno · Condición vial · Señal celular
          </div>
        </div>
        {selectedCorridor && (
          <button onClick={() => setSelectedCorridor(null)} style={{ fontSize: "11px", color: textMuted, background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", padding: "5px 10px", cursor: "pointer" }}>
            ← Cambiar ruta
          </button>
        )}
      </div>

      {/* ── CORRIDOR GRID ── */}
      {!selectedCorridor && (
        <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "14px 16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: "10px" }}>
            Seleccione un Corredor Vial
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))", gap: "7px" }}>
            {CORRIDORS.map(corridor => {
              const risk = corridorCardRisk(corridor);
              const armedMax = Math.max(...corridor.departments.map(d => ARMED_GROUPS[d]?.level ?? 0));
              const nightMax = Math.max(...corridor.departments.map(d => NIGHT_RISK[d] ?? 60));
              return (
                <button key={corridor.id} onClick={() => setSelectedCorridor(corridor)}
                  style={{ background: dark ? "rgba(255,255,255,0.02)" : "#f8fafc", border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, borderRadius: "8px", padding: "10px 12px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "9px", transition: "all 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = dark ? "rgba(0,212,255,0.06)" : "rgba(59,130,246,0.05)"; (e.currentTarget as HTMLElement).style.borderColor = dark ? "rgba(0,212,255,0.22)" : "rgba(59,130,246,0.22)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = dark ? "rgba(255,255,255,0.02)" : "#f8fafc"; (e.currentTarget as HTMLElement).style.borderColor = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"; }}
                >
                  <span style={{ fontSize: "16px", flexShrink: 0 }}>{corridor.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: textMain, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{corridor.name}</div>
                    <div style={{ fontSize: "10px", color: textMuted, marginTop: "1px" }}>{corridor.via}</div>
                    {/* Mini factor badges */}
                    <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
                      {armedMax >= 2 && <span style={{ fontSize: "8px", color: E.red,    background: "rgba(239,68,68,0.12)",    borderRadius: "3px", padding: "1px 5px", fontWeight: 700 }}>⚔ ARMADOS</span>}
                      {nightMax >= 75 && <span style={{ fontSize: "8px", color: E.amber,  background: "rgba(245,158,11,0.12)",  borderRadius: "3px", padding: "1px 5px", fontWeight: 700 }}>🌙 NOCTURNO</span>}
                      {corridor.departments.some(d => ROAD_CONDITION[d]?.score === "difficult") && <span style={{ fontSize: "8px", color: E.orange, background: "rgba(249,115,22,0.12)", borderRadius: "3px", padding: "1px 5px", fontWeight: 700 }}>🔧 VÍA</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px", flexShrink: 0 }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, color: risk.color, background: risk.bg, padding: "2px 6px", borderRadius: "4px" }}>{risk.label}</span>
                    <span style={{ fontSize: "9px", color: textMuted }}>{corridor.departments.length} depts</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ROUTE DETAIL ── */}
      {selectedCorridor && (() => {
        const overallScore = compositeLabel(routeStats.avgScore);
        return (
          <>
            {/* Route header + overall risk */}
            <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "16px" }}>{selectedCorridor.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: textMain }}>{selectedCorridor.name}</div>
                  <div style={{ fontSize: "10px", color: textMuted }}>{selectedCorridor.via}</div>
                </div>
                {/* Composite risk badge */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ background: overallScore.bg, border: `1px solid ${overallScore.color}40`, borderRadius: "7px", padding: "6px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: "9px", color: textMuted, fontWeight: 600, letterSpacing: "0.07em" }}>RIESGO COMPUESTO</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: overallScore.color }}>{overallScore.label} · {routeStats.avgScore}/100</div>
                  </div>
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "7px", padding: "6px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: "9px", color: textMuted, fontWeight: 600, letterSpacing: "0.07em" }}>PIRATERÍA 2026</div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: E.red }}>{routeStats.total} casos</div>
                  </div>
                </div>
              </div>
              {/* Dept chain */}
              <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                <MapPin style={{ width: 10, height: 10, color: textMuted, flexShrink: 0 }} />
                {selectedCorridor.departments.map((dept, i) => (
                  <div key={dept} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 7px", borderRadius: "3px", color: (i === 0 || i === selectedCorridor.departments.length - 1) ? E.cyan : textMain, background: (i === 0 || i === selectedCorridor.departments.length - 1) ? "rgba(0,212,255,0.1)" : "transparent" }}>{dept}</span>
                    {i < selectedCorridor.departments.length - 1 && <ChevronRight style={{ width: 9, height: 9, color: textMuted }} />}
                  </div>
                ))}
              </div>
            </div>

            {/* View toggle */}
            <div style={{ display: "flex", gap: "6px" }}>
              {([["compuesto", "🎯 Riesgo Compuesto"], ["pirateria", "🚛 Solo Piratería"]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setActiveView(id)} style={{ padding: "6px 14px", fontSize: "11px", fontWeight: 600, border: `1px solid ${activeView === id ? E.cyan : borderC}`, borderRadius: "7px", background: activeView === id ? "rgba(0,212,255,0.1)" : "transparent", color: activeView === id ? E.cyan : textMuted, cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Map + Table */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

              {/* Map */}
              <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", overflow: "hidden", position: "relative" }}>
                <div style={{ padding: "10px 14px 0", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted }}>Mapa del Corredor</div>
                <ComposableMap projection="geoMercator" projectionConfig={{ scale: 1800, center: [-73.5, 4.0] }} style={{ width: "100%", height: "340px", background: dark ? "#0a1220" : "#c0d8ee" }}>
                  <Geographies geography={GEO_URL}>
                    {({ geographies }: { geographies: any[] }) => geographies.map((geo: any) => {
                      const rawName: string = geo.properties.NOMBRE_DPT || geo.properties.DPTO_CNMBR || geo.properties.name || "";
                      const geoNorm = normGeo(rawName);
                      const onRoute = routeSet.has(geoNorm);
                      const count   = pirataMap[geoNorm] ?? 0;
                      const score   = compositeScore(rawName, count);
                      return (
                        <Geography key={geo.rsmKey} geography={geo}
                          fill={getMapFill(rawName, onRoute)}
                          stroke={onRoute ? "rgba(0,212,255,0.65)" : (dark ? "rgba(40,80,140,0.25)" : "rgba(80,120,180,0.2)")}
                          strokeWidth={onRoute ? 1.6 : 0.45}
                          style={{
                            default: { outline: "none", filter: onRoute && score >= 70 && dark ? "drop-shadow(0 0 5px rgba(255,40,0,0.5))" : "none" },
                            hover:   { outline: "none", stroke: "rgba(200,220,255,0.85)", strokeWidth: 1.8, cursor: "crosshair" },
                            pressed: { outline: "none" },
                          }}
                          onMouseEnter={(e: React.MouseEvent) => setHovered({ name: rawName, pirataCount: count, score, ex: e.clientX, ey: e.clientY })}
                          onMouseMove={(e: React.MouseEvent) => setHovered(prev => prev ? { ...prev, ex: e.clientX, ey: e.clientY } : prev)}
                          onMouseLeave={() => setHovered(null)}
                        />
                      );
                    })}
                  </Geographies>
                </ComposableMap>
                {/* Legend */}
                <div style={{ position: "absolute", bottom: 8, left: 8, background: dark ? "rgba(8,14,26,0.92)" : "rgba(240,247,255,0.92)", border: `1px solid ${borderC}`, borderRadius: "5px", padding: "5px 8px", backdropFilter: "blur(8px)" }}>
                  {[["#cc1000","Crítico"],["#c04000","Alto"],["#c07a00","Moderado"],["#1a6a50","Bajo"]].map(([color,label]) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "2px", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: "8px", color: textMuted }}>{label}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "3px", borderTop: `1px solid ${borderC}`, paddingTop: "3px" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "2px", background: "#131e2e", border: "1.5px solid rgba(0,212,255,0.65)", flexShrink: 0 }} />
                    <span style={{ fontSize: "8px", color: E.cyan }}>En corredor</span>
                  </div>
                </div>
              </div>

              {/* Per-dept risk matrix */}
              <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "0" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: "10px" }}>
                  Factores de Riesgo por Departamento
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", maxHeight: "320px" }}>
                  {selectedCorridor.departments.map((dept, i) => {
                    const count   = pirataMap[normKey(dept)] ?? 0;
                    const score   = compositeScore(dept, count);
                    const clabel  = compositeLabel(score);
                    const night   = nightLabel(NIGHT_RISK[dept] ?? 60);
                    const armed   = armedLabel(ARMED_GROUPS[dept]?.level ?? 0);
                    const signal  = signalLabel(CELL_SIGNAL[dept] ?? "partial");
                    const road    = roadLabel(ROAD_CONDITION[dept]?.score ?? "regular");
                    const isEnd   = i === 0 || i === selectedCorridor.departments.length - 1;
                    return (
                      <div key={dept} style={{ background: dark ? (isEnd ? "rgba(0,212,255,0.04)" : "rgba(255,255,255,0.02)") : (isEnd ? "rgba(59,130,246,0.04)" : "#f8fafc"), border: `1px solid ${isEnd ? "rgba(0,212,255,0.15)" : borderC}`, borderRadius: "7px", padding: "8px 10px" }}>
                        {/* Dept header */}
                        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>{String(i+1).padStart(2,"0")}</span>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: isEnd ? E.cyan : textMain, flex: 1 }}>
                            {dept}
                            {i === 0 && <span style={{ fontSize: "8px", marginLeft: "5px", color: E.cyan }}>ORIGEN</span>}
                            {i === selectedCorridor.departments.length - 1 && <span style={{ fontSize: "8px", marginLeft: "5px", color: E.cyan }}>DESTINO</span>}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 800, color: clabel.color, fontFamily: "monospace" }}>{score}</span>
                            <span style={{ fontSize: "9px", fontWeight: 700, color: clabel.color, background: clabel.bg, padding: "1px 6px", borderRadius: "4px" }}>{clabel.label}</span>
                          </div>
                        </div>
                        {/* Factor grid */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px" }}>
                          {[
                            { Icon: Truck,     label: "Piratería",   value: count > 0 ? `${count} casos` : "Sin datos", color: pirataRisk(count).color },
                            { Icon: Moon,      label: "Riesgo noche", value: night.label, color: night.color },
                            { Icon: Users,     label: "G. Armados",  value: armed.label, color: armed.color },
                            { Icon: Radio,     label: "Señal",       value: signal.label, color: signal.color },
                            { Icon: CloudRain, label: "Vía",         value: road.label,  color: road.color, span: true },
                          ].map(({ Icon, label, value, color, span }) => (
                            <div key={label} style={{ gridColumn: span ? "1 / -1" : undefined, background: dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.03)", borderRadius: "4px", padding: "4px 7px", display: "flex", alignItems: "center", gap: "5px" }}>
                              <Icon style={{ width: 10, height: 10, color, flexShrink: 0 }} />
                              <span style={{ fontSize: "9px", color: textMuted, flexShrink: 0 }}>{label}:</span>
                              <span style={{ fontSize: "9px", fontWeight: 600, color, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
                            </div>
                          ))}
                        </div>
                        {/* Armed group names */}
                        {(ARMED_GROUPS[dept]?.groups?.length ?? 0) > 0 && (
                          <div style={{ marginTop: "4px", fontSize: "9px", color: E.red, opacity: 0.8 }}>
                            ⚔ {ARMED_GROUPS[dept].groups.join(", ")}
                          </div>
                        )}
                        {/* Road notes */}
                        <div style={{ marginTop: "3px", fontSize: "9px", color: textMuted, opacity: 0.75 }}>
                          🛣 {ROAD_CONDITION[dept]?.notes}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Operational recommendations */}
            <div style={{ background: dark ? "rgba(168,85,247,0.06)" : "rgba(168,85,247,0.04)", border: `1px solid ${dark ? "rgba(168,85,247,0.2)" : "rgba(168,85,247,0.15)"}`, borderRadius: "12px", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <Shield style={{ width: 14, height: 14, color: E.purple }} />
                <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: E.purple }}>Recomendaciones Operacionales para Este Corredor</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {recommendations.map((rec, i) => (
                  <div key={i} style={{ fontSize: "12px", color: textMain, padding: "7px 10px", background: dark ? "rgba(255,255,255,0.02)" : "#f8fafc", border: `1px solid ${borderC}`, borderRadius: "6px" }}>
                    {rec}
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {/* Tooltip */}
      {hovered && (
        <div style={{ position: "fixed", left: hovered.ex + 14, top: hovered.ey - 10, zIndex: 9999, pointerEvents: "none", background: dark ? "rgba(8,14,26,0.97)" : "rgba(255,255,255,0.97)", border: `1px solid ${borderC}`, borderRadius: "8px", padding: "10px 13px", backdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", minWidth: 160 }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: dark ? "#e2eaf4" : "#1a2a3a", marginBottom: "6px", textTransform: "capitalize" }}>
            {hovered.name.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())}
          </div>
          {[
            { label: "Piratería 2026", value: `${hovered.pirataCount} casos`, color: pirataRisk(hovered.pirataCount).color },
            { label: "Riesgo compuesto", value: `${hovered.score}/100`, color: compositeLabel(hovered.score).color },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "3px" }}>
              <span style={{ fontSize: "10px", color: textMuted }}>{label}</span>
              <span style={{ fontSize: "11px", fontWeight: 700, color, fontFamily: "monospace" }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
