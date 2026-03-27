import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  MapContainer, TileLayer, Marker, Polyline, Popup, useMapEvents, useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Blockade } from "@workspace/api-client-react";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const E = {
  bg: "#070c15", panel: "#0c1220", border: "rgba(255,255,255,0.07)",
  cyan: "#00d4ff", amber: "#f59e0b", red: "#ef4444", emerald: "#10b981",
  orange: "#f97316", textDim: "rgba(255,255,255,0.45)", violet: "#8b5cf6",
};

/* ─── Risk data ─── */
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
const ARMED: Record<string, { level: number; groups: string[] }> = {
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
  const p = Math.min(pirata / 80, 1) * 35;
  const a = (ARMED[dept]?.level ?? 0) / 3 * 25;
  const n = ((NIGHT_RISK[dept] ?? 60) - 50) / 35 * 15;
  return Math.min(100, Math.round(p + a + n));
}
function riskLabel(s: number) {
  if (s < 20) return { label: "BAJO",     color: E.emerald, bg: "rgba(16,185,129,0.13)" };
  if (s < 45) return { label: "MODERADO", color: E.amber,   bg: "rgba(245,158,11,0.13)" };
  if (s < 70) return { label: "ALTO",     color: E.orange,  bg: "rgba(249,115,22,0.13)" };
  return       { label: "CRÍTICO",  color: E.red,     bg: "rgba(239,68,68,0.13)"  };
}
function canonicalize(raw: string) {
  const norm = raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return Object.keys(ARMED).find(k =>
    k.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().startsWith(norm.slice(0,6))
  ) ?? "";
}
const BOGOTA_PIRATA_ALIASES = new Set(["bogota dc","bogota d.c.","bogota","santa fe de bogota"]);
function normPirataKey(s: string): string {
  const n = s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[,.]/g,"").toLowerCase().trim();
  return BOGOTA_PIRATA_ALIASES.has(n) ? "bogota dc" : n;
}
function fmtDist(m: number) {
  return m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtTime(s: number) {
  if (s < 3600) return `${Math.round(s/60)} min`;
  const h = Math.floor(s/3600), m = Math.round((s%3600)/60);
  return `${h}h ${m}m`;
}

/* ─── Nominatim ─── */
interface NomResult { display_name: string; lat: string; lon: string; address?: { state?: string } }
const geoCache: Record<string, NomResult[]> = {};
async function searchNominatim(q: string): Promise<NomResult[]> {
  if (!q.trim() || q.length < 2) return [];
  const key = q.toLowerCase().trim();
  if (geoCache[key]) return geoCache[key];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&countrycodes=co&accept-language=es&addressdetails=1`,
      { headers: { "User-Agent": "SafeNode-Dashboard/1.0" } }
    );
    const data: NomResult[] = await res.json();
    geoCache[key] = data;
    return data;
  } catch { return []; }
}
const deptCache: Record<string, string> = {};
async function getDept(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (deptCache[key]) return deptCache[key];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`,
      { headers: { "User-Agent": "SafeNode-Dashboard/1.0" } }
    );
    const data = await res.json();
    const st = data.address?.state ?? data.address?.province ?? "";
    deptCache[key] = st;
    return st;
  } catch { return ""; }
}

/* ─── Haversine util ─── */
function haversineDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function interpolateSegment(lat1: number, lng1: number, lat2: number, lng2: number, steps = 8): [number,number][] {
  const pts: [number,number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([lat1 + (lat2-lat1)*t, lng1 + (lng2-lng1)*t]);
  }
  return pts;
}
function buildFallbackRoute(wps: { lat: number; lng: number }[]): RouteResult {
  let totalDist = 0;
  const geometry: [number,number][] = [];
  for (let i = 0; i < wps.length; i++) {
    if (i > 0) totalDist += haversineDist(wps[i-1].lat, wps[i-1].lng, wps[i].lat, wps[i].lng);
    if (i < wps.length - 1) {
      const seg = interpolateSegment(wps[i].lat, wps[i].lng, wps[i+1].lat, wps[i+1].lng);
      geometry.push(...(i === 0 ? seg : seg.slice(1)));
    }
  }
  const avgSpeedMs = 60000 / 3600;
  return { geometry, distance: totalDist, duration: totalDist / avgSpeedMs, isEstimated: true };
}

/* ─── Route result type ─── */
interface RouteResult { geometry: [number,number][]; distance: number; duration: number; isEstimated?: boolean }

/* ─── Route parsers ─── */
function parseBRouterResponse(data: any): RouteResult | null {
  const feat = data?.geojson?.features?.[0];
  if (!feat?.geometry?.coordinates?.length) return null;
  const coords = feat.geometry.coordinates as [number, number, number][];
  return {
    geometry: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
    distance: parseInt(feat.properties?.["track-length"] ?? "0", 10),
    duration: parseInt(feat.properties?.["total-time"] ?? "0", 10),
    isEstimated: false,
  };
}
function parseOsrmResponse(data: any): RouteResult | null {
  const route = data.routes?.[0];
  if (!route?.geometry?.coordinates?.length) return null;
  return {
    geometry: route.geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng] as [number,number]),
    distance: route.distance,
    duration: route.duration,
    isEstimated: false,
  };
}

async function fetchRoute(wps: { lat: number; lng: number }[]): Promise<RouteResult | null> {
  if (wps.length < 2) return null;

  const coordStr = wps.map(w => `${w.lng},${w.lat}`).join(";");

  /* ── 1st try: BRouter via our API proxy (road-following, works from cloud) ── */
  try {
    const ctrl1 = new AbortController();
    const t1 = setTimeout(() => ctrl1.abort(), 15000);
    const proxyRes = await fetch(`/api/route?coords=${encodeURIComponent(coordStr)}`, { signal: ctrl1.signal });
    clearTimeout(t1);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      const parsed = parseBRouterResponse(data);
      if (parsed) return parsed;
    }
  } catch { /* fall through */ }

  /* ── 2nd try: direct OSRM from browser (in case user has access) ── */
  try {
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 8000);
    const directRes = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?geometries=geojson&overview=full`,
      { signal: ctrl2.signal }
    );
    clearTimeout(t2);
    if (directRes.ok) {
      const data = await directRes.json();
      const parsed = parseOsrmResponse(data);
      if (parsed) return parsed;
    }
  } catch { /* fall through */ }

  /* ── Fallback: haversine straight-line (always works) ── */
  return buildFallbackRoute(wps);
}

/* ─── Waypoint type ─── */
type WPType = "origin" | "via" | "dest";
interface WP { lat: number; lng: number; name: string; type: WPType }

/* ─── Pin icon ─── */
function pinIcon(type: WPType, n: number, pulse = false) {
  const color = type === "origin" ? E.emerald : type === "dest" ? "#ff4757" : E.amber;
  const label = type === "origin" ? "A" : type === "dest" ? "B" : `${n}`;
  const pulse_ring = pulse
    ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${color};animation:pls 1.2s ease-out infinite;opacity:0.6"></div>` : "";
  return L.divIcon({
    className: "",
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    popupAnchor: [0, -44],
    html: `
      <style>@keyframes pls{0%{transform:scale(1);opacity:0.6}100%{transform:scale(1.8);opacity:0}}</style>
      <div style="position:relative;display:inline-block">
        ${pulse_ring}
        <svg width="32" height="44" viewBox="0 0 32 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 2C9.37 2 4 7.37 4 14C4 23 16 42 16 42C16 42 28 23 28 14C28 7.37 22.63 2 16 2Z" fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
          <circle cx="16" cy="14" r="7" fill="white" fill-opacity="0.95"/>
          <text x="16" y="18" text-anchor="middle" font-size="9" font-weight="800" fill="${color}" font-family="system-ui,sans-serif">${label}</text>
        </svg>
      </div>`,
  });
}

/* ─── Map fly-to helper ─── */
function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], Math.max(map.getZoom(), 10), { duration: 1 }); }, [lat, lng]);
  return null;
}

/* Captures the Leaflet map instance into a ref so parent component can
   disable/enable map dragging while a marker drag is in progress. */
function MapRefCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  mapRef.current = map;
  return null;
}

/* ─── Click handler — uses a stable handler object via useMemo so the
       Leaflet event listener is registered only once. The callback ref is
       updated synchronously on every render to always reflect the latest state. ─── */
function MapClick({ onAdd }: { onAdd: (lat: number, lng: number) => void }) {
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd; // always current, no stale closure
  const handlers = useMemo(() => ({
    click: (e: L.LeafletMouseEvent) => { onAddRef.current(e.latlng.lat, e.latlng.lng); },
  }), []); // stable reference → useMapEvents runs once
  useMapEvents(handlers);
  return null;
}

/* ─── Search input with dropdown ─── */
interface SearchInputProps {
  label: string; icon: string; value: string; color: string;
  onChange: (v: string) => void;
  onSelect: (r: NomResult) => void;
  onClear: () => void;
  placeholder: string; dark: boolean; locked: boolean;
}
function SearchInput({ label, icon, value, color, onChange, onSelect, onClear, placeholder, dark, locked }: SearchInputProps) {
  const [suggestions, setSuggestions] = useState<NomResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const textMain = dark ? "#e2eaf4" : "#1a2a3a";
  const textMuted = dark ? E.textDim : "#64748b";
  const borderC = dark ? E.border : "rgba(0,0,0,0.07)";
  const inputBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const dropBg = dark ? "#111827" : "#ffffff";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => { document.removeEventListener("mousedown", handler); };
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handle = (v: string) => {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const res = await searchNominatim(v);
      setSuggestions(res);
      setOpen(res.length > 0);
      setLoading(false);
    }, 350);
  };

  const shortName = (dn: string) => dn.split(",").slice(0, 2).join(",");

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", background: inputBg, border: `1px solid ${locked ? color+"44" : borderC}`, borderRadius: "8px", padding: "7px 10px", transition: "border-color 0.2s" }}>
        <div style={{ fontSize: "16px", flexShrink: 0 }}>{icon}</div>
        <input
          type="text"
          value={value}
          onChange={e => !locked && handle(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder={locked ? "" : placeholder}
          readOnly={locked}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: locked ? color : textMain, fontSize: "12px", fontWeight: locked ? 600 : 400,
            cursor: locked ? "default" : "text",
          }}
        />
        {loading && <span style={{ fontSize: "10px", color: E.cyan, flexShrink: 0 }}>⟳</span>}
        {locked && (
          <button onClick={onClear} title="Cambiar"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: textMuted, fontSize: "14px", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>
            ×
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 9999,
          background: dropBg, border: `1px solid ${borderC}`, borderRadius: "8px",
          marginTop: "4px", overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {suggestions.map((s, i) => (
            <div key={i}
              onMouseDown={() => { onSelect(s); setOpen(false); setSuggestions([]); }}
              style={{
                padding: "9px 12px", cursor: "pointer", borderBottom: i < suggestions.length-1 ? `1px solid ${borderC}` : "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontSize: "11px", fontWeight: 600, color: textMain }}>{shortName(s.display_name)}</div>
              <div style={{ fontSize: "9px", color: textMuted, marginTop: "2px" }}>{s.display_name.split(",").slice(2, 4).join(",").trim()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════ STATIC DATASETS ════════ */

/* Centroides departamentales para marcadores de cierres */
const DEPT_CENTROIDS: Record<string, [number, number]> = {
  "Antioquia": [6.7009, -75.5128], "Atlántico": [10.6966, -74.8741], "Bolívar": [8.6704, -74.0328],
  "Boyacá": [5.4546, -73.3626], "Caldas": [5.2985, -75.2479], "Caquetá": [0.8699, -73.8419],
  "Cauca": [2.5359, -76.5956], "Cesar": [9.3373, -73.6536], "Chocó": [5.6940, -76.6583],
  "Córdoba": [8.3371, -75.4827], "Cundinamarca": [4.5709, -74.2973], "Huila": [2.5359, -75.5277],
  "La Guajira": [11.3548, -72.5205], "Magdalena": [10.3930, -74.3983], "Meta": [3.9960, -73.5493],
  "Nariño": [1.2892, -77.3579], "Norte de Santander": [7.9463, -72.8988], "Quindío": [4.5361, -75.6728],
  "Risaralda": [5.3158, -75.9929], "Santander": [6.6437, -73.6536], "Sucre": [9.0417, -75.0202],
  "Tolima": [3.7988, -75.1932], "Valle del Cauca": [3.8008, -76.6413], "Arauca": [6.9497, -71.6421],
  "Casanare": [5.3369, -72.3943], "Putumayo": [0.4359, -76.6400], "Amazonas": [-2.5933, -72.1944],
  "Guainía": [2.5854, -68.5247], "Guaviare": [2.1067, -72.9480], "Vaupés": [0.8554, -70.8118],
  "Vichada": [4.4234, -69.2877], "San Andrés": [12.5567, -81.7185], "Bogotá D.C.": [4.7109, -74.0721],
};

interface Peaje { name: string; lat: number; lng: number; dept: string; via: string; tarifa: string }
const PEAJES: Peaje[] = [
  { name: "Marahuaco", lat: 10.5745, lng: -75.4507, dept: "Bolívar", via: "Troncal del Caribe", tarifa: "Cat II: $11.600 | Cat IV: $18.300 | Cat VI: $38.200" },
  { name: "Caiquero", lat: 5.0654, lng: -74.4144, dept: "Cundinamarca", via: "Ruta Bogotá-Honda", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Pubenza", lat: 4.4033, lng: -74.7315, dept: "Cundinamarca", via: "Ruta Bogotá-Girardot", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Arcabuco", lat: 5.7950, lng: -73.4776, dept: "Boyacá", via: "Ruta Bogotá-Tunja", tarifa: "Cat II: $11.200 | Cat IV: $17.800 | Cat VI: $37.400" },
  { name: "Oiba", lat: 6.1783, lng: -73.3332, dept: "Santander", via: "Ruta Bucaramanga", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "La Cabaña", lat: 4.9700, lng: -75.1800, dept: "Caldas", via: "Ruta Medellín-Bogotá", tarifa: "Cat II: $11.600 | Cat IV: $18.500 | Cat VI: $38.900" },
  { name: "Camoa", lat: 4.1200, lng: -73.6300, dept: "Meta", via: "Ruta Bogotá-Villavicencio", tarifa: "Cat II: $12.100 | Cat IV: $19.200 | Cat VI: $40.100" },
  { name: "Pipiral", lat: 4.3500, lng: -73.9200, dept: "Meta", via: "Ruta Bogotá-Villavicencio", tarifa: "Cat II: $12.100 | Cat IV: $19.200 | Cat VI: $40.100" },
  { name: "El Triunfo", lat: 3.7200, lng: -76.2100, dept: "Valle del Cauca", via: "Ruta Cali-Buenaventura", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "La Paila", lat: 4.3550, lng: -75.9700, dept: "Valle del Cauca", via: "Panamericana Cali-Pereira", tarifa: "Cat II: $11.200 | Cat IV: $17.800 | Cat VI: $37.400" },
  { name: "Mulalo", lat: 4.6800, lng: -75.7300, dept: "Valle del Cauca", via: "Panamericana Cali-Bogotá", tarifa: "Cat II: $11.200 | Cat IV: $17.800 | Cat VI: $37.400" },
  { name: "La Virginia", lat: 4.9000, lng: -75.8700, dept: "Risaralda", via: "Ruta Pereira-Medellín", tarifa: "Cat II: $10.600 | Cat IV: $16.900 | Cat VI: $35.200" },
  { name: "Irra", lat: 5.2100, lng: -75.5600, dept: "Caldas", via: "Autopista Medellín-Cali", tarifa: "Cat II: $11.600 | Cat IV: $18.500 | Cat VI: $38.900" },
  { name: "Palogrande", lat: 5.8600, lng: -75.5900, dept: "Antioquia", via: "Autopista Medellín Sur", tarifa: "Cat II: $11.600 | Cat IV: $18.500 | Cat VI: $38.900" },
  { name: "Primavera", lat: 6.2800, lng: -75.5400, dept: "Antioquia", via: "Autopista Medellín Norte", tarifa: "Cat II: $11.600 | Cat IV: $18.500 | Cat VI: $38.900" },
  { name: "Hatillo", lat: 6.4100, lng: -75.3700, dept: "Antioquia", via: "Autopista Medellín-Bogotá", tarifa: "Cat II: $11.600 | Cat IV: $18.500 | Cat VI: $38.900" },
  { name: "Ciénaga de Oro", lat: 8.8700, lng: -75.6200, dept: "Córdoba", via: "Troncal del Caribe", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Caucasia", lat: 7.9800, lng: -75.1900, dept: "Antioquia", via: "Troncal del Caribe", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "San Roque", lat: 6.4800, lng: -74.8500, dept: "Antioquia", via: "Ruta del Sol", tarifa: "Cat II: $11.600 | Cat IV: $18.500 | Cat VI: $38.900" },
  { name: "El Korán", lat: 9.2800, lng: -74.7700, dept: "Bolívar", via: "Ruta del Sol", tarifa: "Cat II: $11.600 | Cat IV: $18.500 | Cat VI: $38.900" },
  { name: "Pelaya", lat: 9.0100, lng: -73.6700, dept: "Cesar", via: "Ruta del Sol Norte", tarifa: "Cat II: $11.600 | Cat IV: $18.500 | Cat VI: $38.900" },
  { name: "Bosconia", lat: 9.9700, lng: -73.9000, dept: "Cesar", via: "Troncal del Caribe Este", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "San Alberto", lat: 7.7700, lng: -73.3900, dept: "Cesar", via: "Ruta Bucaramanga-Cúcuta", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Pescadero", lat: 6.8800, lng: -73.0500, dept: "Santander", via: "Troncal Central Norte", tarifa: "Cat II: $11.600 | Cat IV: $18.500 | Cat VI: $38.900" },
  { name: "Lebrija", lat: 7.1200, lng: -73.2200, dept: "Santander", via: "Ruta Bucaramanga-Cúcuta", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Pamplona", lat: 7.3700, lng: -72.6500, dept: "Norte de Santander", via: "Ruta Cúcuta", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Pitalito", lat: 1.8600, lng: -76.0500, dept: "Huila", via: "Ruta Pasto-Bogotá", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "San Francisco", lat: 1.6100, lng: -76.9000, dept: "Putumayo", via: "Ruta Pasto-Mocoa", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Chachagüí", lat: 1.3600, lng: -77.2800, dept: "Nariño", via: "Panamericana Pasto", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Rumichaca", lat: 0.8100, lng: -77.6600, dept: "Nariño", via: "Panamericana Sur", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "El Rosal", lat: 4.8700, lng: -74.2700, dept: "Cundinamarca", via: "Ruta Bogotá-Medellín", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Tobia Grande", lat: 5.1100, lng: -74.3600, dept: "Cundinamarca", via: "Ruta Bogotá-Medellín", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Puerto Salgar", lat: 5.5400, lng: -74.6500, dept: "Cundinamarca", via: "Troncal del Magdalena", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "Tobiagrande", lat: 5.0200, lng: -74.3900, dept: "Cundinamarca", via: "Ruta Bogotá-Medellín", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
  { name: "La Tribuna", lat: 4.5000, lng: -74.4800, dept: "Cundinamarca", via: "Ruta Bogotá-Girardot", tarifa: "Cat II: $10.900 | Cat IV: $17.300 | Cat VI: $36.100" },
];

interface Bascula { name: string; lat: number; lng: number; dept: string; via: string; dir: string }
const BASCULAS: Bascula[] = [
  { name: "Básc. Bosa", lat: 4.5800, lng: -74.1900, dept: "Bogotá D.C.", via: "Autopista Sur", dir: "Ambos sentidos" },
  { name: "Básc. Fontibón", lat: 4.6800, lng: -74.1400, dept: "Bogotá D.C.", via: "Autopista Medellín", dir: "Ambos sentidos" },
  { name: "Básc. Briceño", lat: 5.0200, lng: -74.0600, dept: "Cundinamarca", via: "Autopista Norte", dir: "Ambos sentidos" },
  { name: "Básc. Tocaima", lat: 4.4600, lng: -74.6500, dept: "Cundinamarca", via: "Ruta Bogotá-Girardot", dir: "Ambos sentidos" },
  { name: "Básc. Honda", lat: 5.2100, lng: -74.7500, dept: "Tolima", via: "Troncal Magdalena", dir: "Ambos sentidos" },
  { name: "Básc. La Dorada", lat: 5.4500, lng: -74.6600, dept: "Caldas", via: "Troncal Magdalena", dir: "Ambos sentidos" },
  { name: "Básc. Puerto Triunfo", lat: 5.8800, lng: -74.7100, dept: "Antioquia", via: "Autopista Medellín-Bogotá", dir: "Ambos sentidos" },
  { name: "Básc. Caucasia", lat: 7.9700, lng: -75.1900, dept: "Antioquia", via: "Troncal Caribe", dir: "Ambos sentidos" },
  { name: "Básc. Planeta Rica", lat: 8.4100, lng: -75.5900, dept: "Córdoba", via: "Troncal Caribe", dir: "Ambos sentidos" },
  { name: "Básc. Bello", lat: 6.3400, lng: -75.5600, dept: "Antioquia", via: "Autopista Medellín Norte", dir: "Ambos sentidos" },
  { name: "Básc. Itagüí", lat: 6.1700, lng: -75.6100, dept: "Antioquia", via: "Autopista Medellín Sur", dir: "Ambos sentidos" },
  { name: "Básc. Rionegro", lat: 6.1500, lng: -75.3700, dept: "Antioquia", via: "Vía Llanogrande", dir: "Ambos sentidos" },
  { name: "Básc. Palmira", lat: 3.5500, lng: -76.3000, dept: "Valle del Cauca", via: "Panamericana Sur", dir: "Ambos sentidos" },
  { name: "Básc. Yumbo", lat: 3.5900, lng: -76.5100, dept: "Valle del Cauca", via: "Cali-Buenaventura", dir: "Ambos sentidos" },
  { name: "Básc. Jamundí", lat: 3.2600, lng: -76.5400, dept: "Valle del Cauca", via: "Panamericana Sur", dir: "Ambos sentidos" },
  { name: "Básc. Pereira Sur", lat: 4.8100, lng: -75.6800, dept: "Risaralda", via: "Autopista del Café", dir: "Ambos sentidos" },
  { name: "Básc. Manizales", lat: 5.0600, lng: -75.5100, dept: "Caldas", via: "Autopista del Café", dir: "Ambos sentidos" },
  { name: "Básc. Bucaramanga", lat: 7.0900, lng: -73.1300, dept: "Santander", via: "Troncal Central", dir: "Ambos sentidos" },
  { name: "Básc. Cúcuta", lat: 7.8700, lng: -72.5000, dept: "Norte de Santander", via: "Ruta 55", dir: "Ambos sentidos" },
  { name: "Básc. Barranquilla", lat: 11.0000, lng: -74.8600, dept: "Atlántico", via: "Troncal Caribe", dir: "Ambos sentidos" },
  { name: "Básc. Cartagena", lat: 10.3900, lng: -75.5100, dept: "Bolívar", via: "Ruta del Caribe", dir: "Ambos sentidos" },
  { name: "Básc. Pasto", lat: 1.2100, lng: -77.2800, dept: "Nariño", via: "Panamericana Sur", dir: "Ambos sentidos" },
  { name: "Básc. Villavicencio", lat: 4.1400, lng: -73.6400, dept: "Meta", via: "Ruta Bogotá-Llanos", dir: "Ambos sentidos" },
  { name: "Básc. Neiva", lat: 2.9300, lng: -75.2800, dept: "Huila", via: "Ruta Sur", dir: "Ambos sentidos" },
];

/* ════════ MAIN COMPONENT ════════ */
interface Props { dark?: boolean; userBlockades?: Blockade[]; pirataMap?: Record<string, number> }

const MAP_LAYERS = [
  {
    id: "oscuro",
    label: "Oscuro",
    icon: "🌑",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attr: "&copy; <a href='https://carto.com'>CARTO</a>",
  },
  {
    id: "satelite",
    label: "Satélite",
    icon: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "&copy; Esri, Maxar, Earthstar Geographics",
  },
  {
    id: "calles",
    label: "Calles",
    icon: "🗺️",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: "&copy; <a href='https://openstreetmap.org'>OpenStreetMap</a>",
  },
  {
    id: "topografico",
    label: "Topográfico",
    icon: "⛰️",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attr: "&copy; OpenTopoMap",
  },
  {
    id: "claro",
    label: "Claro",
    icon: "☀️",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attr: "&copy; <a href='https://carto.com'>CARTO</a>",
  },
] as const;
type MapLayerId = typeof MAP_LAYERS[number]["id"];

export function RouteMapBuilder({ dark = true, userBlockades = [], pirataMap = {} }: Props) {
  const textMain  = dark ? "#e2eaf4" : "#1a2a3a";
  const textMuted = dark ? E.textDim : "#64748b";
  const borderC   = dark ? E.border  : "rgba(0,0,0,0.07)";
  const panelBg   = dark ? E.panel   : "#ffffff";
  const cardBg    = dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";

  const [mapLayerId, setMapLayerId] = useState<MapLayerId>("oscuro");
  const activeLayer = MAP_LAYERS.find(l => l.id === mapLayerId) ?? MAP_LAYERS[0];

  /* ─ State ─ */
  const [origin, setOrigin] = useState<WP | null>(null);
  const [dest,   setDest]   = useState<WP | null>(null);
  const [vias,   setVias]   = useState<WP[]>([]);

  const [originText, setOriginText] = useState("");
  const [destText,   setDestText]   = useState("");
  const [viaTexts,   setViaTexts]   = useState<string[]>([]);

  const [mapClickMode, setMapClickMode] = useState<"origin" | "dest" | "via" | null>(null);
  const [flyTarget, setFlyTarget] = useState<{lat:number;lng:number}|null>(null);

  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeDepts,  setRouteDepts]  = useState<string[]>([]);
  const [routing,     setRouting]     = useState(false);
  const [geocoding,   setGeocoding]   = useState(false);
  const [routeError,  setRouteError]  = useState("");

  const [phase, setPhase] = useState<"setup" | "result">("setup");

  /* ─ Overlay layer toggles ─ */
  const [showPeajes,      setShowPeajes]      = useState(false);
  const [showBasculas,    setShowBasculas]    = useState(false);
  const [showBlockadesOnMap, setShowBlockadesOnMap] = useState(true);

  /* ─ Custom overlay icons ─ */
  const peajeIcon = useMemo(() => L.divIcon({
    className: "",
    html: `<div style="background:#f59e0b;border:2px solid #92400e;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,0.5);cursor:pointer">💲</div>`,
    iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -14],
  }), []);
  const basculaIcon = useMemo(() => L.divIcon({
    className: "",
    html: `<div style="background:#8b5cf6;border:2px solid #4c1d95;border-radius:4px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,0.5);cursor:pointer">⚖</div>`,
    iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -14],
  }), []);
  const blockadeIcon = useMemo(() => L.divIcon({
    className: "",
    html: `<div style="background:#ef4444;border:2px solid #7f1d1d;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 8px rgba(239,68,68,0.6);animation:pulse 1.5s infinite;cursor:pointer">🚨</div>`,
    iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -16],
  }), []);

  /* ─ Blockades on this route (uses routeDepts to avoid ordering deps) ─ */
  const routeBlockades = useMemo(() => {
    if (!showBlockadesOnMap || routeDepts.length === 0) return [];
    const canon = routeDepts.map(d => canonicalize(d)).filter(d => d in ARMED);
    if (canon.length === 0) return [];
    return userBlockades.filter(b => {
      if (b.status !== "activo" && b.status !== "intermitente") return false;
      const bd = canonicalize(b.department ?? "");
      return canon.some(d => d.toLowerCase().includes(bd.toLowerCase().slice(0,5)) || bd.toLowerCase().includes(d.toLowerCase().slice(0,5)));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBlockadesOnMap, userBlockades, routeDepts.join(",")]);

  /* ─ All waypoints in order (only ones with valid coords) ─ */
  const allWPs = (): WP[] => {
    const arr: WP[] = [];
    if (origin) arr.push(origin);
    vias.filter(v => v.lat !== 0 || v.lng !== 0).forEach(v => arr.push(v));
    if (dest) arr.push(dest);
    return arr;
  };

  // Can generate if we have origin + at least one other point (via or dest)
  const validVias = vias.filter(v => v.lat !== 0 || v.lng !== 0);
  const canGenerate = !!origin && (!!dest || validVias.length >= 1);

  /* ─ Refs so the stable MapClick handler always sees latest state ─ */
  const mapClickModeRef = useRef(mapClickMode);
  const originRef       = useRef(origin);
  const destRef         = useRef(dest);
  const viasRef         = useRef(vias);
  const leafletMapRef   = useRef<L.Map | null>(null); // captured by MapRefCapture
  mapClickModeRef.current = mapClickMode;
  originRef.current       = origin;
  destRef.current         = dest;
  viasRef.current         = vias;

  /* ─ Map click ─────────────────────────────────────────────────────
     Smart behaviour:
       • If a 📍 mode is active → use it
       • Otherwise: 1st click = origin, 2nd click = destination
     The callback is STABLE (empty deps) because it only reads refs.
  ─────────────────────────────────────────────────────────────────── */
  const handleMapClick = useCallback((lat: number, lng: number) => {
    const short = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const mode  = mapClickModeRef.current;

    if (mode === "origin") {
      setOrigin({ lat, lng, name: short, type: "origin" });
      setOriginText(short);
      setMapClickMode(null);
      setRouteResult(null); setRouteDepts([]); setPhase("setup");
      return;
    }
    if (mode === "dest") {
      setDest({ lat, lng, name: short, type: "dest" });
      setDestText(short);
      setMapClickMode(null);
      setRouteResult(null); setRouteDepts([]); setPhase("setup");
      return;
    }
    if (mode === "via") {
      const wp: WP = { lat, lng, name: short, type: "via" };
      setVias(prev => {
        const idx = prev.findIndex(v => v.lat === 0 && v.lng === 0);
        if (idx >= 0) { const c=[...prev]; c[idx]=wp; return c; }
        return [...prev, wp];
      });
      setViaTexts(prev => {
        const idx = viasRef.current.findIndex(v => v.lat === 0 && v.lng === 0);
        if (idx >= 0) { const c=[...prev]; c[idx]=short; return c; }
        return [...prev, short];
      });
      setMapClickMode(null);
      setRouteResult(null); setRouteDepts([]); setPhase("setup");
      return;
    }

    /* ── Auto mode: no button pressed ────────────────────────────────
       1st click  → origin
       All subsequent clicks → add via points (unlimited waypoints)
       When "Generar Ruta" is pressed, the LAST valid via becomes dest.
    ─────────────────────────────────────────────────────────────────── */
    if (!originRef.current) {
      setOrigin({ lat, lng, name: short, type: "origin" });
      setOriginText(short);
      setRouteResult(null); setRouteDepts([]); setPhase("setup");
    } else {
      // Add as a new via waypoint
      const wp: WP = { lat, lng, name: short, type: "via" };
      setVias(prev => [...prev, wp]);
      setViaTexts(prev => [...prev, short]);
      setRouteResult(null); setRouteDepts([]); setPhase("setup");
    }
  }, []); // stable — reads only refs

  /* ─ Nominatim select ─ */
  const selectNom = (r: NomResult, kind: "origin" | "dest" | "via", idx?: number) => {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
    const name = r.display_name.split(",").slice(0,2).join(", ").trim();
    setFlyTarget({ lat, lng });
    if (kind === "origin") {
      setOrigin({ lat, lng, name, type: "origin" });
      setOriginText(name);
    } else if (kind === "dest") {
      setDest({ lat, lng, name, type: "dest" });
      setDestText(name);
    } else if (idx !== undefined) {
      const updated = [...vias];
      updated[idx] = { lat, lng, name, type: "via" };
      setVias(updated);
      const vt = [...viaTexts];
      vt[idx] = name;
      setViaTexts(vt);
    }
    setPhase("setup");
    setRouteResult(null);
    setRouteDepts([]);
  };

  /* ─ Generate route ─ */
  const generateRoute = async () => {
    let effectiveDest = dest;

    // If no explicit destination, promote the last valid via to destination
    if (!effectiveDest && validVias.length >= 1) {
      const lastVia = validVias[validVias.length - 1];
      effectiveDest = { ...lastVia, type: "dest" };
      setDest(effectiveDest);
      setDestText(lastVia.name);
      setVias(prev => prev.filter(v => v !== lastVia));
      setViaTexts(prev => prev.filter((_, i) => vias[i] !== lastVia));
    }

    const wps: WP[] = [];
    if (origin) wps.push(origin);
    vias.filter(v => v.lat !== 0 || v.lng !== 0).forEach(v => {
      if (v !== effectiveDest) wps.push(v);
    });
    if (effectiveDest) wps.push(effectiveDest);

    if (wps.length < 2) return;
    setRouting(true); setRouteError(""); setPhase("result");
    const result = await fetchRoute(wps);
    setRouting(false);
    if (!result) { setRouteError("Error al calcular ruta. Intente nuevamente."); return; }
    setRouteResult(result);

    /* Geocode sample points along the route for risk */
    setGeocoding(true);
    const pts = result.geometry;
    const step = Math.max(1, Math.floor(pts.length / 8));
    const samples = pts.filter((_, i) => i % step === 0).slice(0, 10);
    const raw = await Promise.all(samples.map(([lat, lng]) => getDept(lat, lng)));
    const unique = [...new Set([...raw].filter(Boolean))];
    setRouteDepts(unique);
    setGeocoding(false);
  };

  /* ─ Recalculate route from an explicit list of WPs ─ */
  const recalculateRoute = useCallback(async (wps: WP[]) => {
    if (wps.length < 2) { setRouteResult(null); setRouteDepts([]); setPhase("setup"); return; }
    setRouting(true); setRouteError(""); setPhase("result");
    const result = await fetchRoute(wps);
    setRouting(false);
    if (!result) { setRouteError("Error al recalcular ruta."); return; }
    setRouteResult(result);
    setGeocoding(true);
    const pts = result.geometry;
    const step = Math.max(1, Math.floor(pts.length / 8));
    const samples = pts.filter((_, i) => i % step === 0).slice(0, 10);
    const raw = await Promise.all(samples.map(([lat, lng]) => getDept(lat, lng)));
    setRouteDepts([...new Set([...raw].filter(Boolean))]);
    setGeocoding(false);
  }, []);

  /* ─ Find which segment a click-on-polyline falls in ─
     Returns the index in the vias array where the new WP should be inserted.
     0 = before first via (after origin), vias.length = before dest. */
  const findViaInsertIndex = useCallback((clickLat: number, clickLng: number, wps: WP[], geometry: [number, number][]) => {
    if (wps.length < 2 || geometry.length < 2) return 0;
    // Map each waypoint to its closest geometry-point index
    const wpGeoIdx = wps.map(wp => {
      let minD = Infinity, idx = 0;
      for (let i = 0; i < geometry.length; i++) {
        const d = (geometry[i][0] - wp.lat) ** 2 + (geometry[i][1] - wp.lng) ** 2;
        if (d < minD) { minD = d; idx = i; }
      }
      return idx;
    });
    // Find geometry point closest to the click
    let minDist = Infinity, clickIdx = 0;
    for (let i = 0; i < geometry.length; i++) {
      const d = (geometry[i][0] - clickLat) ** 2 + (geometry[i][1] - clickLng) ** 2;
      if (d < minDist) { minDist = d; clickIdx = i; }
    }
    // Determine which segment (between which two wps) the click falls in
    for (let s = 0; s < wpGeoIdx.length - 1; s++) {
      if (clickIdx >= wpGeoIdx[s] && clickIdx <= wpGeoIdx[s + 1]) return s;
    }
    return wps.length - 2; // fallback: before dest
  }, []);

  /* ─ Click on the route line → insert a new via and recalculate ─ */
  const handlePolylineClick = useCallback((e: { latlng: { lat: number; lng: number } }) => {
    if (!routeResult || routeResult.isEstimated) return;
    const { lat, lng } = e.latlng;
    const name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const newVia: WP = { lat, lng, name, type: "via" };

    setVias(prevVias => {
      setViaTexts(prevTexts => {
        const insertAt = findViaInsertIndex(lat, lng, [
          ...(originRef.current ? [originRef.current] : []),
          ...prevVias,
          ...(destRef.current ? [destRef.current] : []),
        ], routeResult.geometry);
        const newVias = [...prevVias];
        newVias.splice(insertAt, 0, newVia);
        const newTexts = [...prevTexts];
        newTexts.splice(insertAt, 0, name);
        // schedule recalculate asynchronously with the updated wps
        const wps: WP[] = [
          ...(originRef.current ? [originRef.current] : []),
          ...newVias,
          ...(destRef.current ? [destRef.current] : []),
        ];
        setTimeout(() => recalculateRoute(wps), 0);
        return newTexts;
      });
      const insertAt = findViaInsertIndex(lat, lng, [
        ...(originRef.current ? [originRef.current] : []),
        ...prevVias,
        ...(destRef.current ? [destRef.current] : []),
      ], routeResult.geometry);
      const newVias = [...prevVias];
      newVias.splice(insertAt, 0, newVia);
      return newVias;
    });
  }, [routeResult, findViaInsertIndex, recalculateRoute]);

  /* ─ Clear all ─ */
  const clearAll = () => {
    setOrigin(null); setDest(null); setVias([]);
    setOriginText(""); setDestText(""); setViaTexts([]);
    setRouteResult(null); setRouteDepts([]); setRouteError("");
    setPhase("setup"); setMapClickMode(null);
  };

  /* ─ Risk analysis ─ */
  const canonDepts = routeDepts
    .map(d => canonicalize(d))
    .filter(d => d in ARMED);

  const avgScore = canonDepts.length
    ? Math.round(canonDepts.reduce((s,d) => s + compositeScore(d, pirataMap[normPirataKey(d)] ?? 0), 0) / canonDepts.length)
    : 0;
  const rl = riskLabel(avgScore);
  const maxArmed = canonDepts.length ? Math.max(...canonDepts.map(d => ARMED[d]?.level ?? 0)) : 0;
  const maxNight = canonDepts.length ? Math.max(...canonDepts.map(d => NIGHT_RISK[d] ?? 60)) : 0;
  const totalPirata = canonDepts.reduce((s,d) => s + (pirataMap[normPirataKey(d)] ?? 0), 0);
  const activeBlocks = userBlockades.filter(b =>
    canonDepts.some(d => d.toLowerCase().includes((b.department ?? "").toLowerCase().slice(0,5))) && b.status === "activo"
  );
  const recs: string[] = [];
  if (activeBlocks.length > 0) recs.push(`🚨 ${activeBlocks.length} BLOQUEO(S) ACTIVO(S) en departamentos de esta ruta`);
  if (maxNight >= 75) recs.push("⛔ Evitar tránsito entre 10 PM y 5 AM — alta incidencia nocturna");
  else if (maxNight >= 60) recs.push("⚠ Reducir velocidad y mantener comunicación en horario nocturno");
  if (maxArmed >= 3) recs.push("🚨 Coordinar con Policía Nacional antes de salir — alta presencia armada");
  else if (maxArmed === 2) recs.push("📋 Registrar despacho en Policía de Carreteras (DIJIN) antes de salir");
  if (totalPirata >= 30) recs.push("🛡 Considerar escolta de seguridad para cargas de valor");
  if (totalPirata >= 10) recs.push("📡 Activar GPS con reporte en tiempo real desde centro de control");
  if (recs.length === 0 && canonDepts.length > 0) recs.push("✅ Ruta de bajo riesgo. Mantener protocolos estándar de seguridad");

  /* ─ Route color by risk ─ */
  const routeColor = canonDepts.length === 0 ? E.cyan
    : avgScore < 20 ? E.emerald
    : avgScore < 45 ? E.amber
    : avgScore < 70 ? E.orange
    : E.red;

  /* ─ Map click mode banner ─ */
  const modeLabel: Record<string, string> = {
    origin: "Haga clic en el mapa para marcar el ORIGEN",
    dest:   "Haga clic en el mapa para marcar el DESTINO",
    via:    "Haga clic en el mapa para agregar PARADA INTERMEDIA",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* ── TOP PANEL: route inputs ── */}
      <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "14px" }}>

        {/* Header */}
        <div style={{ padding: "12px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: textMain, letterSpacing: "0.04em" }}>
            🗺️ Planificador de Ruta SafeNode
          </div>
          {(origin || dest) && (
            <button onClick={clearAll} style={{
              fontSize: "10px", color: E.red, background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)", borderRadius: "6px",
              padding: "3px 10px", cursor: "pointer",
            }}>
              Limpiar todo
            </button>
          )}
        </div>

        {/* Inputs */}
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>

          {/* Origin */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <SearchInput
                label="Origen" icon="🟢" value={originText} color={E.emerald}
                onChange={setOriginText} placeholder="Ciudad, municipio o dirección..."
                onSelect={r => selectNom(r, "origin")} onClear={() => { setOrigin(null); setOriginText(""); setRouteResult(null); setPhase("setup"); }}
                dark={dark} locked={!!origin}
              />
            </div>
            <button
              title="Marcar origen en el mapa"
              onClick={() => setMapClickMode(m => m === "origin" ? null : "origin")}
              style={{
                flexShrink: 0, width: 34, height: 34, borderRadius: "8px", cursor: "pointer",
                background: mapClickMode === "origin" ? `${E.emerald}22` : cardBg,
                border: `1px solid ${mapClickMode === "origin" ? E.emerald : borderC}`,
                color: mapClickMode === "origin" ? E.emerald : textMuted, fontSize: "14px",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
              }}>
              📍
            </button>
          </div>

          {/* Via points */}
          {vias.map((v, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
              <div style={{ flex: 1 }}>
                <SearchInput
                  label={`Parada ${i + 1}`} icon="🟡" value={viaTexts[i] ?? ""} color={E.amber}
                  onChange={t => { const vt=[...viaTexts]; vt[i]=t; setViaTexts(vt); }}
                  placeholder="Ciudad o punto intermedio..."
                  onSelect={r => selectNom(r, "via", i)}
                  onClear={() => { setVias(vias.filter((_,j)=>j!==i)); setViaTexts(viaTexts.filter((_,j)=>j!==i)); setRouteResult(null); setPhase("setup"); }}
                  dark={dark} locked={!!v.name && v.name===viaTexts[i]}
                />
              </div>
              <button onClick={() => { setVias(vias.filter((_,j)=>j!==i)); setViaTexts(viaTexts.filter((_,j)=>j!==i)); }}
                style={{ flexShrink:0, width:34, height:34, borderRadius:"8px", cursor:"pointer", background:cardBg, border:`1px solid ${borderC}`, color:E.red, fontSize:"16px", display:"flex", alignItems:"center", justifyContent:"center" }}>
                ×
              </button>
            </div>
          ))}

          {/* Destination */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <SearchInput
                label={`Destino${!dest && validVias.length > 0 ? " (auto = último punto)" : ""}`} icon="🔴" value={destText} color="#ff4757"
                onChange={setDestText} placeholder="Ciudad, municipio o dirección..."
                onSelect={r => selectNom(r, "dest")} onClear={() => { setDest(null); setDestText(""); setRouteResult(null); setPhase("setup"); }}
                dark={dark} locked={!!dest}
              />
            </div>
            <button
              title="Marcar destino en el mapa"
              onClick={() => setMapClickMode(m => m === "dest" ? null : "dest")}
              style={{
                flexShrink: 0, width: 34, height: 34, borderRadius: "8px", cursor: "pointer",
                background: mapClickMode === "dest" ? "rgba(255,71,87,0.15)" : cardBg,
                border: `1px solid ${mapClickMode === "dest" ? "#ff4757" : borderC}`,
                color: mapClickMode === "dest" ? "#ff4757" : textMuted, fontSize: "14px",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
              }}>
              📍
            </button>
          </div>

          {/* Controls row */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "2px" }}>
            <button
              onClick={() => { setVias(v=>[...v,{lat:0,lng:0,name:"",type:"via"}]); setViaTexts(t=>[...t,""]); }}
              style={{
                fontSize: "10px", color: E.amber, background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.25)", borderRadius: "6px",
                padding: "5px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
              }}>
              ＋ Ciudad intermedia
            </button>

            <button
              onClick={() => setMapClickMode(m => m === "dest" ? null : "dest")}
              style={{
                fontSize: "10px",
                color: mapClickMode === "dest" ? "#fff" : "#ff4757",
                background: mapClickMode === "dest" ? "rgba(255,71,87,0.25)" : "rgba(255,71,87,0.08)",
                border: `1px solid ${mapClickMode === "dest" ? "#ff4757" : "rgba(255,71,87,0.35)"}`,
                borderRadius: "6px", padding: "5px 12px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "5px", transition: "all 0.2s",
              }}>
              {mapClickMode === "dest" ? "🎯 Clic en mapa → DESTINO" : "🔴 Ciudad Final (B)"}
            </button>

            <button
              onClick={generateRoute}
              disabled={!canGenerate || routing}
              style={{
                flex: 1, fontSize: "12px", fontWeight: 700,
                color: canGenerate && !routing ? "#fff" : textMuted,
                background: canGenerate && !routing
                  ? `linear-gradient(135deg, ${E.cyan}, #0080ff)`
                  : cardBg,
                border: `1px solid ${canGenerate && !routing ? "transparent" : borderC}`,
                borderRadius: "8px", padding: "8px 16px", cursor: canGenerate && !routing ? "pointer" : "not-allowed",
                transition: "all 0.2s", letterSpacing: "0.04em",
                boxShadow: canGenerate && !routing ? "0 2px 12px rgba(0,212,255,0.25)" : "none",
              }}>
              {routing ? "⟳  Calculando ruta…" : "🗺️  Generar Ruta"}
            </button>
          </div>
        </div>
      </div>

      {/* ── MAP STATE BANNER ── */}
      {mapClickMode ? (
        <div style={{
          background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.3)",
          borderRadius: "10px", padding: "10px 14px", fontSize: "11px", fontWeight: 600,
          color: E.cyan, display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span style={{ fontSize: "18px" }}>📍</span>
          {modeLabel[mapClickMode]}
          <button onClick={() => setMapClickMode(null)}
            style={{ marginLeft: "auto", fontSize: "10px", color: textMuted, background: "transparent", border: "none", cursor: "pointer" }}>
            Cancelar
          </button>
        </div>
      ) : (
        <div style={{
          background: origin ? "rgba(16,185,129,0.07)" : "rgba(0,212,255,0.05)",
          border: `1px solid ${origin ? "rgba(16,185,129,0.25)" : "rgba(0,212,255,0.15)"}`,
          borderRadius: "10px", padding: "8px 14px", fontSize: "11px",
          color: origin ? E.emerald : E.cyan, display: "flex", alignItems: "center", gap: "8px",
        }}>
          <span>{mapClickMode === "dest" ? "🎯" : "👆"}</span>
          {mapClickMode === "dest"
            ? "Haga clic en el mapa para fijar el DESTINO FINAL (B)"
            : !origin
              ? "Haga clic en el mapa para fijar el ORIGEN (A)"
              : `Clic → agrega parada intermedia · Use "Ciudad Final (B)" para fijar el destino`
          }
          {origin && mapClickMode !== "dest" && (
            <span style={{ marginLeft: "auto", fontSize: "10px", color: textMuted }}>
              {validVias.length + (dest ? 1 : 0)} punto{validVias.length + (dest ? 1 : 0) !== 1 ? "s" : ""} agregado{validVias.length + (dest ? 1 : 0) !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* ── ROUTE ERROR ── */}
      {routeError && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", padding: "10px 14px", fontSize: "11px", color: E.red }}>
          ⚠ {routeError}
        </div>
      )}

      {/* ── MAP ── */}
      <div style={{ borderRadius: "14px", overflow: "hidden", border: `1px solid ${borderC}`, height: "440px", position: "relative" }}>

        {/* ── Layer selector (bottom-left overlay) ── */}
        <div style={{
          position: "absolute", bottom: 10, left: 10, zIndex: 1000,
          display: "flex", flexDirection: "column", gap: "3px",
          background: dark ? "rgba(7,12,21,0.90)" : "rgba(255,255,255,0.93)",
          border: `1px solid ${borderC}`, borderRadius: "10px", padding: "6px 8px",
          backdropFilter: "blur(6px)", boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          maxHeight: "380px", overflowY: "auto",
        }}>
          {/* Base tiles */}
          <div style={{ fontSize: "8px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>Fondo</div>
          {MAP_LAYERS.map(layer => (
            <button
              key={layer.id}
              onClick={() => setMapLayerId(layer.id)}
              title={layer.label}
              style={{
                display: "flex", alignItems: "center", gap: "5px", cursor: "pointer",
                background: mapLayerId === layer.id ? (dark ? "rgba(0,212,255,0.15)" : "rgba(0,100,200,0.1)") : "transparent",
                border: mapLayerId === layer.id ? `1px solid ${E.cyan}` : "1px solid transparent",
                borderRadius: "6px", padding: "3px 7px",
                fontSize: "10px", fontWeight: mapLayerId === layer.id ? 700 : 400,
                color: mapLayerId === layer.id ? E.cyan : textMuted,
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}
            >
              <span>{layer.icon}</span><span>{layer.label}</span>
            </button>
          ))}

          {/* Divider */}
          <div style={{ height: "1px", background: borderC, margin: "3px 0" }} />

          {/* Overlay layers */}
          <div style={{ fontSize: "8px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>Capas</div>
          {[
            { id: "peajes",   label: "Peajes", icon: "💲", active: showPeajes,      set: setShowPeajes,      color: E.amber },
            { id: "basculas", label: "Básculas", icon: "⚖", active: showBasculas,   set: setShowBasculas,   color: "#8b5cf6" },
            { id: "cierres",  label: "Cierres", icon: "🚨", active: showBlockadesOnMap, set: setShowBlockadesOnMap, color: E.red },
          ].map(ov => (
            <button
              key={ov.id}
              onClick={() => ov.set(!ov.active)}
              style={{
                display: "flex", alignItems: "center", gap: "5px", cursor: "pointer",
                background: ov.active ? `${ov.color}22` : "transparent",
                border: ov.active ? `1px solid ${ov.color}` : "1px solid transparent",
                borderRadius: "6px", padding: "3px 7px",
                fontSize: "10px", fontWeight: ov.active ? 700 : 400,
                color: ov.active ? ov.color : textMuted,
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}
            >
              <span>{ov.icon}</span><span>{ov.label}</span>
            </button>
          ))}

          {/* Divider */}
          <div style={{ height: "1px", background: borderC, margin: "3px 0" }} />

          {/* MNVCC link */}
          <a
            href="https://sig.policia.gov.co/MNVCC/"
            target="_blank"
            rel="noopener noreferrer"
            title="Mapa Nacional de Vigilancia Comunitaria por Cuadrantes — Policía Nacional"
            style={{
              display: "flex", alignItems: "center", gap: "5px", textDecoration: "none",
              background: "transparent", border: "1px solid transparent",
              borderRadius: "6px", padding: "3px 7px",
              fontSize: "10px", color: textMuted, whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,212,255,0.08)"; e.currentTarget.style.color = E.cyan; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = textMuted; }}
          >
            <span>🚔</span><span>Cuadrantes ↗</span>
          </a>
        </div>

        {/* Map legend */}
        {phase === "result" && routeResult && (
          <div style={{
            position: "absolute", top: 10, right: 10, zIndex: 1000,
            background: dark ? "rgba(12,18,32,0.92)" : "rgba(255,255,255,0.92)",
            border: `1px solid ${borderC}`, borderRadius: "10px", padding: "8px 12px",
            backdropFilter: "blur(6px)", boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Ruta</div>
            <div style={{ fontSize: "13px", fontWeight: 800, color: E.cyan }}>{fmtDist(routeResult.distance)}</div>
            <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>{fmtTime(routeResult.duration)}</div>
            {canonDepts.length > 0 && (
              <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: `1px solid ${borderC}` }}>
                <div style={{ fontSize: "9px", color: textMuted, marginBottom: "2px" }}>Riesgo compuesto</div>
                <div style={{ fontSize: "12px", fontWeight: 800, color: rl.color }}>{avgScore}/100 — {rl.label}</div>
              </div>
            )}
            {geocoding && <div style={{ fontSize: "9px", color: E.amber, marginTop: "4px" }}>⟳ Analizando riesgo…</div>}
          </div>
        )}

        <MapContainer
          center={[4.5709, -74.2973]}
          zoom={6}
          style={{ width: "100%", height: "100%" }}
          zoomControl
        >
          <MapRefCapture mapRef={leafletMapRef} />
          <TileLayer key={activeLayer.id} url={activeLayer.url} attribution={activeLayer.attr} />
          <MapClick onAdd={handleMapClick} />
          {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}

          {/* Route polyline */}
          {routeResult && routeResult.geometry.length > 1 && (
            <>
              {!routeResult.isEstimated && (
                <Polyline positions={routeResult.geometry} color="rgba(0,0,0,0.4)" weight={8} opacity={0.5} />
              )}
              <Polyline
                positions={routeResult.geometry}
                color={routeColor}
                weight={routeResult.isEstimated ? 3 : 5}
                opacity={routeResult.isEstimated ? 0.75 : 0.95}
                dashArray={routeResult.isEstimated ? "8, 6" : undefined}
              />
              {/* Invisible wide hit-area for click-to-reshape (only for real road routes) */}
              {!routeResult.isEstimated && (
                <Polyline
                  positions={routeResult.geometry}
                  color="transparent"
                  weight={22}
                  opacity={0}
                  eventHandlers={{ click: handlePolylineClick as never }}
                />
              )}
            </>
          )}

          {/* Markers — role from wp.type, not position */}
          {allWPs().map((wp, i) => {
            const viaIdxInArray = vias.indexOf(wp);
            return (
              <Marker
                key={`${wp.lat}-${wp.lng}-${i}`}
                position={[wp.lat, wp.lng]}
                icon={pinIcon(wp.type, i, false)}
                draggable
                eventHandlers={{
                  dragstart: () => {
                    // Lock map pan so it doesn't compete with the marker drag
                    leafletMapRef.current?.dragging.disable();
                  },
                  dragend: async (e) => {
                    // Re-enable map pan immediately after drag finishes
                    leafletMapRef.current?.dragging.enable();
                    const { lat, lng } = e.target.getLatLng();
                    const name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    // Build updated WP list synchronously before state settles
                    const updOrigin = wp.type === "origin" ? { ...wp, lat, lng, name } : originRef.current;
                    const updDest   = wp.type === "dest"   ? { ...wp, lat, lng, name } : destRef.current;
                    const updVias   = viasRef.current.map((v, idx) =>
                      idx === viaIdxInArray ? { ...v, lat, lng, name } : v
                    );
                    if (wp.type === "origin") { setOrigin(updOrigin); setOriginText(name); }
                    else if (wp.type === "dest") { setDest(updDest); setDestText(name); }
                    else if (viaIdxInArray >= 0) {
                      setVias(updVias);
                      setViaTexts(prev => { const c=[...prev]; c[viaIdxInArray]=name; return c; });
                    }
                    // Auto-recalculate route with the new positions
                    const wps: WP[] = [
                      ...(updOrigin ? [updOrigin] : []),
                      ...updVias.filter(v => v.lat !== 0 || v.lng !== 0),
                      ...(updDest ? [updDest] : []),
                    ];
                    await recalculateRoute(wps);
                  }
                }}
              />
            );
          })}

          {/* ── Peajes overlay ── */}
          {showPeajes && PEAJES.map(p => (
            <Marker key={`p-${p.name}`} position={[p.lat, p.lng]} icon={peajeIcon}>
              <Popup>
                <div style={{ minWidth: "180px" }}>
                  <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "4px" }}>💲 {p.name}</div>
                  <div style={{ fontSize: "11px", color: "#555", marginBottom: "2px" }}>📍 {p.dept}</div>
                  <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>🛣 {p.via}</div>
                  <div style={{ fontSize: "10px", background: "#fef3c7", borderRadius: "4px", padding: "4px 6px", lineHeight: 1.6 }}>
                    <strong>Tarifas aprox. 2024</strong><br />{p.tarifa.split(" | ").map(t => <span key={t} style={{ display:"block" }}>{t}</span>)}
                  </div>
                  <div style={{ fontSize: "9px", color: "#999", marginTop: "4px" }}>Fuente: INVIAS (ref. tarifaria)</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* ── Básculas overlay ── */}
          {showBasculas && BASCULAS.map(b => (
            <Marker key={`bas-${b.name}`} position={[b.lat, b.lng]} icon={basculaIcon}>
              <Popup>
                <div style={{ minWidth: "170px" }}>
                  <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "4px" }}>⚖ {b.name}</div>
                  <div style={{ fontSize: "11px", color: "#555", marginBottom: "2px" }}>📍 {b.dept}</div>
                  <div style={{ fontSize: "11px", color: "#555", marginBottom: "2px" }}>🛣 {b.via}</div>
                  <div style={{ fontSize: "11px", background: "#ede9fe", borderRadius: "4px", padding: "3px 6px" }}>
                    <strong>Sentido:</strong> {b.dir}
                  </div>
                  <div style={{ fontSize: "9px", color: "#999", marginTop: "4px" }}>Estación INVIAS de pesaje</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* ── Cierres activos sobre la ruta ── */}
          {routeBlockades.map((bl, idx) => {
            const center = DEPT_CENTROIDS[bl.department ?? ""] ?? null;
            if (!center) return null;
            return (
              <Marker key={`bl-${idx}`} position={center} icon={blockadeIcon}>
                <Popup>
                  <div style={{ minWidth: "200px" }}>
                    <div style={{ fontWeight: 700, fontSize: "13px", color: "#dc2626", marginBottom: "4px" }}>
                      🚨 CIERRE ACTIVO
                    </div>
                    <div style={{ fontSize: "11px", marginBottom: "2px" }}><strong>Dpto:</strong> {bl.department}</div>
                    <div style={{ fontSize: "11px", marginBottom: "2px" }}><strong>Corredor:</strong> {bl.corridorId}</div>
                    <div style={{ fontSize: "11px", marginBottom: "2px" }}><strong>Ubicación:</strong> {bl.location}</div>
                    <div style={{ fontSize: "11px", marginBottom: "4px" }}>
                      <strong>Estado:</strong>{" "}
                      <span style={{ color: bl.status === "activo" ? "#dc2626" : "#d97706" }}>
                        {bl.status === "activo" ? "🔴 Activo" : "🟡 Intermitente"}
                      </span>
                    </div>
                    {bl.cause && <div style={{ fontSize: "10px", background: "#fee2e2", borderRadius: "4px", padding: "3px 6px" }}><strong>Causa:</strong> {bl.cause?.replace("_", " ")}</div>}
                    <div style={{ fontSize: "9px", color: "#999", marginTop: "4px" }}>Fecha: {bl.date}</div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* ── Drag hint ── */}
      <div style={{ fontSize: "9px", color: textMuted, textAlign: "center" }}>
        Clic en el mapa → agrega puntos de ruta · <strong style={{ color: E.cyan, opacity: 0.8 }}>Clic en la línea de ruta → inserta desvío y recalcula</strong> · Arrastra un pin → recalcula automáticamente · Rueda del mouse para zoom
      </div>

      {/* ── ROUTE SUMMARY CARDS ── */}
      {phase === "result" && routeResult && (
        <>
          {routeResult.isEstimated && (
            <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "8px 12px", fontSize: "10px", color: E.amber, display: "flex", gap: "6px", alignItems: "flex-start" }}>
              <span>⚠</span>
              <span><strong>Ruta estimada (línea directa)</strong> — Servidor de rutas no disponible. La línea trazada muestra la trayectoria aproximada y el análisis de riesgo sigue siendo válido.</span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: "10px" }}>
            {[
              { label: "Distancia", value: fmtDist(routeResult.distance), sub: routeResult.isEstimated ? "línea directa (estimada)" : "por carretera", color: E.cyan, border: "rgba(0,212,255,0.25)" },
              { label: "Tiempo Est.", value: fmtTime(routeResult.duration), sub: routeResult.isEstimated ? "estimado a 60 km/h" : "conducción normal", color: E.violet, border: "rgba(139,92,246,0.25)" },
              { label: "Riesgo Compuesto", value: canonDepts.length ? `${avgScore}/100` : "—", sub: canonDepts.length ? rl.label : "Analizando…", color: rl.color, border: `${rl.color}44` },
              { label: "Paradas", value: String(vias.length), sub: vias.length === 0 ? "directo" : vias.length === 1 ? "1 parada" : `${vias.length} paradas`, color: E.amber, border: "rgba(245,158,11,0.25)" },
            ].map(c => (
              <div key={c.label} style={{ background: panelBg, border: `1px solid ${c.border}`, borderRadius: "10px", padding: "12px 14px" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>{c.label}</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
                <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Departments */}
          {canonDepts.length > 0 && (
            <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "10px", padding: "11px 14px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "7px" }}>Departamentos en Ruta</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {canonDepts.map(d => {
                  const s = compositeScore(d, pirataMap[normPirataKey(d)] ?? 0);
                  const l = riskLabel(s);
                  return (
                    <span key={d} style={{ fontSize: "10px", padding: "3px 9px", borderRadius: "5px", background: l.bg, border: `1px solid ${l.color}33`, color: l.color, fontWeight: 600 }}>
                      {d} · {s}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active blockades */}
          {activeBlocks.length > 0 && (
            <div style={{ background: panelBg, border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: E.red, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
                🚨 {activeBlocks.length} Bloqueo{activeBlocks.length > 1 ? "s" : ""} Activo{activeBlocks.length > 1 ? "s" : ""}
              </div>
              {activeBlocks.map(b => (
                <div key={b.id} style={{ fontSize: "11px", marginBottom: "4px", color: textMain }}>
                  <strong style={{ color: E.red }}>•</strong> {b.department} — {b.location} ({b.date})
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {recs.length > 0 && (
            <div style={{ background: panelBg, border: `1px solid ${borderC}`, borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "7px" }}>📋 Recomendaciones Operacionales</div>
              {recs.map((r, i) => (
                <div key={i} style={{ fontSize: "11px", color: textMain, lineHeight: 1.7, padding: "3px 0", borderBottom: i < recs.length-1 ? `1px solid ${borderC}` : "none" }}>{r}</div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Empty state ── */}
      {phase === "setup" && !origin && !dest && validVias.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 20px", fontSize: "11px", color: textMuted, lineHeight: 2 }}>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>🗺️</div>
          <strong style={{ color: textMain, fontSize: "12px" }}>Cómo trazar su ruta</strong><br/>
          <span>1. Haga clic en el mapa para marcar el <strong style={{ color: E.emerald }}>INICIO (A)</strong></span><br/>
          <span>2. Siga haciendo clic para agregar todos los <strong style={{ color: E.amber }}>PUNTOS INTERMEDIOS</strong> que necesite</span><br/>
          <span>3. El último punto que agregue será el <strong style={{ color: "#ff4757" }}>DESTINO (B)</strong> al generar la ruta</span><br/>
          <span style={{ fontSize: "10px" }}>También puede escribir nombres de ciudades en los campos de búsqueda</span>
        </div>
      )}
    </div>
  );
}
