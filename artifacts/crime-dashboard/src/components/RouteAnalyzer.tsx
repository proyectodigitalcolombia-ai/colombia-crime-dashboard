import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import {
  useGetCrimesByDepartment,
  useGetCrimeTypes,
} from "@workspace/api-client-react";
import { AlertTriangle, Shield, TrendingUp, MapPin, ArrowRight, Navigation } from "lucide-react";

const GEO_URL =
  "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9064dd/colombia.geo.json";

/* ─── Palette ─── */
const E = {
  bg: "#070c15", panel: "#0c1220", border: "rgba(255,255,255,0.07)",
  cyan: "#00d4ff", amber: "#f59e0b", red: "#ef4444", emerald: "#10b981",
  orange: "#f97316", textDim: "rgba(255,255,255,0.45)",
};

/* ─── Colombia department list ─── */
const ALL_DEPARTMENTS = [
  "Amazonas","Antioquia","Arauca","Atlántico","Bolívar","Boyacá","Caldas",
  "Caquetá","Casanare","Cauca","Cesar","Chocó","Córdoba","Cundinamarca",
  "Guainía","Guaviare","Huila","La Guajira","Magdalena","Meta","Nariño",
  "Norte de Santander","Putumayo","Quindío","Risaralda","San Andrés",
  "Santander","Sucre","Tolima","Valle del Cauca","Vaupés","Vichada",
  "Bogotá D.C.",
];

/* ─── Major road adjacency graph ─── */
const ROAD_GRAPH: Record<string, string[]> = {
  "La Guajira":          ["Cesar", "Magdalena"],
  "Cesar":               ["La Guajira", "Magdalena", "Norte de Santander", "Bolívar"],
  "Magdalena":           ["La Guajira", "Cesar", "Atlántico", "Bolívar"],
  "Atlántico":           ["Magdalena", "Bolívar"],
  "Bolívar":             ["Atlántico", "Magdalena", "Cesar", "Sucre", "Córdoba", "Antioquia", "Santander"],
  "Sucre":               ["Bolívar", "Córdoba"],
  "Córdoba":             ["Sucre", "Bolívar", "Antioquia"],
  "Norte de Santander":  ["Cesar", "Santander"],
  "Santander":           ["Norte de Santander", "Bolívar", "Boyacá", "Antioquia", "Cundinamarca"],
  "Boyacá":              ["Santander", "Cundinamarca", "Casanare", "Arauca", "Caldas"],
  "Arauca":              ["Boyacá", "Casanare"],
  "Casanare":            ["Boyacá", "Cundinamarca", "Meta", "Arauca"],
  "Antioquia":           ["Córdoba", "Bolívar", "Santander", "Chocó", "Risaralda", "Caldas"],
  "Chocó":               ["Antioquia", "Risaralda", "Valle del Cauca"],
  "Caldas":              ["Antioquia", "Risaralda", "Tolima", "Boyacá", "Cundinamarca"],
  "Risaralda":           ["Antioquia", "Chocó", "Caldas", "Valle del Cauca", "Quindío"],
  "Quindío":             ["Risaralda", "Valle del Cauca", "Tolima"],
  "Valle del Cauca":     ["Quindío", "Risaralda", "Chocó", "Tolima", "Cauca"],
  "Cundinamarca":        ["Boyacá", "Santander", "Caldas", "Tolima", "Meta", "Huila", "Bogotá D.C."],
  "Bogotá D.C.":         ["Cundinamarca"],
  "Tolima":              ["Caldas", "Cundinamarca", "Huila", "Quindío", "Valle del Cauca"],
  "Meta":                ["Cundinamarca", "Boyacá", "Casanare", "Huila", "Caquetá"],
  "Huila":               ["Tolima", "Cundinamarca", "Meta", "Caquetá", "Cauca", "Nariño"],
  "Cauca":               ["Huila", "Nariño", "Valle del Cauca"],
  "Nariño":              ["Cauca", "Huila", "Putumayo"],
  "Caquetá":             ["Meta", "Huila", "Guaviare", "Putumayo"],
  "Putumayo":            ["Caquetá", "Nariño", "Amazonas"],
  "Guaviare":            ["Meta", "Caquetá"],
  "Amazonas":            ["Putumayo", "Caquetá"],
  "Vaupés":              ["Caquetá", "Guaviare"],
  "Guainía":             ["Vichada"],
  "Vichada":             ["Casanare", "Meta", "Guainía"],
  "San Andrés":          [],
};

/* ─── BFS path finder ─── */
function findRoute(start: string, end: string): string[] {
  if (!start || !end || start === end) return start ? [start] : [];
  const visited = new Set<string>();
  const queue: string[][] = [[start]];
  while (queue.length > 0) {
    const path = queue.shift()!;
    const node = path[path.length - 1];
    if (visited.has(node)) continue;
    visited.add(node);
    for (const neighbor of ROAD_GRAPH[node] ?? []) {
      const newPath = [...path, neighbor];
      if (neighbor === end) return newPath;
      queue.push(newPath);
    }
  }
  return [start]; // no path
}

/* ─── Normalize for matching API data ─── */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[,.]/g, "").toLowerCase().trim();
}
const BOGOTA_ALIASES = new Set(["bogota dc", "bogota d.c.", "bogota", "santa fe de bogota"]);
function normKey(s: string): string {
  const n = normalize(s);
  return BOGOTA_ALIASES.has(n) ? "bogota dc" : n;
}

/* ─── Risk level ─── */
function riskLevel(count: number): { label: string; color: string; bg: string } {
  if (count === 0)    return { label: "SIN DATOS",  color: "#6b7280", bg: "rgba(107,114,128,0.12)" };
  if (count < 10)     return { label: "BAJO",        color: E.emerald,  bg: "rgba(16,185,129,0.12)" };
  if (count < 50)     return { label: "MODERADO",    color: E.amber,    bg: "rgba(245,158,11,0.12)" };
  if (count < 150)    return { label: "ALTO",         color: E.orange,   bg: "rgba(249,115,22,0.12)" };
  return               { label: "CRÍTICO",     color: E.red,      bg: "rgba(239,68,68,0.12)"  };
}

function riskColor(count: number): string {
  if (count === 0)  return "#192438";
  if (count < 10)   return "#1a6a50";
  if (count < 50)   return "#c07a00";
  if (count < 150)  return "#c04000";
  return "#cc1000";
}

/* ─── GeoJSON name → normalized ─── */
function normGeo(raw: string): string {
  const n = normalize(raw);
  if (BOGOTA_ALIASES.has(n)) return "bogota dc";
  return n;
}

/* ─── Select component ─── */
function DeptSelect({ value, onChange, exclude, placeholder, dark }:
  { value: string; onChange: (v: string) => void; exclude?: string; placeholder: string; dark: boolean }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: dark ? "rgba(255,255,255,0.05)" : "#fff",
        color: dark ? "rgba(255,255,255,0.85)" : "#1e293b",
        border: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)"}`,
        borderRadius: "8px", padding: "8px 12px", fontSize: "13px", fontWeight: 500,
        cursor: "pointer", minWidth: "200px", outline: "none",
        appearance: "none",
      }}
    >
      <option value="">{placeholder}</option>
      {ALL_DEPARTMENTS.filter(d => d !== exclude).map(d => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );
}

/* ─── Props ─── */
interface Props { dark?: boolean }

export function RouteAnalyzer({ dark = true }: Props) {
  const [origin, setOrigin]           = useState("");
  const [destination, setDestination] = useState("");
  const [hovered, setHovered]         = useState<{ name: string; count: number; ex: number; ey: number } | null>(null);

  /* Fetch data */
  const { data: crimeTypesRaw = [] } = useGetCrimeTypes();
  const pirataType = useMemo(
    () => crimeTypesRaw.find(c => normalize(c.name).includes("pirateria") || normalize(c.name).includes("piratería")),
    [crimeTypesRaw],
  );

  const { data: deptDataRaw = [] } = useGetCrimesByDepartment({
    year: 2026,
    crimeType: pirataType?.id ?? undefined,
  });

  /* Aggregate piratería terrestre per department */
  const pirataMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const row of deptDataRaw) {
      const k = normKey(row.department);
      m[k] = (m[k] ?? 0) + row.totalCount;
    }
    return m;
  }, [deptDataRaw]);

  /* Compute route */
  const route = useMemo<string[]>(() => {
    if (!origin || !destination) return [];
    return findRoute(origin, destination);
  }, [origin, destination]);

  const routeSet = useMemo(() => new Set(route.map(d => normalize(d))), [route]);

  /* Total route risk */
  const totalRouteCount = useMemo(
    () => route.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0),
    [route, pirataMap],
  );
  const routeRisk = riskLevel(route.length > 0 ? totalRouteCount : 0);

  /* Palette */
  const panelBg    = dark ? E.panel       : "#ffffff";
  const textMain   = dark ? "#e2eaf4"     : "#1a2a3a";
  const textMuted  = dark ? E.textDim     : "#64748b";
  const borderC    = dark ? E.border      : "rgba(0,0,0,0.07)";
  const inputBg    = dark ? "rgba(255,255,255,0.05)" : "#f8fafc";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Header banner ── */}
      <div style={{
        background: dark ? "linear-gradient(135deg, #0c1628 0%, #0e1f38 100%)" : "linear-gradient(135deg, #e8f4ff 0%, #dbeafe 100%)",
        border: `1px solid ${dark ? "rgba(0,212,255,0.15)" : "rgba(59,130,246,0.2)"}`,
        borderRadius: "12px", padding: "18px 22px",
        display: "flex", alignItems: "center", gap: "14px",
      }}>
        <div style={{ width: 40, height: 40, borderRadius: "10px", background: dark ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Navigation style={{ width: 20, height: 20, color: E.red }} />
        </div>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: textMain, marginBottom: "3px" }}>
            Análisis de Riesgo por Ruta — Piratería Terrestre
          </div>
          <div style={{ fontSize: "12px", color: textMuted }}>
            Seleccione origen y destino para calcular la exposición al riesgo de piratería terrestre en cada departamento del corredor vial.
          </div>
        </div>
      </div>

      {/* ── Route selector ── */}
      <div style={{
        background: panelBg, border: `1px solid ${borderC}`,
        borderRadius: "12px", padding: "20px 22px",
      }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: "14px" }}>
          Definir Ruta
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={{ fontSize: "10px", fontWeight: 600, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Origen</span>
            <DeptSelect value={origin} onChange={setOrigin} exclude={destination} placeholder="Seleccionar origen..." dark={dark} />
          </div>
          <ArrowRight style={{ width: 18, height: 18, color: textMuted, flexShrink: 0, marginTop: "18px" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={{ fontSize: "10px", fontWeight: 600, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Destino</span>
            <DeptSelect value={destination} onChange={setDestination} exclude={origin} placeholder="Seleccionar destino..." dark={dark} />
          </div>
          {route.length > 0 && (
            <div style={{
              marginLeft: "auto", marginTop: "18px",
              background: routeRisk.bg,
              border: `1px solid ${routeRisk.color}40`,
              borderRadius: "8px", padding: "8px 16px",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              <AlertTriangle style={{ width: 15, height: 15, color: routeRisk.color }} />
              <div>
                <div style={{ fontSize: "10px", color: textMuted, fontWeight: 600, letterSpacing: "0.08em" }}>RIESGO TOTAL</div>
                <div style={{ fontSize: "14px", fontWeight: 800, color: routeRisk.color }}>{routeRisk.label} · {totalRouteCount} casos</div>
              </div>
            </div>
          )}
        </div>
        {route.length > 0 && (
          <div style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <MapPin style={{ width: 12, height: 12, color: textMuted, flexShrink: 0 }} />
            {route.map((dept, i) => (
              <div key={dept} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{
                  fontSize: "11px", fontWeight: 600,
                  color: i === 0 || i === route.length - 1 ? E.cyan : textMain,
                  padding: "2px 8px", borderRadius: "4px",
                  background: i === 0 || i === route.length - 1 ? "rgba(0,212,255,0.12)" : "transparent",
                }}>
                  {dept}
                </span>
                {i < route.length - 1 && <ArrowRight style={{ width: 10, height: 10, color: textMuted }} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Map + Risk cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

        {/* Map */}
        <div style={{
          background: panelBg, border: `1px solid ${borderC}`,
          borderRadius: "12px", overflow: "hidden", position: "relative",
          minHeight: "420px",
        }}>
          <div style={{ padding: "14px 18px 0", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted }}>
            Mapa de Riesgo Vial
          </div>
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: 1800, center: [-73.5, 4.0] }}
            style={{ width: "100%", height: "380px", background: dark ? "#0a1220" : "#c0d8ee" }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const rawName: string =
                    geo.properties.NOMBRE_DPT || geo.properties.DPTO_CNMBR ||
                    geo.properties.name || geo.properties.NAME_1 || "";
                  const geoNorm  = normGeo(rawName);
                  const dataKey  = BOGOTA_ALIASES.has(geoNorm) ? "bogota dc" : geoNorm;
                  const onRoute  = routeSet.has(geoNorm) || (BOGOTA_ALIASES.has(geoNorm) && routeSet.has("bogotá d.c.") || routeSet.has("bogota d.c."));
                  const count    = pirataMap[dataKey] ?? 0;

                  let fill: string;
                  let strokeW = 0.5;
                  let strokeColor = dark ? "rgba(60,100,160,0.4)" : "rgba(80,120,180,0.35)";

                  if (route.length === 0) {
                    // No route selected: show full piratería heat map
                    fill = riskColor(count);
                  } else if (onRoute) {
                    // On route: colored by risk
                    fill = riskColor(count);
                    strokeW = 2;
                    strokeColor = dark ? "rgba(0,212,255,0.8)" : "rgba(59,130,246,0.9)";
                  } else {
                    // Off route: dimmed
                    fill = dark ? "#131e2e" : "#c8d8e8";
                  }

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      style={{
                        default: { outline: "none" },
                        hover: {
                          outline: "none",
                          stroke: dark ? "rgba(200,220,255,0.9)" : "rgba(30,80,180,0.8)",
                          strokeWidth: 1.8,
                          cursor: "crosshair",
                        },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={(e: React.MouseEvent) => {
                        setHovered({ name: rawName, count, ex: e.clientX, ey: e.clientY });
                      }}
                      onMouseMove={(e: React.MouseEvent) => {
                        setHovered(prev => prev ? { ...prev, ex: e.clientX, ey: e.clientY } : prev);
                      }}
                      onMouseLeave={() => setHovered(null)}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>

          {/* Map legend */}
          <div style={{
            position: "absolute", bottom: 12, left: 12,
            background: dark ? "rgba(10,16,28,0.9)" : "rgba(240,247,255,0.9)",
            border: `1px solid ${borderC}`, borderRadius: "6px",
            padding: "6px 10px", backdropFilter: "blur(8px)",
          }}>
            {[
              { label: "Crítico (≥150)", color: "#cc1000" },
              { label: "Alto (50-149)",  color: "#c04000" },
              { label: "Moderado (10-49)", color: "#c07a00" },
              { label: "Bajo (<10)",     color: "#1a6a50" },
              { label: "Sin datos",      color: "#192438" },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }}>
                <div style={{ width: 9, height: 9, borderRadius: "2px", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: "9px", color: textMuted }}>{label}</span>
              </div>
            ))}
            {route.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "4px", borderTop: `1px solid ${borderC}`, paddingTop: "4px" }}>
                <div style={{ width: 9, height: 9, borderRadius: "2px", background: "#131e2e", border: "2px solid rgba(0,212,255,0.8)", flexShrink: 0 }} />
                <span style={{ fontSize: "9px", color: E.cyan }}>En ruta</span>
              </div>
            )}
          </div>
        </div>

        {/* Risk cards per department */}
        <div style={{
          background: panelBg, border: `1px solid ${borderC}`,
          borderRadius: "12px", padding: "14px 18px",
          display: "flex", flexDirection: "column", gap: "0",
        }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: "14px" }}>
            Riesgo por Tramo
          </div>

          {route.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "40px 0" }}>
              <Shield style={{ width: 36, height: 36, color: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} />
              <div style={{ fontSize: "13px", color: textMuted, textAlign: "center" }}>
                Seleccione origen y destino<br />para ver el análisis de riesgo
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "360px" }}>
              {route.map((dept, i) => {
                const count = pirataMap[normKey(dept)] ?? 0;
                const risk  = riskLevel(count);
                const isEndpoint = i === 0 || i === route.length - 1;
                return (
                  <div key={dept} style={{
                    background: dark ? (isEndpoint ? "rgba(0,212,255,0.06)" : "rgba(255,255,255,0.02)") : (isEndpoint ? "rgba(59,130,246,0.06)" : "#f8fafc"),
                    border: `1px solid ${isEndpoint ? (dark ? "rgba(0,212,255,0.2)" : "rgba(59,130,246,0.2)") : borderC}`,
                    borderRadius: "8px", padding: "10px 14px",
                    display: "flex", alignItems: "center", gap: "10px",
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: dark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)", fontFamily: "monospace", flexShrink: 0, width: "20px" }}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: isEndpoint ? E.cyan : textMain, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {dept}
                        {i === 0 && <span style={{ fontSize: "9px", marginLeft: "6px", color: E.cyan, fontWeight: 600 }}>ORIGEN</span>}
                        {i === route.length - 1 && <span style={{ fontSize: "9px", marginLeft: "6px", color: E.cyan, fontWeight: 600 }}>DESTINO</span>}
                      </div>
                      <div style={{ fontSize: "10px", color: textMuted, marginTop: "1px" }}>
                        {count > 0 ? `${count.toLocaleString("es-CO")} casos de piratería` : "Sin incidentes registrados"}
                      </div>
                    </div>
                    <div style={{
                      padding: "3px 10px", borderRadius: "5px",
                      background: risk.bg, flexShrink: 0,
                    }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: risk.color, letterSpacing: "0.06em" }}>
                        {risk.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Route summary */}
          {route.length > 0 && (
            <div style={{
              marginTop: "14px", paddingTop: "14px",
              borderTop: `1px solid ${borderC}`,
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px",
            }}>
              {[
                { label: "Departamentos", value: route.length, color: E.cyan },
                { label: "Total casos",   value: totalRouteCount.toLocaleString("es-CO"), color: routeRisk.color },
                { label: "Nivel",         value: routeRisk.label, color: routeRisk.color },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "16px", fontWeight: 800, color, fontFamily: "IBM Plex Mono, monospace" }}>{value}</div>
                  <div style={{ fontSize: "9px", fontWeight: 600, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recommendations ── */}
      {route.length > 0 && totalRouteCount > 0 && (() => {
        const hotspots = route
          .map(d => ({ dept: d, count: pirataMap[normKey(d)] ?? 0 }))
          .filter(x => x.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
        if (hotspots.length === 0) return null;
        return (
          <div style={{
            background: dark ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.04)",
            border: `1px solid ${dark ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.15)"}`,
            borderRadius: "12px", padding: "18px 22px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <AlertTriangle style={{ width: 16, height: 16, color: E.red }} />
              <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: E.red }}>
                Zonas de Mayor Riesgo en Esta Ruta
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
              {hotspots.map(({ dept, count }, i) => {
                const risk = riskLevel(count);
                return (
                  <div key={dept} style={{
                    background: dark ? "rgba(255,255,255,0.03)" : "#fff",
                    border: `1px solid ${risk.color}30`,
                    borderRadius: "8px", padding: "12px 14px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 800, color: risk.color }}>#{i + 1}</span>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: textMain }}>{dept}</span>
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: risk.color, fontFamily: "IBM Plex Mono, monospace" }}>
                      {count.toLocaleString("es-CO")}
                    </div>
                    <div style={{ fontSize: "10px", color: textMuted }}>casos de piratería terrestre</div>
                    <div style={{ marginTop: "6px", fontSize: "10px", color: risk.color, fontWeight: 700 }}>
                      ⚠ {count >= 150 ? "Solicitar escolta" : count >= 50 ? "Evitar horario nocturno" : "Monitorear"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: "fixed", left: hovered.ex + 14, top: hovered.ey - 10,
          zIndex: 9999, pointerEvents: "none",
          background: dark ? "rgba(10,18,30,0.97)" : "rgba(255,255,255,0.97)",
          border: `1px solid ${borderC}`, borderRadius: "8px",
          padding: "10px 14px", backdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)", minWidth: 160,
        }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: dark ? "#e2eaf4" : "#1a2a3a", marginBottom: "5px", textTransform: "capitalize" }}>
            {hovered.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
          </div>
          <div style={{ fontSize: "11px", color: dark ? E.textDim : "#64748b" }}>Piratería terrestre:</div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: riskLevel(hovered.count).color, fontFamily: "monospace" }}>
            {hovered.count.toLocaleString("es-CO")} casos
          </div>
        </div>
      )}
    </div>
  );
}
