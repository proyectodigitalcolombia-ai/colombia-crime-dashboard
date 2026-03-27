import { useState, useEffect, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Blockade } from "@workspace/api-client-react";

/* ── Fix Leaflet icon paths with Vite bundler ── */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const E = {
  bg: "#070c15", panel: "#0c1220", border: "rgba(255,255,255,0.07)",
  cyan: "#00d4ff", amber: "#f59e0b", red: "#ef4444", emerald: "#10b981",
  orange: "#f97316", textDim: "rgba(255,255,255,0.45)",
};

/* ── Risk data (mirrors RouteAnalyzer) ── */
const NIGHT_RISK: Record<string, number> = {
  "Bogotá D.C.": 55, "Cundinamarca": 70, "Boyacá": 65, "Antioquia": 72,
  "Caldas": 60, "Risaralda": 58, "Quindío": 55, "Valle del Cauca": 68,
  "Cauca": 75, "Nariño": 78, "Tolima": 72, "Huila": 68, "Meta": 80,
  "Casanare": 75, "Arauca": 82, "Santander": 65, "Norte de Santander": 70,
  "Bolívar": 62, "Atlántico": 50, "Córdoba": 65, "Sucre": 60, "Cesar": 68,
  "Magdalena": 65, "La Guajira": 60, "Chocó": 75, "Caquetá": 80,
  "Putumayo": 82, "Guaviare": 78, "Vichada": 70, "Guainía": 65,
  "Vaupés": 70, "Amazonas": 60,
};
const ARMED_GROUPS: Record<string, { level: number; groups: string[] }> = {
  "Bogotá D.C.": { level: 0, groups: [] }, "Cundinamarca": { level: 1, groups: ["Disidencias FARC"] },
  "Boyacá": { level: 1, groups: ["ELN"] }, "Antioquia": { level: 2, groups: ["Clan del Golfo", "Disidencias FARC"] },
  "Caldas": { level: 1, groups: ["Disidencias FARC"] }, "Risaralda": { level: 1, groups: ["Disidencias FARC"] },
  "Quindío": { level: 0, groups: [] }, "Valle del Cauca": { level: 2, groups: ["Disidencias FARC", "Clan del Golfo"] },
  "Cauca": { level: 3, groups: ["Estado Mayor Central", "ELN"] }, "Nariño": { level: 3, groups: ["Estado Mayor Central", "ELN"] },
  "Tolima": { level: 2, groups: ["Disidencias FARC"] }, "Huila": { level: 2, groups: ["Disidencias FARC"] },
  "Meta": { level: 2, groups: ["Estado Mayor Central"] }, "Casanare": { level: 2, groups: ["Disidencias FARC"] },
  "Arauca": { level: 3, groups: ["ELN", "Disidencias FARC"] }, "Santander": { level: 1, groups: ["ELN"] },
  "Norte de Santander": { level: 2, groups: ["ELN", "Clan del Golfo"] }, "Bolívar": { level: 2, groups: ["Clan del Golfo", "ELN"] },
  "Atlántico": { level: 1, groups: ["Clan del Golfo"] }, "Córdoba": { level: 3, groups: ["Clan del Golfo"] },
  "Sucre": { level: 2, groups: ["Clan del Golfo"] }, "Cesar": { level: 2, groups: ["Clan del Golfo", "ELN"] },
  "Magdalena": { level: 2, groups: ["Clan del Golfo"] }, "La Guajira": { level: 1, groups: ["Clan del Golfo"] },
  "Chocó": { level: 3, groups: ["Clan del Golfo", "ELN"] }, "Caquetá": { level: 3, groups: ["Estado Mayor Central"] },
  "Putumayo": { level: 3, groups: ["Estado Mayor Central"] }, "Guaviare": { level: 2, groups: ["Estado Mayor Central"] },
  "Vichada": { level: 1, groups: ["Disidencias FARC"] }, "Guainía": { level: 1, groups: ["Disidencias FARC"] },
  "Vaupés": { level: 1, groups: ["Disidencias FARC"] }, "Amazonas": { level: 0, groups: [] },
};

function compositeScore(dept: string, pirata = 0): number {
  const pScore = Math.min(pirata / 80, 1) * 35;
  const aScore = (ARMED_GROUPS[dept]?.level ?? 0) / 3 * 25;
  const nScore = ((NIGHT_RISK[dept] ?? 60) - 50) / 35 * 15;
  return Math.min(100, Math.round(pScore + aScore + nScore));
}
function riskLabel(score: number): { label: string; color: string; bg: string } {
  if (score < 20) return { label: "BAJO",     color: E.emerald, bg: "rgba(16,185,129,0.12)" };
  if (score < 45) return { label: "MODERADO", color: E.amber,   bg: "rgba(245,158,11,0.12)" };
  if (score < 70) return { label: "ALTO",     color: E.orange,  bg: "rgba(249,115,22,0.12)" };
  return           { label: "CRÍTICO",  color: E.red,     bg: "rgba(239,68,68,0.12)"  };
}
function armedLabel(level: number): string {
  if (level === 0) return "Sin presencia";
  if (level === 1) return "Baja";
  if (level === 2) return "Moderada";
  return "Alta";
}

/* ── Waypoint ── */
interface WP { lat: number; lng: number; dept?: string }

/* ── OSRM route fetcher ── */
async function fetchOSRMRoute(wps: WP[]): Promise<[number, number][]> {
  if (wps.length < 2) return [];
  const coords = wps.map(w => `${w.lng},${w.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?geometries=geojson&overview=full&annotations=false`;
  const res = await fetch(url);
  if (!res.ok) return wps.map(w => [w.lat, w.lng]);
  const data = await res.json();
  const coords2: [number, number][] = (data.routes?.[0]?.geometry?.coordinates ?? []).map(
    ([lng, lat]: [number, number]) => [lat, lng]
  );
  return coords2;
}

/* ── Nominatim reverse geocode to get state/dept ── */
const geocacheRef: Record<string, string> = {};
async function getDept(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geocacheRef[key]) return geocacheRef[key];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`,
      { headers: { "User-Agent": "SafeNode-Dashboard/1.0" } }
    );
    const data = await res.json();
    const state = data.address?.state ?? data.address?.province ?? "";
    geocacheRef[key] = state;
    return state;
  } catch { return ""; }
}

/* ── Map click handler (inner component) ── */
function ClickHandler({ onAdd, disabled }: { onAdd: (lat: number, lng: number) => void; disabled: boolean }) {
  useMapEvents({
    click(e) {
      if (!disabled) onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/* ── Numbered marker icon ── */
function numberedIcon(n: number, color: string) {
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};border:2px solid white;color:white;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.5)">${n}</div>`,
  });
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
interface Props {
  dark?: boolean;
  userBlockades?: Blockade[];
  pirataMap?: Record<string, number>;
}

export function RouteMapBuilder({ dark = true, userBlockades = [], pirataMap = {} }: Props) {
  const panelBg  = dark ? E.panel   : "#ffffff";
  const textMain = dark ? "#e2eaf4" : "#1a2a3a";
  const textMuted = dark ? E.textDim : "#64748b";
  const borderC  = dark ? E.border  : "rgba(0,0,0,0.07)";

  const [waypoints,    setWaypoints]    = useState<WP[]>([]);
  const [routeCoords,  setRouteCoords]  = useState<[number,number][]>([]);
  const [routeDepts,   setRouteDepts]   = useState<string[]>([]);
  const [routing,      setRouting]      = useState(false);
  const [geocoding,    setGeocoding]    = useState(false);
  const [error,        setError]        = useState("");

  /* When waypoints change, fetch route + geocode departments */
  useEffect(() => {
    if (waypoints.length < 2) { setRouteCoords([]); setRouteDepts([]); return; }
    let cancelled = false;
    setRouting(true);
    setError("");
    fetchOSRMRoute(waypoints).then(coords => {
      if (!cancelled) { setRouteCoords(coords); setRouting(false); }
    }).catch(() => {
      if (!cancelled) { setRouting(false); setError("No se pudo calcular la ruta (sin conexión a OSRM)."); }
    });

    /* Geocode each waypoint to get department */
    setGeocoding(true);
    Promise.all(waypoints.map(w => getDept(w.lat, w.lng))).then(depts => {
      if (!cancelled) {
        const unique = [...new Set(depts.filter(Boolean))];
        setRouteDepts(unique);
        setGeocoding(false);
      }
    });

    return () => { cancelled = true; };
  }, [waypoints]);

  const addWaypoint = useCallback((lat: number, lng: number) => {
    if (waypoints.length >= 12) return;
    setWaypoints(prev => [...prev, { lat, lng }]);
  }, [waypoints.length]);

  const removeWaypoint = useCallback((idx: number) => {
    setWaypoints(prev => prev.filter((_, i) => i !== idx));
  }, []);

  /* Risk analysis for the route */
  const analysis = useMemo(() => {
    if (routeDepts.length === 0) return null;
    const canonDepts = routeDepts.map(raw => {
      const norm = raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
      return Object.keys(ARMED_GROUPS).find(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().startsWith(norm.slice(0,6))) ?? raw;
    }).filter(d => d in ARMED_GROUPS);
    if (canonDepts.length === 0) return null;
    const avgScore = Math.round(canonDepts.reduce((s,d) => s + compositeScore(d, pirataMap[d.toLowerCase()] ?? 0), 0) / canonDepts.length);
    const maxArmed = Math.max(...canonDepts.map(d => ARMED_GROUPS[d]?.level ?? 0));
    const maxNight = Math.max(...canonDepts.map(d => NIGHT_RISK[d] ?? 60));
    const totalPirata = canonDepts.reduce((s,d) => s + (pirataMap[d.toLowerCase()] ?? pirataMap[d] ?? 0), 0);
    const label = riskLabel(avgScore);
    const activeBlocks = userBlockades.filter(b =>
      canonDepts.some(d => d.toLowerCase().includes((b.department ?? "").toLowerCase().slice(0,5)))
      && b.status === "activo"
    );
    const recs: string[] = [];
    if (activeBlocks.length > 0) recs.push(`🚨 ${activeBlocks.length} BLOQUEO(S) ACTIVO(S) en departamentos de esta ruta`);
    if (maxNight >= 75) recs.push("⛔ Evitar tránsito entre 10 PM y 5 AM — alta incidencia nocturna");
    else if (maxNight >= 60) recs.push("⚠ Reducir velocidad y mantener comunicación en horario nocturno");
    if (maxArmed >= 3) recs.push("🚨 Coordinar con Policía Nacional antes de salir — alta presencia de grupos armados");
    else if (maxArmed === 2) recs.push("📋 Registrar despacho en Policía de Carreteras (DIJIN) antes de salir");
    if (totalPirata >= 30) recs.push("🛡 Considerar escolta de seguridad para cargas de valor");
    if (totalPirata >= 10) recs.push("📡 Activar GPS con reporte en tiempo real desde centro de control");
    if (recs.length === 0) recs.push("✅ Ruta de bajo riesgo. Mantener protocolos estándar de seguridad");
    return { avgScore, label, maxArmed, maxNight, totalPirata, canonDepts, activeBlocks, recs };
  }, [routeDepts, pirataMap, userBlockades]);

  /* Map tile URL */
  const tileUrl = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttr = dark
    ? '&copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>';

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

      {/* Instruction banner */}
      <div style={{ background: dark ? "rgba(0,212,255,0.06)" : "rgba(3,105,161,0.05)", border: "1px solid rgba(0,212,255,0.2)", borderRadius: "10px", padding: "10px 14px", fontSize: "11px", color: textMuted, lineHeight: 1.6, display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span>🗺️ <strong style={{ color: textMain }}>Trazado punto a punto</strong> — Haga clic en el mapa para agregar puntos de ruta. Use la rueda del mouse para hacer zoom. Arrastre para desplazarse.</span>
        {waypoints.length > 0 && (
          <button onClick={() => { setWaypoints([]); setRouteCoords([]); setRouteDepts([]); }}
            style={{ marginLeft: "auto", fontSize: "10px", color: E.red, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "5px", padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>
            Limpiar todo
          </button>
        )}
        {routing && <span style={{ fontSize: "10px", color: E.cyan }}>⟳ Calculando ruta…</span>}
        {geocoding && <span style={{ fontSize: "10px", color: E.amber }}>⟳ Identificando departamentos…</span>}
        {error && <span style={{ fontSize: "10px", color: E.red }}>{error}</span>}
      </div>

      {/* Waypoint list */}
      {waypoints.length > 0 && (
        <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "10px", padding: "10px 14px" }}>
          <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "7px" }}>Puntos de ruta ({waypoints.length}/12)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {waypoints.map((wp, i) => {
              const isFirst = i === 0, isLast = i === waypoints.length - 1;
              const color = isFirst ? E.emerald : isLast ? E.cyan : E.amber;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", background: `${color}15`, border: `1px solid ${color}33`, borderRadius: "6px", padding: "3px 8px" }}>
                  <span style={{ fontSize: "9px", fontWeight: 800, color, minWidth: 14, textAlign: "center" }}>{i + 1}</span>
                  <span style={{ fontSize: "10px", color: textMain, fontFamily: "monospace" }}>{wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}</span>
                  <button onClick={() => removeWaypoint(i)} style={{ background: "transparent", border: "none", cursor: "pointer", color: textMuted, fontSize: "12px", lineHeight: 1, padding: "0 2px" }}>×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Leaflet map */}
      <div style={{ borderRadius: "12px", overflow: "hidden", border: `1px solid ${borderC}`, height: "420px" }}>
        <MapContainer
          center={[4.5709, -74.2973]}
          zoom={6}
          style={{ width: "100%", height: "100%" }}
          zoomControl={true}
        >
          <TileLayer url={tileUrl} attribution={tileAttr} />
          <ClickHandler onAdd={addWaypoint} disabled={routing} />

          {/* Route polyline */}
          {routeCoords.length > 1 && (
            <Polyline
              positions={routeCoords}
              color={E.cyan}
              weight={4}
              opacity={0.85}
              dashArray={undefined}
            />
          )}

          {/* Waypoint markers */}
          {waypoints.map((wp, i) => {
            const isFirst = i === 0, isLast = i === waypoints.length - 1;
            const color = isFirst ? E.emerald : isLast ? E.cyan : E.amber;
            return (
              <Marker
                key={i}
                position={[wp.lat, wp.lng]}
                icon={numberedIcon(i + 1, color)}
                eventHandlers={{ click: () => removeWaypoint(i) }}
              />
            );
          })}
        </MapContainer>
      </div>
      <div style={{ fontSize: "9px", color: textMuted, textAlign: "center" }}>
        Haga clic en un marcador para eliminarlo · Ruta calculada con OpenStreetMap / OSRM · Tiles: {dark ? "CartoDB Dark" : "OpenStreetMap"}
      </div>

      {/* Risk analysis */}
      {analysis && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: "10px" }}>
            <div style={{ background: panelBg, border: `1px solid ${analysis.label.color}44`, borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Riesgo Compuesto</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: analysis.label.color, lineHeight: 1 }}>{analysis.avgScore}<span style={{ fontSize: "11px", color: textMuted }}>/100</span></div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: analysis.label.color, marginTop: "3px" }}>{analysis.label.label}</div>
            </div>
            <div style={{ background: panelBg, border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Piratería</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: E.red, lineHeight: 1 }}>{analysis.totalPirata}</div>
              <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>casos en la ruta</div>
            </div>
            <div style={{ background: panelBg, border: "1px solid rgba(245,158,11,0.25)", borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Grupos Armados</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: analysis.maxArmed >= 3 ? E.red : analysis.maxArmed >= 2 ? E.amber : E.emerald, lineHeight: 1.2 }}>{armedLabel(analysis.maxArmed)}</div>
              <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>presencia máx. en ruta</div>
            </div>
            <div style={{ background: panelBg, border: "1px solid rgba(0,212,255,0.2)", borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Riesgo Nocturno</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: analysis.maxNight >= 75 ? E.red : analysis.maxNight >= 60 ? E.amber : E.emerald, lineHeight: 1 }}>{analysis.maxNight}%</div>
              <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>incidencia nocturna</div>
            </div>
          </div>

          {/* Departments identified */}
          {analysis.canonDepts.length > 0 && (
            <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "10px", padding: "10px 14px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Departamentos en Ruta Identificados</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {analysis.canonDepts.map(d => {
                  const s = compositeScore(d, pirataMap[d] ?? 0);
                  const l = riskLabel(s);
                  return (
                    <span key={d} style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: `${l.color}18`, border: `1px solid ${l.color}33`, color: l.color, fontWeight: 600 }}>
                      {d}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active blockades */}
          {analysis.activeBlocks.length > 0 && (
            <div style={{ background: panelBg, border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: E.red, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
                🚨 {analysis.activeBlocks.length} Bloqueo{analysis.activeBlocks.length > 1 ? "s" : ""} Activo{analysis.activeBlocks.length > 1 ? "s" : ""}
              </div>
              {analysis.activeBlocks.map(b => (
                <div key={b.id} style={{ fontSize: "11px", marginBottom: "4px", color: textMain }}>
                  <strong style={{ color: E.red }}>•</strong> {b.department} — {b.location} ({b.date})
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "7px" }}>📋 Recomendaciones Operacionales</div>
            {analysis.recs.map((r, i) => (
              <div key={i} style={{ fontSize: "11px", color: textMain, lineHeight: 1.6, padding: "3px 0", borderBottom: i < analysis.recs.length - 1 ? `1px solid ${borderC}` : "none" }}>{r}</div>
            ))}
          </div>
        </>
      )}

      {waypoints.length === 0 && (
        <div style={{ textAlign: "center", padding: "16px", fontSize: "11px", color: textMuted }}>
          Haga clic en cualquier punto del mapa para comenzar a trazar la ruta
        </div>
      )}
    </div>
  );
}
