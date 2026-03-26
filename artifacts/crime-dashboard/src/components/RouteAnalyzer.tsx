import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import {
  useGetCrimesByDepartment,
  useGetCrimeTypes,
} from "@workspace/api-client-react";
import { AlertTriangle, Shield, Truck, MapPin, ChevronRight, Navigation } from "lucide-react";

const GEO_URL =
  "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9064dd/colombia.geo.json";

/* ─── Palette ─── */
const E = {
  bg: "#070c15", panel: "#0c1220", border: "rgba(255,255,255,0.07)",
  cyan: "#00d4ff", amber: "#f59e0b", red: "#ef4444", emerald: "#10b981",
  orange: "#f97316", textDim: "rgba(255,255,255,0.45)",
};

/* ─────────────────────────────────────────────────────────────────
   PRINCIPALES CORREDORES DE CARGA EN COLOMBIA
   Basado en rutas nacionales y vías primarias de transporte pesado
   ───────────────────────────────────────────────────────────────── */
interface Corridor {
  id: string;
  name: string;
  shortName: string;
  via: string;          // Vía principal / ruta nacional
  departments: string[]; // Departamentos en orden de recorrido
  icon: string;
}

const CORRIDORS: Corridor[] = [
  {
    id: "bog-med",
    name: "Bogotá → Medellín",
    shortName: "Bog · Med",
    via: "Ruta 60 / Autopista Medellín",
    departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Caldas", "Antioquia"],
    icon: "🔴",
  },
  {
    id: "bog-cali",
    name: "Bogotá → Cali",
    shortName: "Bog · Cali",
    via: "Ruta 40 / Autopista Panamericana",
    departments: ["Bogotá D.C.", "Cundinamarca", "Tolima", "Quindío", "Valle del Cauca"],
    icon: "🟡",
  },
  {
    id: "bog-baq",
    name: "Bogotá → Barranquilla / Cartagena",
    shortName: "Bog · Costa",
    via: "Ruta del Sol (Ruta 45A)",
    departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Santander", "Bolívar", "Atlántico"],
    icon: "🔵",
  },
  {
    id: "bog-buc",
    name: "Bogotá → Bucaramanga",
    shortName: "Bog · Buc",
    via: "Ruta del Sol (Tramo I-II)",
    departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Santander"],
    icon: "🟢",
  },
  {
    id: "bog-cuc",
    name: "Bogotá → Cúcuta",
    shortName: "Bog · Cúcuta",
    via: "Ruta 45A / Ruta 55",
    departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Santander", "Norte de Santander"],
    icon: "🟤",
  },
  {
    id: "bog-vil",
    name: "Bogotá → Villavicencio / Llanos",
    shortName: "Bog · Llanos",
    via: "Ruta 40 / Vía al Llano",
    departments: ["Bogotá D.C.", "Cundinamarca", "Meta"],
    icon: "🟠",
  },
  {
    id: "bog-pas",
    name: "Bogotá → Pasto / Ipiales",
    shortName: "Bog · Sur",
    via: "Ruta 25 / Panamericana Sur",
    departments: ["Bogotá D.C.", "Cundinamarca", "Tolima", "Huila", "Cauca", "Nariño"],
    icon: "🟣",
  },
  {
    id: "med-baq",
    name: "Medellín → Barranquilla / Cartagena",
    shortName: "Med · Costa",
    via: "Ruta 62 / Troncal Occidental",
    departments: ["Antioquia", "Córdoba", "Sucre", "Bolívar", "Atlántico"],
    icon: "⚪",
  },
  {
    id: "med-cali",
    name: "Medellín → Cali",
    shortName: "Med · Cali",
    via: "Ruta 25 / Autopista del Café",
    departments: ["Antioquia", "Risaralda", "Quindío", "Valle del Cauca"],
    icon: "🔶",
  },
  {
    id: "cali-bue",
    name: "Cali → Buenaventura (Puerto)",
    shortName: "Cali · Puerto",
    via: "Ruta 40 / Vía Pacífico",
    departments: ["Valle del Cauca"],
    icon: "🔷",
  },
  {
    id: "bog-yop",
    name: "Bogotá → Yopal / Casanare",
    shortName: "Bog · Casanare",
    via: "Ruta 40 / Marginal del Llano",
    departments: ["Bogotá D.C.", "Cundinamarca", "Boyacá", "Casanare"],
    icon: "🟫",
  },
  {
    id: "baq-med",
    name: "Barranquilla → Bogotá (Ruta del Sol)",
    shortName: "Costa · Bog",
    via: "Ruta del Sol completa",
    departments: ["Atlántico", "Bolívar", "Cesar", "Santander", "Boyacá", "Cundinamarca", "Bogotá D.C."],
    icon: "⭐",
  },
];

/* ─── Normalize ─── */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[,.]/g, "").toLowerCase().trim();
}
const BOGOTA_ALIASES = new Set(["bogota dc", "bogota d.c.", "bogota", "santa fe de bogota"]);
function normKey(s: string): string {
  const n = normalize(s);
  return BOGOTA_ALIASES.has(n) ? "bogota dc" : n;
}
function normGeo(raw: string): string {
  const n = normalize(raw);
  return BOGOTA_ALIASES.has(n) ? "bogota dc" : n;
}

/* ─── Risk ─── */
function riskLevel(count: number): { label: string; color: string; bg: string } {
  if (count === 0)  return { label: "SIN DATOS",  color: "#6b7280", bg: "rgba(107,114,128,0.12)" };
  if (count < 5)    return { label: "BAJO",        color: E.emerald,  bg: "rgba(16,185,129,0.12)" };
  if (count < 20)   return { label: "MODERADO",    color: E.amber,    bg: "rgba(245,158,11,0.12)" };
  if (count < 60)   return { label: "ALTO",        color: E.orange,   bg: "rgba(249,115,22,0.12)" };
  return             { label: "CRÍTICO",     color: E.red,      bg: "rgba(239,68,68,0.12)"  };
}

function riskFill(count: number): string {
  if (count === 0)  return "#192438";
  if (count < 5)    return "#1a6a50";
  if (count < 20)   return "#c07a00";
  if (count < 60)   return "#c04000";
  return "#cc1000";
}

function overallRiskColor(total: number, depts: number): string {
  const avg = depts > 0 ? total / depts : 0;
  if (avg < 2)  return E.emerald;
  if (avg < 15) return E.amber;
  if (avg < 40) return E.orange;
  return E.red;
}

/* ─── Props ─── */
interface Props { dark?: boolean }

export function RouteAnalyzer({ dark = true }: Props) {
  const [selectedCorridor, setSelectedCorridor] = useState<Corridor | null>(null);
  const [hovered, setHovered] = useState<{ name: string; count: number; ex: number; ey: number } | null>(null);

  const panelBg   = dark ? E.panel       : "#ffffff";
  const textMain  = dark ? "#e2eaf4"     : "#1a2a3a";
  const textMuted = dark ? E.textDim     : "#64748b";
  const borderC   = dark ? E.border      : "rgba(0,0,0,0.07)";

  /* ── Fetch crime types → piratería ID ── */
  const { data: crimeTypesRaw = [] } = useGetCrimeTypes();
  const pirataId = useMemo(
    () => crimeTypesRaw.find((c: any) => normalize(c.name).includes("pirateria"))?.id,
    [crimeTypesRaw],
  );

  /* ── Fetch dept data filtered to piratería ── */
  const { data: deptDataRaw = [] } = useGetCrimesByDepartment({
    year: 2026,
    crimeType: pirataId ?? undefined,
  });

  /* Aggregate per dept */
  const pirataMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const row of deptDataRaw as any[]) {
      const k = normKey(row.department);
      m[k] = (m[k] ?? 0) + row.totalCount;
    }
    return m;
  }, [deptDataRaw]);

  /* Route departments set */
  const routeSet = useMemo(() => {
    if (!selectedCorridor) return new Set<string>();
    return new Set(selectedCorridor.departments.map(d => normKey(d)));
  }, [selectedCorridor]);

  /* Total route stats */
  const routeStats = useMemo(() => {
    if (!selectedCorridor) return { total: 0, avg: 0 };
    const total = selectedCorridor.departments.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0);
    return { total, avg: total / selectedCorridor.departments.length };
  }, [selectedCorridor, pirataMap]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

      {/* ── Header ── */}
      <div style={{
        background: dark ? "linear-gradient(135deg, #0c1628 0%, #0e1f38 100%)" : "linear-gradient(135deg, #e8f4ff 0%, #dbeafe 100%)",
        border: `1px solid ${dark ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.15)"}`,
        borderRadius: "12px", padding: "16px 20px",
        display: "flex", alignItems: "center", gap: "14px",
      }}>
        <div style={{ width: 38, height: 38, borderRadius: "10px", background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Truck style={{ width: 18, height: 18, color: E.red }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: textMain }}>
            Análisis de Riesgo en Corredores de Carga — Piratería Terrestre 2026
          </div>
          <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>
            Seleccione un corredor vial para ver la exposición al riesgo por departamento
          </div>
        </div>
        {selectedCorridor && (
          <button
            onClick={() => setSelectedCorridor(null)}
            style={{ fontSize: "11px", color: textMuted, background: "transparent", border: `1px solid ${borderC}`, borderRadius: "6px", padding: "5px 10px", cursor: "pointer" }}
          >
            Cambiar ruta
          </button>
        )}
      </div>

      {/* ── Corridor selector ── */}
      {!selectedCorridor && (
        <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "16px 18px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: "12px" }}>
            Corredores Viales Principales de Carga
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px" }}>
            {CORRIDORS.map(corridor => {
              const total = corridor.departments.reduce((s, d) => s + (pirataMap[normKey(d)] ?? 0), 0);
              const risk  = riskLevel(total > 0 ? total / corridor.departments.length : 0);
              return (
                <button
                  key={corridor.id}
                  onClick={() => setSelectedCorridor(corridor)}
                  style={{
                    background: dark ? "rgba(255,255,255,0.02)" : "#f8fafc",
                    border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                    borderRadius: "8px", padding: "12px 14px", cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", gap: "10px",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = dark ? "rgba(0,212,255,0.06)" : "rgba(59,130,246,0.06)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = dark ? "rgba(0,212,255,0.25)" : "rgba(59,130,246,0.25)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = dark ? "rgba(255,255,255,0.02)" : "#f8fafc";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
                  }}
                >
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>{corridor.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: textMain, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {corridor.name}
                    </div>
                    <div style={{ fontSize: "10px", color: textMuted, marginTop: "2px" }}>{corridor.via}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", flexShrink: 0 }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, color: risk.color, background: risk.bg, padding: "2px 6px", borderRadius: "4px" }}>
                      {risk.label}
                    </span>
                    <span style={{ fontSize: "9px", color: textMuted }}>{corridor.departments.length} depts</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Route detail ── */}
      {selectedCorridor && (
        <>
          {/* Route breadcrumb */}
          <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <span style={{ fontSize: "18px" }}>{selectedCorridor.icon}</span>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: textMain }}>{selectedCorridor.name}</div>
                <div style={{ fontSize: "11px", color: textMuted }}>{selectedCorridor.via}</div>
              </div>
              {/* Overall risk badge */}
              {(() => {
                const risk = riskLevel(routeStats.avg);
                return (
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", background: risk.bg, border: `1px solid ${risk.color}40`, borderRadius: "8px", padding: "8px 14px" }}>
                    <AlertTriangle style={{ width: 14, height: 14, color: risk.color }} />
                    <div>
                      <div style={{ fontSize: "9px", color: textMuted, fontWeight: 600, letterSpacing: "0.08em" }}>RIESGO RUTA</div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: risk.color }}>
                        {risk.label} · {routeStats.total} casos
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            {/* Department chain */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
              <MapPin style={{ width: 11, height: 11, color: textMuted, flexShrink: 0 }} />
              {selectedCorridor.departments.map((dept, i) => (
                <div key={dept} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{
                    fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px",
                    color: i === 0 || i === selectedCorridor.departments.length - 1 ? E.cyan : textMain,
                    background: i === 0 || i === selectedCorridor.departments.length - 1 ? "rgba(0,212,255,0.1)" : "transparent",
                  }}>{dept}</span>
                  {i < selectedCorridor.departments.length - 1 && (
                    <ChevronRight style={{ width: 10, height: 10, color: textMuted }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Map + Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>

            {/* Map */}
            <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", overflow: "hidden", position: "relative" }}>
              <div style={{ padding: "12px 16px 0", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted }}>
                Mapa del Corredor
              </div>
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{ scale: 1800, center: [-73.5, 4.0] }}
                style={{ width: "100%", height: "360px", background: dark ? "#0a1220" : "#c0d8ee" }}
              >
                <Geographies geography={GEO_URL}>
                  {({ geographies }: { geographies: any[] }) =>
                    geographies.map((geo: any) => {
                      const rawName: string =
                        geo.properties.NOMBRE_DPT || geo.properties.DPTO_CNMBR ||
                        geo.properties.name || "";
                      const geoNorm = normGeo(rawName);
                      const onRoute = routeSet.has(geoNorm);
                      const count   = pirataMap[geoNorm] ?? 0;

                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={onRoute ? riskFill(count) : (dark ? "#131e2e" : "#c8d8e8")}
                          stroke={onRoute ? (dark ? "rgba(0,212,255,0.7)" : "rgba(59,130,246,0.7)") : (dark ? "rgba(40,80,140,0.3)" : "rgba(80,120,180,0.25)")}
                          strokeWidth={onRoute ? 1.8 : 0.5}
                          style={{
                            default: {
                              outline: "none",
                              filter: onRoute && count >= 60 && dark ? "drop-shadow(0 0 5px rgba(255,40,0,0.55))" : "none",
                            },
                            hover: { outline: "none", stroke: dark ? "rgba(200,220,255,0.9)" : "rgba(30,80,180,0.8)", strokeWidth: 1.8, cursor: "crosshair" },
                            pressed: { outline: "none" },
                          }}
                          onMouseEnter={(e: React.MouseEvent) => setHovered({ name: rawName, count, ex: e.clientX, ey: e.clientY })}
                          onMouseMove={(e: React.MouseEvent) => setHovered(prev => prev ? { ...prev, ex: e.clientX, ey: e.clientY } : prev)}
                          onMouseLeave={() => setHovered(null)}
                        />
                      );
                    })
                  }
                </Geographies>
              </ComposableMap>
              {/* Legend */}
              <div style={{ position: "absolute", bottom: 10, left: 10, background: dark ? "rgba(10,16,28,0.9)" : "rgba(240,247,255,0.9)", border: `1px solid ${borderC}`, borderRadius: "6px", padding: "6px 10px", backdropFilter: "blur(8px)" }}>
                {[
                  { label: "Crítico (≥60)", color: "#cc1000" },
                  { label: "Alto (20-59)",   color: "#c04000" },
                  { label: "Moderado (5-19)", color: "#c07a00" },
                  { label: "Bajo (<5)",      color: "#1a6a50" },
                ].map(({ label, color }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }}>
                    <div style={{ width: 9, height: 9, borderRadius: "2px", background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: "9px", color: textMuted }}>{label}</span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "4px", borderTop: `1px solid ${borderC}`, paddingTop: "4px" }}>
                  <div style={{ width: 9, height: 9, borderRadius: "2px", background: "#131e2e", border: "1.5px solid rgba(0,212,255,0.7)", flexShrink: 0 }} />
                  <span style={{ fontSize: "9px", color: E.cyan }}>En corredor</span>
                </div>
              </div>
            </div>

            {/* Risk per dept */}
            <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "14px 16px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: "12px" }}>
                Riesgo por Departamento
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "7px" }}>
                {selectedCorridor.departments.map((dept, i) => {
                  const count = pirataMap[normKey(dept)] ?? 0;
                  const risk  = riskLevel(count);
                  const isEnd = i === 0 || i === selectedCorridor.departments.length - 1;
                  const maxCount = Math.max(1, ...selectedCorridor.departments.map(d => pirataMap[normKey(d)] ?? 0));
                  const barPct   = Math.round((count / maxCount) * 100);
                  return (
                    <div key={dept} style={{
                      background: dark ? (isEnd ? "rgba(0,212,255,0.05)" : "rgba(255,255,255,0.02)") : (isEnd ? "rgba(59,130,246,0.05)" : "#f8fafc"),
                      border: `1px solid ${isEnd ? (dark ? "rgba(0,212,255,0.18)" : "rgba(59,130,246,0.18)") : borderC}`,
                      borderRadius: "8px", padding: "10px 12px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.18)", fontFamily: "monospace", flexShrink: 0 }}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: isEnd ? E.cyan : textMain, flex: 1 }}>
                          {dept}
                          {i === 0 && <span style={{ fontSize: "9px", marginLeft: "6px", color: E.cyan }}>ORIGEN</span>}
                          {i === selectedCorridor.departments.length - 1 && <span style={{ fontSize: "9px", marginLeft: "6px", color: E.cyan }}>DESTINO</span>}
                        </span>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: risk.color, background: risk.bg, padding: "2px 7px", borderRadius: "4px", flexShrink: 0 }}>
                          {risk.label}
                        </span>
                      </div>
                      {/* Bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, height: "4px", background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ width: `${barPct}%`, height: "100%", background: risk.color, borderRadius: "2px", transition: "width 0.4s" }} />
                        </div>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: risk.color, fontFamily: "IBM Plex Mono, monospace", flexShrink: 0, minWidth: "40px", textAlign: "right" }}>
                          {count}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${borderC}`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                {[
                  { label: "Departamentos", value: selectedCorridor.departments.length, color: E.cyan },
                  { label: "Total casos",   value: routeStats.total, color: overallRiskColor(routeStats.total, selectedCorridor.departments.length) },
                  { label: "Prom/depto",    value: routeStats.avg.toFixed(1), color: textMuted },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "16px", fontWeight: 800, color, fontFamily: "IBM Plex Mono, monospace" }}>{value}</div>
                    <div style={{ fontSize: "9px", fontWeight: 600, color: textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Hotspot alerts */}
          {routeStats.total > 0 && (() => {
            const hotspots = selectedCorridor.departments
              .map(d => ({ dept: d, count: pirataMap[normKey(d)] ?? 0 }))
              .filter(x => x.count >= 5)
              .sort((a, b) => b.count - a.count)
              .slice(0, 4);
            if (hotspots.length === 0) return null;
            return (
              <div style={{
                background: dark ? "rgba(239,68,68,0.05)" : "rgba(239,68,68,0.04)",
                border: `1px solid ${dark ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)"}`,
                borderRadius: "12px", padding: "16px 18px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: E.red }} />
                  <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: E.red }}>
                    Puntos Críticos en Este Corredor
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
                  {hotspots.map(({ dept, count }, i) => {
                    const risk = riskLevel(count);
                    const rec  = count >= 60 ? "⛔ Solicitar escolta" : count >= 20 ? "⚠ Evitar horario nocturno" : "📡 Monitorear trayecto";
                    return (
                      <div key={dept} style={{ background: dark ? "rgba(255,255,255,0.03)" : "#fff", border: `1px solid ${risk.color}30`, borderRadius: "8px", padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: "6px", alignItems: "baseline", marginBottom: "4px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 800, color: risk.color }}>#{i + 1}</span>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: textMain }}>{dept}</span>
                        </div>
                        <div style={{ fontSize: "20px", fontWeight: 800, color: risk.color, fontFamily: "IBM Plex Mono, monospace" }}>{count}</div>
                        <div style={{ fontSize: "10px", color: textMuted }}>casos piratería 2026</div>
                        <div style={{ marginTop: "6px", fontSize: "10px", fontWeight: 600, color: risk.color }}>{rec}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Low risk message */}
          {routeStats.total === 0 && (
            <div style={{ background: dark ? "rgba(16,185,129,0.06)" : "rgba(16,185,129,0.04)", border: `1px solid rgba(16,185,129,0.2)`, borderRadius: "12px", padding: "16px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
              <Shield style={{ width: 18, height: 18, color: E.emerald }} />
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: E.emerald }}>Corredor sin incidentes registrados</div>
                <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>No se registran casos de piratería terrestre en 2026 para este corredor. Mantener protocolos de seguridad estándar.</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: "fixed", left: hovered.ex + 14, top: hovered.ey - 10,
          zIndex: 9999, pointerEvents: "none",
          background: dark ? "rgba(10,18,30,0.97)" : "rgba(255,255,255,0.97)",
          border: `1px solid ${borderC}`, borderRadius: "8px",
          padding: "10px 14px", backdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)", minWidth: 155,
        }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: dark ? "#e2eaf4" : "#1a2a3a", marginBottom: "4px", textTransform: "capitalize" }}>
            {hovered.name.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())}
          </div>
          <div style={{ fontSize: "10px", color: textMuted }}>Piratería terrestre 2026:</div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: riskLevel(hovered.count).color, fontFamily: "monospace" }}>
            {hovered.count} casos
          </div>
        </div>
      )}
    </div>
  );
}
