import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { DepartmentStats } from "@workspace/api-client-react";

const GEO_URL =
  "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9064dd/colombia.geo.json";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[,.]/g, "")
    .toLowerCase()
    .trim();
}

const GEOJSON_NAME_MAP: Record<string, string> = {
  "BOGOTÁ": "bogota dc",
  "BOGOTA": "bogota dc",
  "D.C.": "bogota dc",
};

function normalizeDeptGeo(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (GEOJSON_NAME_MAP[upper]) return GEOJSON_NAME_MAP[upper];
  return normalize(raw);
}

function normalizeDeptKey(raw: string): string {
  return normalize(raw)
    .replace(/\bd\.c\./g, "dc")
    .replace(/\s+/g, " ")
    .trim();
}

function interpolate(a: string, b: string, t: number): string {
  const hexRgb = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = hexRgb(a);
  const [br, bg, bb] = hexRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl2 = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl2})`;
}

function getIntensityColor(value: number, dark: boolean): string {
  if (value <= 0) return dark ? "#192438" : "#c5d5e8";
  const v = Math.max(0, Math.min(1, value));
  if (dark) {
    if (v < 0.25) return interpolate("#1a4e7a", "#1a8898", v / 0.25);
    if (v < 0.50) return interpolate("#1a8898", "#c07a00", (v - 0.25) / 0.25);
    if (v < 0.75) return interpolate("#c07a00", "#c82000", (v - 0.50) / 0.25);
    return                interpolate("#c82000", "#ff1a00", (v - 0.75) / 0.25);
  } else {
    if (v < 0.25) return interpolate("#90bcd0", "#4aa0b8", v / 0.25);
    if (v < 0.50) return interpolate("#4aa0b8", "#e09010", (v - 0.25) / 0.25);
    if (v < 0.75) return interpolate("#e09010", "#c02808", (v - 0.50) / 0.25);
    return                interpolate("#c02808", "#920000", (v - 0.75) / 0.25);
  }
}

function getThreatBadge(v: number, dark: boolean) {
  if (v < 0.15) return { label: "BAJO",     color: dark ? "#2a8060" : "#1a6040" };
  if (v < 0.40) return { label: "MODERADO", color: dark ? "#b08000" : "#8a6000" };
  if (v < 0.70) return { label: "ALTO",     color: dark ? "#c04000" : "#a03000" };
  return              { label: "CRÍTICO",   color: dark ? "#cc0000" : "#900000" };
}

interface Props {
  data: DepartmentStats[];
  dark?: boolean;
  blockadeCounts?: Record<string, number>;
}

export function ColombiaMap({ data, dark = false, blockadeCounts = {} }: Props) {
  const [hovered, setHovered] = useState<{
    name: string; count: number; value: number; blockades: number; ex: number; ey: number;
  } | null>(null);

  const valueMap = useMemo<Record<string, number>>(() => {
    const raw: Record<string, number> = {};
    for (const row of data) {
      const k = normalize(row.department);
      raw[k] = (raw[k] ?? 0) + row.totalCount;
    }
    const localMax = Math.max(1, ...Object.values(raw));
    const m: Record<string, number> = {};
    Object.entries(raw).forEach(([k, v]) => { m[k] = Math.cbrt(v / localMax); });
    return m;
  }, [data]);

  const rawTotals = useMemo<Record<string, number>>(() => {
    const raw: Record<string, number> = {};
    for (const row of data) {
      const k = normalize(row.department);
      raw[k] = (raw[k] ?? 0) + row.totalCount;
    }
    return raw;
  }, [data]);

  /* Normalize blockade counts keys for matching */
  const normalizedBlockadeCounts = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const [dept, count] of Object.entries(blockadeCounts)) {
      m[normalizeDeptKey(dept)] = count;
    }
    return m;
  }, [blockadeCounts]);

  const totalActiveBlockades = Object.values(blockadeCounts).reduce((s, n) => s + n, 0);

  const panelBg  = dark ? "rgba(10,18,30,0.95)" : "rgba(240,247,255,0.95)";
  const textMain = dark ? "#e2eaf4" : "#1a2a3a";
  const textSub  = dark ? "#6a8aaa" : "#4a6a8a";
  const borderC  = dark ? "rgba(80,130,200,0.25)" : "rgba(60,100,140,0.20)";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 1800, center: [-73.5, 4.0] }}
        style={{ width: "100%", height: "100%", background: dark ? "#0a1220" : "#d8e8f4" }}
      >
        <rect x={0} y={0} width="100%" height="100%" fill={dark ? "#0a1220" : "#c0d8ee"} />

        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map(geo => {
              const rawName: string =
                geo.properties.NOMBRE_DPT ||
                geo.properties.DPTO_CNMBR ||
                geo.properties.name ||
                geo.properties.NAME_1 ||
                "";
              const geoKey  = normalizeDeptGeo(rawName);
              const val     = valueMap[geoKey] ?? 0;
              const fill    = getIntensityColor(val, dark);
              const isHigh  = val >= 0.70;
              const rawCount = rawTotals[geoKey] ?? 0;
              const blockadeCount = normalizedBlockadeCounts[normalizeDeptKey(rawName)] ?? 0;
              const hasBlockade = blockadeCount > 0;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke={
                    hasBlockade
                      ? "#ec4899"
                      : dark ? "rgba(60,100,160,0.55)" : "rgba(80,120,180,0.40)"
                  }
                  strokeWidth={hasBlockade ? 2.0 : 0.6}
                  style={{
                    default: {
                      outline: "none",
                      filter: hasBlockade
                        ? "drop-shadow(0 0 6px rgba(236,72,153,0.7))"
                        : isHigh && dark ? "drop-shadow(0 0 4px rgba(255,40,0,0.5))" : "none",
                    },
                    hover: {
                      outline: "none",
                      fill: dark ? "rgba(255,255,255,0.18)" : "rgba(0,60,180,0.18)",
                      stroke: hasBlockade ? "#f472b6" : dark ? "rgba(200,220,255,0.9)" : "rgba(30,80,180,0.8)",
                      strokeWidth: 1.6,
                      cursor: "crosshair",
                    },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={(e: React.MouseEvent) => {
                    setHovered({ name: rawName, count: rawCount, value: val, blockades: blockadeCount, ex: e.clientX, ey: e.clientY });
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

      {/* ── Legend overlay (bottom-left) ── */}
      <div style={{
        position: "absolute", bottom: 12, left: 10,
        background: panelBg,
        border: `1px solid ${borderC}`,
        borderRadius: 6,
        padding: "6px 10px",
        backdropFilter: "blur(8px)",
        pointerEvents: "none",
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: textSub, marginBottom: 5 }}>
          INTENSIDAD DELICTIVA
        </div>
        {[
          { label: "Muy alto", color: "#ff1a00" },
          { label: "Alto",     color: "#c82000" },
          { label: "Medio",    color: "#c07a00" },
          { label: "Bajo",     color: "#1a8898" },
          { label: "Mínimo",   color: "#1a4e7a" },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: textSub }}>{label}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: dark ? "#192438" : "#c5d5e8", flexShrink: 0, border: `1px solid ${borderC}` }} />
          <span style={{ fontSize: 9, color: textSub }}>Sin datos</span>
        </div>
        {totalActiveBlockades > 0 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${borderC}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: "#ec4899", flexShrink: 0, boxShadow: "0 0 5px rgba(236,72,153,0.7)" }} />
              <span style={{ fontSize: 9, color: "#ec4899", fontWeight: 700 }}>
                {totalActiveBlockades} bloqueo{totalActiveBlockades > 1 ? "s" : ""} activo{totalActiveBlockades > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed tooltip following cursor ── */}
      {hovered && (
        <div
          style={{
            position: "fixed",
            left: hovered.ex + 14,
            top: hovered.ey - 10,
            zIndex: 9999,
            pointerEvents: "none",
            background: panelBg,
            border: `1px solid ${hovered.blockades > 0 ? "rgba(236,72,153,0.45)" : borderC}`,
            borderRadius: 8,
            padding: "10px 14px",
            backdropFilter: "blur(12px)",
            boxShadow: dark
              ? "0 4px 24px rgba(0,0,0,0.6)"
              : "0 4px 16px rgba(0,0,0,0.15)",
            minWidth: 160,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: textMain, marginBottom: 6, textTransform: "capitalize" }}>
            {hovered.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 10, color: textSub }}>Total casos</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: textMain, fontFamily: "monospace" }}>
                {hovered.count.toLocaleString("es-CO")}
              </span>
            </div>
            {hovered.value > 0 && (() => {
              const badge = getThreatBadge(hovered.value, dark);
              return (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: textSub }}>Nivel</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, letterSpacing: "0.06em" }}>
                    {badge.label}
                  </span>
                </div>
              );
            })()}
            {hovered.blockades > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 2, paddingTop: 4, borderTop: "1px solid rgba(236,72,153,0.2)" }}>
                <span style={{ fontSize: 10, color: "#ec4899" }}>🛑 Bloqueos activos</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#ec4899", fontFamily: "monospace" }}>
                  {hovered.blockades}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
