import { useState, useMemo } from "react";
import { DepartmentStats } from "@workspace/api-client-react";

/**
 * Colombian departments with geographically approximate polygon paths.
 * ViewBox: 0 0 380 500
 * Projection: x = (lon + 81.7) * 26.2, y = (12.5 - lat) * 30
 */
const DEPARTMENTS = [
  {
    id: "LAG", name: "La Guajira",
    path: "M 220,0 L 262,2 L 272,14 L 268,36 L 252,52 L 238,50 L 224,40 L 218,22 Z",
    cx: 247, cy: 26,
  },
  {
    id: "ATL", name: "Atlántico",
    path: "M 162,45 L 182,44 L 186,52 L 186,68 L 164,66 L 160,54 Z",
    cx: 174, cy: 57,
  },
  {
    id: "MAG", name: "Magdalena",
    path: "M 178,30 L 220,28 L 222,44 L 218,58 L 210,100 L 195,104 L 184,98 L 178,72 L 174,48 Z",
    cx: 199, cy: 67,
  },
  {
    id: "BOL", name: "Bolívar",
    path: "M 130,62 L 162,60 L 168,68 L 182,70 L 185,98 L 180,130 L 162,148 L 142,146 L 126,130 L 122,96 L 126,76 Z",
    cx: 155, cy: 105,
  },
  {
    id: "SUC", name: "Sucre",
    path: "M 148,80 L 170,78 L 178,88 L 175,116 L 154,118 L 144,104 L 144,88 Z",
    cx: 161, cy: 99,
  },
  {
    id: "COR", name: "Córdoba",
    path: "M 112,86 L 148,84 L 148,104 L 152,130 L 140,148 L 118,144 L 104,128 L 104,108 Z",
    cx: 128, cy: 116,
  },
  {
    id: "CES", name: "Cesar",
    path: "M 196,56 L 232,52 L 238,60 L 236,100 L 228,118 L 208,116 L 196,108 L 192,80 Z",
    cx: 217, cy: 87,
  },
  {
    id: "NSA", name: "Norte de Santander",
    path: "M 210,110 L 244,108 L 252,118 L 248,150 L 234,162 L 215,158 L 208,140 L 206,120 Z",
    cx: 229, cy: 136,
  },
  {
    id: "SAN", name: "Santander",
    path: "M 186,132 L 214,130 L 222,144 L 220,180 L 208,198 L 190,196 L 182,178 L 178,150 Z",
    cx: 201, cy: 164,
  },
  {
    id: "ARA", name: "Arauca",
    path: "M 246,150 L 322,148 L 320,186 L 242,184 L 238,168 Z",
    cx: 282, cy: 167,
  },
  {
    id: "BOY", name: "Boyacá",
    path: "M 188,168 L 238,166 L 244,182 L 242,218 L 226,228 L 198,224 L 186,206 L 182,182 Z",
    cx: 214, cy: 198,
  },
  {
    id: "CAS", name: "Casanare",
    path: "M 240,184 L 318,186 L 316,238 L 282,246 L 244,242 L 238,216 Z",
    cx: 280, cy: 215,
  },
  {
    id: "ANT", name: "Antioquia",
    path: "M 108,108 L 150,106 L 178,112 L 194,128 L 196,164 L 190,200 L 170,212 L 144,210 L 118,198 L 104,174 L 100,146 L 106,124 Z",
    cx: 150, cy: 158,
  },
  {
    id: "CHO", name: "Chocó",
    path: "M 68,118 L 106,114 L 108,148 L 104,180 L 102,230 L 96,262 L 78,258 L 68,230 L 66,188 L 64,152 Z",
    cx: 86, cy: 188,
  },
  {
    id: "CAL", name: "Caldas",
    path: "M 144,198 L 182,196 L 186,214 L 180,226 L 150,222 L 140,210 Z",
    cx: 163, cy: 212,
  },
  {
    id: "RIS", name: "Risaralda",
    path: "M 132,210 L 150,208 L 152,226 L 148,238 L 130,234 L 126,220 Z",
    cx: 140, cy: 224,
  },
  {
    id: "QUI", name: "Quindío",
    path: "M 148,226 L 164,226 L 163,242 L 149,240 Z",
    cx: 156, cy: 234,
  },
  {
    id: "CUN", name: "Cundinamarca",
    path: "M 186,214 L 222,216 L 224,252 L 212,264 L 190,260 L 182,240 Z",
    cx: 203, cy: 238,
  },
  {
    id: "BOG", name: "Bogotá, D.C.",
    path: "M 200,240 L 212,240 L 212,254 L 200,253 Z",
    cx: 206, cy: 247,
  },
  {
    id: "VAC", name: "Valle del Cauca",
    path: "M 80,218 L 130,214 L 136,236 L 134,272 L 122,286 L 96,280 L 78,262 L 76,240 Z",
    cx: 107, cy: 252,
  },
  {
    id: "TOL", name: "Tolima",
    path: "M 152,220 L 188,218 L 192,252 L 186,286 L 162,284 L 148,260 L 146,238 Z",
    cx: 170, cy: 254,
  },
  {
    id: "HUI", name: "Huila",
    path: "M 158,280 L 192,276 L 196,314 L 184,346 L 162,342 L 150,312 L 150,290 Z",
    cx: 174, cy: 312,
  },
  {
    id: "CAU", name: "Cauca",
    path: "M 80,258 L 120,254 L 126,278 L 122,316 L 106,336 L 82,328 L 70,306 L 72,278 Z",
    cx: 98, cy: 295,
  },
  {
    id: "NAR", name: "Nariño",
    path: "M 68,318 L 108,316 L 112,342 L 104,364 L 80,368 L 62,352 L 60,332 Z",
    cx: 87, cy: 342,
  },
  {
    id: "PUT", name: "Putumayo",
    path: "M 110,330 L 172,326 L 174,358 L 156,384 L 120,380 L 106,358 Z",
    cx: 141, cy: 355,
  },
  {
    id: "CAQ", name: "Caquetá",
    path: "M 148,280 L 218,278 L 220,340 L 204,368 L 166,364 L 146,340 L 142,308 Z",
    cx: 183, cy: 323,
  },
  {
    id: "MET", name: "Meta",
    path: "M 190,242 L 278,246 L 282,302 L 260,326 L 220,322 L 196,298 L 188,268 Z",
    cx: 235, cy: 284,
  },
  {
    id: "GUV", name: "Guaviare",
    path: "M 218,316 L 280,314 L 278,358 L 244,362 L 216,354 Z",
    cx: 249, cy: 338,
  },
  {
    id: "VIC", name: "Vichada",
    path: "M 282,180 L 370,178 L 372,262 L 296,260 L 280,236 Z",
    cx: 328, cy: 220,
  },
  {
    id: "GUA", name: "Guainía",
    path: "M 296,252 L 368,256 L 366,324 L 308,326 L 290,302 Z",
    cx: 330, cy: 290,
  },
  {
    id: "VAU", name: "Vaupés",
    path: "M 242,356 L 306,352 L 308,406 L 268,416 L 236,404 Z",
    cx: 275, cy: 383,
  },
  {
    id: "AMA", name: "Amazonas",
    path: "M 160,370 L 238,362 L 278,368 L 282,450 L 240,478 L 188,474 L 152,460 L 150,420 Z",
    cx: 218, cy: 420,
  },
  {
    id: "SAP", name: "San Andrés",
    path: "M 18,28 L 36,28 L 37,46 L 18,46 Z",
    cx: 28, cy: 37,
  },
];

/* ─── Color scale: dark charcoal → teal → amber → crimson ─── */
function getIntensityColor(value: number, dark: boolean): string {
  // No data at all
  if (value <= 0) return dark ? "#182030" : "#c0cfe0";

  const v = Math.max(0, Math.min(1, value));

  if (dark) {
    // Bright visible scale: steel-blue → electric teal → amber → burnt orange → crimson
    if (v < 0.25) return interpolate("#1e5080", "#1a8898", v / 0.25);
    if (v < 0.50) return interpolate("#1a8898", "#c07a00", (v - 0.25) / 0.25);
    if (v < 0.75) return interpolate("#c07a00", "#c82400", (v - 0.50) / 0.25);
    return                interpolate("#c82400", "#ff1800", (v - 0.75) / 0.25);
  } else {
    if (v < 0.25) return interpolate("#90bcd0", "#4aa0b8", v / 0.25);
    if (v < 0.50) return interpolate("#4aa0b8", "#e09010", (v - 0.25) / 0.25);
    if (v < 0.75) return interpolate("#e09010", "#c02808", (v - 0.50) / 0.25);
    return                interpolate("#c02808", "#920000", (v - 0.75) / 0.25);
  }
}

function interpolate(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexRgb(a);
  const [br, bg, bb] = hexRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl2 = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl2})`;
}

function hexRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

interface ColombiaMapProps {
  data: DepartmentStats[];
  dark?: boolean;
}

export function ColombiaMap({ data, dark = true }: ColombiaMapProps) {
  const [hovered, setHovered] = useState<{
    name: string; count: number; value: number; ex: number; ey: number;
  } | null>(null);

  const maxCount = useMemo(() => Math.max(...data.map(d => d.totalCount), 1), [data]);

  // normalize dept names for robust matching
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

  const valueMap = useMemo(() => {
    // Aggregate by normalized name (data may have multiple rows per dept)
    const raw: Record<string, number> = {};
    data.forEach(d => {
      const k = normalize(d.department);
      raw[k] = (raw[k] || 0) + d.totalCount;
    });
    const localMax = Math.max(...Object.values(raw), 1);
    // cube-root scale: spreads low values much more than sqrt
    const m: Record<string, number> = {};
    Object.entries(raw).forEach(([k, v]) => { m[k] = Math.cbrt(v / localMax); });
    return m;
  }, [data]);

  const bg           = dark ? "#0c1420" : "#eef2f5";
  const borderBase   = dark ? "rgba(80,130,200,0.35)" : "rgba(60,100,140,0.30)";
  const borderHover  = dark ? "rgba(200,230,255,0.85)" : "rgba(30,80,140,0.8)";
  const gridStroke   = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
  const dimText      = dark ? "rgba(140,180,220,0.5)"  : "rgba(40,80,120,0.5)";

  function getThreatBadge(v: number) {
    if (v < 0.15) return { label: "BAJO",     color: dark ? "#2a8060" : "#1a6040" };
    if (v < 0.40) return { label: "MODERADO", color: dark ? "#b08000" : "#8a6000" };
    if (v < 0.70) return { label: "ALTO",     color: dark ? "#c04800" : "#9a3000" };
    return               { label: "CRÍTICO",  color: dark ? "#e02010" : "#a00010" };
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>

      {/* SVG map */}
      <div style={{ flex: 1, position: "relative", borderRadius: "8px", overflow: "hidden", background: bg, border: `1px solid ${dark ? "rgba(120,160,200,0.14)" : "rgba(80,120,160,0.18)"}` }}>
        <svg
          viewBox="0 0 380 500"
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Subtle radial vignette */}
            <radialGradient id="vgn" cx="50%" cy="45%" r="65%">
              <stop offset="55%" stopColor="transparent" />
              <stop offset="100%" stopColor={dark ? "rgba(0,0,0,0.38)" : "rgba(0,0,0,0.08)"} />
            </radialGradient>
            {/* Fine grid pattern */}
            <pattern id="finegrid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke={gridStroke} strokeWidth="0.5" />
            </pattern>
            {/* Glow for high-intensity depts */}
            <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background layers */}
          <rect width="380" height="500" fill={bg} />
          <rect width="380" height="500" fill="url(#finegrid)" />

          {/* Department shapes */}
          {DEPARTMENTS.map(dept => {
            const key = normalize(dept.name);
            const val  = valueMap[key] ?? 0;
            const fill = getIntensityColor(val, dark);
            const isCrit = val >= 0.70;
            return (
              <g key={dept.id}>
                <path
                  d={dept.path}
                  fill={fill}
                  stroke={borderBase}
                  strokeWidth="0.8"
                  strokeLinejoin="round"
                  style={{ cursor: "crosshair", transition: "fill 0.2s" }}
                  filter={isCrit && dark ? "url(#glow)" : undefined}
                  onMouseEnter={e => {
                    e.currentTarget.setAttribute("stroke", borderHover);
                    e.currentTarget.setAttribute("stroke-width", "1.6");
                    // Find total count (sum all rows for this dept)
                    const totalForDept = data
                      .filter(d => normalize(d.department) === key)
                      .reduce((s, d) => s + d.totalCount, 0);
                    setHovered({ name: dept.name, count: totalForDept, value: val, ex: e.clientX, ey: e.clientY });
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.setAttribute("stroke", borderBase);
                    e.currentTarget.setAttribute("stroke-width", "0.8");
                    setHovered(null);
                  }}
                />
                {/* Label only if large enough and has data */}
                {val > 0.05 && (
                  <text
                    x={dept.cx}
                    y={dept.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="5.2"
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight="700"
                    fill={dark
                      ? val > 0.55 ? "rgba(255,220,190,0.85)" : "rgba(160,210,235,0.7)"
                      : val > 0.55 ? "rgba(60,10,0,0.85)" : "rgba(15,50,90,0.7)"}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                    letterSpacing="0.3"
                  >
                    {dept.id}
                  </text>
                )}
              </g>
            );
          })}

          {/* Vignette overlay */}
          <rect width="380" height="500" fill="url(#vgn)" style={{ pointerEvents: "none" }} />

          {/* Legend strip — bottom */}
          <g transform="translate(12, 466)">
            <text
              x="0" y="-5"
              fontSize="5.5" fontFamily="IBM Plex Mono, monospace" fontWeight="700"
              fill={dimText} letterSpacing="0.8"
            >
              INTENSIDAD DELICTIVA
            </text>
            {/* Gradient bar */}
            <defs>
              <linearGradient id="legGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor={getIntensityColor(0.05, dark)} />
                <stop offset="33%"  stopColor={getIntensityColor(0.35, dark)} />
                <stop offset="66%"  stopColor={getIntensityColor(0.65, dark)} />
                <stop offset="100%" stopColor={getIntensityColor(0.95, dark)} />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="200" height="7" rx="2" fill="url(#legGrad)" opacity="0.9" />
            {["BAJO", "MODERADO", "ALTO", "CRÍTICO"].map((lbl, i) => (
              <text
                key={lbl}
                x={i * 66}
                y="17"
                fontSize="5"
                fontFamily="IBM Plex Mono, monospace"
                fill={dimText}
                letterSpacing="0.4"
              >
                {lbl}
              </text>
            ))}
          </g>

          {/* Small coordinate ticks on edges */}
          {[100, 200, 300, 400].map(y => (
            <line key={`tick-y${y}`} x1="0" y1={y} x2="4" y2={y} stroke={dimText} strokeWidth="0.5" opacity="0.6" />
          ))}
          {[100, 200, 300].map(x => (
            <line key={`tick-x${x}`} x1={x} y1="496" x2={x} y2="500" stroke={dimText} strokeWidth="0.5" opacity="0.6" />
          ))}
        </svg>

        {/* Floating tooltip — follows cursor */}
        {hovered && (
          <div
            style={{
              position: "fixed",
              left: hovered.ex + 16,
              top: hovered.ey - 10,
              pointerEvents: "none",
              zIndex: 999,
              background: dark ? "rgba(8,14,22,0.96)" : "rgba(245,248,252,0.97)",
              border: `1px solid ${dark ? "rgba(100,160,220,0.35)" : "rgba(40,90,160,0.3)"}`,
              borderRadius: "6px",
              padding: "10px 14px",
              minWidth: "170px",
              boxShadow: dark
                ? "0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(100,160,220,0.1)"
                : "0 4px 16px rgba(0,0,0,0.12)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ fontSize: "9px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.12em", color: dark ? "rgba(100,160,220,0.7)" : "rgba(40,90,160,0.7)", marginBottom: "5px", textTransform: "uppercase" }}>
              Zona Identificada
            </div>
            <div style={{ fontSize: "14px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color: dark ? "#e0eeff" : "#0a1e3a", marginBottom: "8px", lineHeight: 1.2 }}>
              {hovered.name}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: "8px", fontFamily: "IBM Plex Mono, monospace", color: dark ? "rgba(100,160,220,0.5)" : "rgba(40,90,160,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>Incidentes</div>
                <div style={{ fontSize: "20px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 900, color: dark ? "#00d4ff" : "#0369a1", lineHeight: 1 }}>
                  {hovered.count.toLocaleString("es-CO")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "8px", fontFamily: "IBM Plex Mono, monospace", color: dark ? "rgba(100,160,220,0.5)" : "rgba(40,90,160,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>Nivel</div>
                <div style={{ fontSize: "12px", fontFamily: "IBM Plex Mono, monospace", fontWeight: 800, color: getThreatBadge(hovered.value).color, letterSpacing: "0.05em" }}>
                  {getThreatBadge(hovered.value).label}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
