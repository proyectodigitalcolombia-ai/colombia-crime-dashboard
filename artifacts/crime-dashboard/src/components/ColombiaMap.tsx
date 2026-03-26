import { useState, useMemo } from "react";
import { DepartmentStats } from "@workspace/api-client-react";

/* ─── Department shapes (simplified SVG paths) ─── */
const DEPARTMENTS = [
  { id: "AMA", name: "Amazonas",               path: "M 200,400 L 250,450 L 280,420 L 250,380 Z",          x: 235, y: 415, abbr: "AMA" },
  { id: "ANT", name: "Antioquia",              path: "M 100,150 L 150,150 L 150,200 L 100,200 Z",          x: 125, y: 175, abbr: "ANT" },
  { id: "ARA", name: "Arauca",                 path: "M 200,180 L 250,180 L 250,220 L 200,220 Z",          x: 225, y: 200, abbr: "ARA" },
  { id: "ATL", name: "Atlántico",              path: "M 120,50 L 140,50 L 140,70 L 120,70 Z",              x: 130, y: 60,  abbr: "ATL" },
  { id: "BOL", name: "Bolívar",                path: "M 120,70 L 150,70 L 150,130 L 120,130 Z",            x: 135, y: 100, abbr: "BOL" },
  { id: "BOY", name: "Boyacá",                 path: "M 170,180 L 200,180 L 200,220 L 170,220 Z",          x: 185, y: 200, abbr: "BOY" },
  { id: "CAL", name: "Caldas",                 path: "M 130,180 L 170,180 L 170,200 L 130,200 Z",          x: 150, y: 190, abbr: "CAL" },
  { id: "CAQ", name: "Caquetá",                path: "M 150,300 L 200,300 L 200,350 L 150,350 Z",          x: 175, y: 325, abbr: "CAQ" },
  { id: "CAS", name: "Casanare",               path: "M 200,220 L 250,220 L 250,260 L 200,260 Z",          x: 225, y: 240, abbr: "CAS" },
  { id: "CAU", name: "Cauca",                  path: "M 80,260 L 120,260 L 120,300 L 80,300 Z",            x: 100, y: 280, abbr: "CAU" },
  { id: "CES", name: "Cesar",                  path: "M 150,70 L 180,70 L 180,120 L 150,120 Z",            x: 165, y: 95,  abbr: "CES" },
  { id: "CHO", name: "Chocó",                  path: "M 70,150 L 100,150 L 100,240 L 70,240 Z",            x: 85,  y: 195, abbr: "CHO" },
  { id: "COR", name: "Córdoba",                path: "M 140,100 L 160,100 L 160,150 L 140,150 Z",          x: 150, y: 125, abbr: "COR" },
  { id: "CUN", name: "Cundinamarca",           path: "M 150,200 L 180,200 L 180,240 L 150,240 Z",          x: 165, y: 220, abbr: "CUN" },
  { id: "GUA", name: "Guainía",                path: "M 250,260 L 300,260 L 300,300 L 250,300 Z",          x: 275, y: 280, abbr: "GUA" },
  { id: "GUV", name: "Guaviare",               path: "M 200,260 L 250,260 L 250,300 L 200,300 Z",          x: 225, y: 280, abbr: "GUV" },
  { id: "HUI", name: "Huila",                  path: "M 120,260 L 150,260 L 150,300 L 120,300 Z",          x: 135, y: 280, abbr: "HUI" },
  { id: "LAG", name: "La Guajira",             path: "M 160,20 L 200,20 L 200,70 L 160,70 Z",              x: 180, y: 45,  abbr: "LAG" },
  { id: "MAG", name: "Magdalena",              path: "M 140,50 L 170,50 L 170,100 L 140,100 Z",            x: 155, y: 75,  abbr: "MAG" },
  { id: "MET", name: "Meta",                   path: "M 180,240 L 240,240 L 240,280 L 180,280 Z",          x: 210, y: 260, abbr: "MET" },
  { id: "NAR", name: "Nariño",                 path: "M 60,300 L 100,300 L 100,340 L 60,340 Z",            x: 80,  y: 320, abbr: "NAR" },
  { id: "NSA", name: "Norte de Santander",     path: "M 170,130 L 200,130 L 200,170 L 170,170 Z",          x: 185, y: 150, abbr: "N.S" },
  { id: "PUT", name: "Putumayo",               path: "M 100,320 L 150,320 L 150,360 L 100,360 Z",          x: 125, y: 340, abbr: "PUT" },
  { id: "QUI", name: "Quindío",               path: "M 125,200 L 140,200 L 140,215 L 125,215 Z",          x: 132, y: 207, abbr: "Q"   },
  { id: "RIS", name: "Risaralda",              path: "M 120,190 L 135,190 L 135,205 L 120,205 Z",          x: 127, y: 197, abbr: "R"   },
  { id: "SAP", name: "San Andrés y Providencia", path: "M 30,30 L 50,30 L 50,50 L 30,50 Z",               x: 40,  y: 40,  abbr: "SAP" },
  { id: "SAN", name: "Santander",              path: "M 160,150 L 190,150 L 190,190 L 160,190 Z",          x: 175, y: 170, abbr: "SAN" },
  { id: "SUC", name: "Sucre",                  path: "M 130,80 L 150,80 L 150,110 L 130,110 Z",            x: 140, y: 95,  abbr: "SUC" },
  { id: "TOL", name: "Tolima",                 path: "M 130,220 L 160,220 L 160,260 L 130,260 Z",          x: 145, y: 240, abbr: "TOL" },
  { id: "VAC", name: "Valle del Cauca",        path: "M 90,210 L 120,210 L 120,260 L 90,260 Z",            x: 105, y: 235, abbr: "VAC" },
  { id: "VAU", name: "Vaupés",                 path: "M 230,300 L 280,300 L 280,350 L 230,350 Z",          x: 255, y: 325, abbr: "VAU" },
  { id: "VIC", name: "Vichada",                path: "M 250,200 L 310,200 L 310,260 L 250,260 Z",          x: 280, y: 230, abbr: "VIC" },
  { id: "BOG", name: "Bogotá, D.C.",           path: "M 165,220 L 175,220 L 175,230 L 165,230 Z",          x: 170, y: 225, abbr: "BOG" },
];

/* ─── Military threat palette ─── */
function getThreatColor(value: number, dark: boolean): string {
  if (dark) {
    if (value === 0)     return "#12271a";
    if (value < 0.15)   return "#1a3d1a";
    if (value < 0.30)   return "#2d5a20";
    if (value < 0.45)   return "#5a6b10";
    if (value < 0.60)   return "#8a6000";
    if (value < 0.75)   return "#9a3800";
    if (value < 0.90)   return "#b82000";
    return                     "#d40000";
  } else {
    if (value === 0)     return "#d4e8d4";
    if (value < 0.15)   return "#a8cc94";
    if (value < 0.30)   return "#78aa58";
    if (value < 0.45)   return "#b8b020";
    if (value < 0.60)   return "#d08020";
    if (value < 0.75)   return "#c04820";
    if (value < 0.90)   return "#a82010";
    return                     "#8c0008";
  }
}

function getThreatLabel(value: number): { label: string; color: string } {
  if (value < 0.15) return { label: "BAJO",     color: "#2d5a20" };
  if (value < 0.40) return { label: "MEDIO",    color: "#8a6000" };
  if (value < 0.70) return { label: "ALTO",     color: "#9a3800" };
  return                   { label: "CRÍTICO",  color: "#d40000" };
}

interface ColombiaMapProps {
  data: DepartmentStats[];
  dark?: boolean;
}

export function ColombiaMap({ data, dark = true }: ColombiaMapProps) {
  const [hoveredDept, setHoveredDept] = useState<{
    name: string; count: number; value: number; x: number; y: number;
  } | null>(null);

  const maxCount = useMemo(() => Math.max(...data.map(d => d.totalCount), 1), [data]);

  const getDeptValue = (name: string) => {
    const d = data.find(d => d.department.toLowerCase() === name.toLowerCase());
    return d ? d.totalCount / maxCount : 0;
  };

  const handleEnter = (dept: typeof DEPARTMENTS[0]) => {
    const d = data.find(d => d.department.toLowerCase() === dept.name.toLowerCase());
    setHoveredDept({ name: dept.name, count: d?.totalCount || 0, value: getDeptValue(dept.name), x: dept.x, y: dept.y });
  };

  const gridColor   = dark ? "rgba(0,200,80,0.06)"    : "rgba(0,80,20,0.08)";
  const borderColor = dark ? "rgba(0,200,80,0.35)"     : "rgba(40,100,40,0.5)";
  const bgColor     = dark ? "#070e09"                 : "#e8f0e8";
  const textColor   = dark ? "rgba(0,200,80,0.7)"      : "rgba(20,80,20,0.75)";
  const labelColor  = dark ? "rgba(0,255,100,0.55)"    : "rgba(20,100,30,0.6)";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: "0" }}>

      {/* Tactical header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "6px" }}>
        <span style={{ fontSize: "9px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.2em", color: dark ? "#00c850" : "#1a6020", textTransform: "uppercase" }}>
          ▶ ANÁLISIS TERRITORIAL · COL-2600
        </span>
        <span style={{ fontSize: "9px", fontFamily: "IBM Plex Mono, monospace", color: dark ? "rgba(0,200,80,0.5)" : "rgba(20,100,20,0.5)", letterSpacing: "0.1em" }}>
          NIVEL AMENAZA
        </span>
      </div>

      {/* Map SVG */}
      <div style={{ flex: 1, position: "relative", background: bgColor, borderRadius: "6px", border: `1px solid ${dark ? "rgba(0,200,80,0.2)" : "rgba(40,100,40,0.25)"}`, overflow: "hidden" }}>

        <svg viewBox="0 0 350 500" style={{ width: "100%", height: "100%", display: "block" }}>
          <defs>
            {/* Glow filter for high-threat zones */}
            <filter id="threat-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            {/* Scanline texture */}
            <pattern id="scanlines" width="1" height="3" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="1" y2="0" stroke={gridColor} strokeWidth="0.5" />
            </pattern>
            {/* Grid pattern */}
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={gridColor} strokeWidth="0.4" />
            </pattern>
            {/* Vignette */}
            <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
              <stop offset="60%" stopColor="transparent" />
              <stop offset="100%" stopColor={dark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.1)"} />
            </radialGradient>
          </defs>

          {/* Background */}
          <rect width="350" height="500" fill={bgColor} />
          <rect width="350" height="500" fill="url(#grid)" />
          <rect width="350" height="500" fill="url(#scanlines)" />

          {/* Grid coord labels */}
          {[0,1,2,3,4,5,6].map(i => (
            <text key={`gy${i}`} x="2" y={i * 70 + 12} fontSize="5" fontFamily="IBM Plex Mono, monospace" fill={labelColor} opacity="0.6">{String.fromCharCode(65 + i)}</text>
          ))}
          {[0,1,2,3,4].map(i => (
            <text key={`gx${i}`} x={i * 70 + 65} y="8" fontSize="5" fontFamily="IBM Plex Mono, monospace" fill={labelColor} opacity="0.6">{i + 1}</text>
          ))}
          {/* Vertical coord lines at intervals */}
          {[70, 140, 210, 280].map(x => (
            <line key={`vl${x}`} x1={x} y1="0" x2={x} y2="500" stroke={dark ? "rgba(0,200,80,0.12)" : "rgba(40,100,40,0.12)"} strokeWidth="0.5" strokeDasharray="3,6" />
          ))}
          {[70, 140, 210, 280, 350, 420].map(y => (
            <line key={`hl${y}`} x1="0" y1={y} x2="350" y2={y} stroke={dark ? "rgba(0,200,80,0.12)" : "rgba(40,100,40,0.12)"} strokeWidth="0.5" strokeDasharray="3,6" />
          ))}

          {/* Department fills */}
          {DEPARTMENTS.map((dept) => {
            const val = getDeptValue(dept.name);
            const fill = getThreatColor(val, dark);
            const isCritical = val >= 0.75;
            return (
              <path
                key={dept.id}
                d={dept.path}
                fill={fill}
                stroke={borderColor}
                strokeWidth={isCritical ? "1.5" : "0.8"}
                strokeLinejoin="round"
                style={{ cursor: "crosshair", transition: "opacity 0.15s" }}
                filter={isCritical && dark ? "url(#threat-glow)" : undefined}
                onMouseEnter={() => handleEnter(dept)}
                onMouseLeave={() => setHoveredDept(null)}
                onMouseOver={e => {
                  const el = e.currentTarget;
                  el.style.opacity = "0.75";
                  el.style.strokeWidth = "2";
                }}
                onMouseOut={e => {
                  const el = e.currentTarget;
                  el.style.opacity = "1";
                  el.style.strokeWidth = isCritical ? "1.5" : "0.8";
                }}
              />
            );
          })}

          {/* Department labels */}
          {DEPARTMENTS.map(dept => {
            const val = getDeptValue(dept.name);
            if (val === 0) return null;
            return (
              <text
                key={`lbl-${dept.id}`}
                x={dept.x}
                y={dept.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="5"
                fontFamily="IBM Plex Mono, monospace"
                fontWeight="700"
                fill={dark ? (val > 0.5 ? "rgba(255,220,180,0.9)" : "rgba(180,255,180,0.8)") : (val > 0.5 ? "#5a1000" : "#1a4a10")}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {dept.abbr}
              </text>
            );
          })}

          {/* Vignette overlay */}
          <rect width="350" height="500" fill="url(#vignette)" style={{ pointerEvents: "none" }} />

          {/* Corner crosshair decoration */}
          <g opacity="0.4">
            <line x1="10" y1="15" x2="10" y2="25" stroke={dark ? "#00c850" : "#1a6020"} strokeWidth="1" />
            <line x1="5"  y1="20" x2="15" y2="20" stroke={dark ? "#00c850" : "#1a6020"} strokeWidth="1" />
            <line x1="335" y1="15" x2="335" y2="25" stroke={dark ? "#00c850" : "#1a6020"} strokeWidth="1" />
            <line x1="330" y1="20" x2="340" y2="20" stroke={dark ? "#00c850" : "#1a6020"} strokeWidth="1" />
          </g>

          {/* Legend */}
          <g transform="translate(14, 455)">
            <text x="0" y="-6" fontSize="6" fontFamily="IBM Plex Mono, monospace" fill={textColor} fontWeight="700" letterSpacing="1">NIVEL AMENAZA</text>
            {[
              { label: "BAJO",     val: 0.05 },
              { label: "MEDIO",   val: 0.35 },
              { label: "ALTO",     val: 0.65 },
              { label: "CRÍTICO", val: 0.90 },
            ].map((tier, i) => (
              <g key={tier.label} transform={`translate(${i * 76}, 0)`}>
                <rect width="16" height="8" rx="1" fill={getThreatColor(tier.val, dark)} stroke={borderColor} strokeWidth="0.5" />
                <text x="20" y="7" fontSize="6" fontFamily="IBM Plex Mono, monospace" fill={textColor} fontWeight="600">{tier.label}</text>
              </g>
            ))}
          </g>
        </svg>

        {/* Hover tooltip — military intel style */}
        {hoveredDept && (
          <div style={{
            position: "absolute",
            left: `${(hoveredDept.x / 350) * 100}%`,
            top: `${(hoveredDept.y / 500) * 100}%`,
            transform: "translate(-50%, -110%)",
            pointerEvents: "none",
            background: dark ? "rgba(4, 14, 6, 0.97)" : "rgba(240, 250, 240, 0.97)",
            border: `1px solid ${dark ? "#00c850" : "#2a6a2a"}`,
            borderRadius: "4px",
            padding: "8px 12px",
            minWidth: "160px",
            boxShadow: dark ? "0 0 16px rgba(0,200,80,0.25), 0 4px 20px rgba(0,0,0,0.8)" : "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 10,
          }}>
            <div style={{ fontSize: "8px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.15em", color: dark ? "#00c850" : "#1a6020", marginBottom: "5px", textTransform: "uppercase" }}>
              ▶ ZONA IDENTIFICADA
            </div>
            <div style={{ fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color: dark ? "#e0ffe0" : "#0a300a", marginBottom: "4px", lineHeight: 1.2 }}>
              {hoveredDept.name.toUpperCase()}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <div>
                <div style={{ fontSize: "7px", fontFamily: "IBM Plex Mono, monospace", color: dark ? "rgba(0,200,80,0.5)" : "rgba(20,100,20,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Incidentes</div>
                <div style={{ fontSize: "16px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color: dark ? "#00d4ff" : "#0369a1" }}>
                  {hoveredDept.count.toLocaleString("es-CO")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "7px", fontFamily: "IBM Plex Mono, monospace", color: dark ? "rgba(0,200,80,0.5)" : "rgba(20,100,20,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Estado</div>
                <div style={{ fontSize: "11px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color: getThreatLabel(hoveredDept.value).color }}>
                  ◉ {getThreatLabel(hoveredDept.value).label}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
