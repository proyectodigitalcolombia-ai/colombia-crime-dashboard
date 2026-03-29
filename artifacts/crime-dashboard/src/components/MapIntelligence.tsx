import { useState, useCallback, useRef, useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  useGetBlockades,
  useGetCrimesByDepartment,
} from "@workspace/api-client-react";
import { useRoadConditions } from "@/hooks/useRoadConditions";
import {
  Layers, Eye, EyeOff, AlertTriangle, MapPin, Moon, Shield, Route,
  RefreshCw, ChevronLeft, ChevronRight, Info,
} from "lucide-react";

/* ── icons fix ── */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const GEO_URL =
  "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9064dd/colombia.geo.json";

/* ── static data ── */
const ARMED: Record<string, { level: number; groups: string[] }> = {
  "Bogotá D.C.": { level: 0, groups: [] }, "Cundinamarca": { level: 1, groups: ["Disidencias FARC"] },
  "Boyacá": { level: 1, groups: ["ELN"] }, "Antioquia": { level: 2, groups: ["Clan del Golfo","Disidencias FARC"] },
  "Caldas": { level: 1, groups: ["Disidencias FARC"] }, "Risaralda": { level: 1, groups: ["Disidencias FARC"] },
  "Quindío": { level: 0, groups: [] }, "Valle del Cauca": { level: 2, groups: ["Disidencias FARC","Clan del Golfo"] },
  "Cauca": { level: 3, groups: ["Estado Mayor Central","ELN"] }, "Nariño": { level: 3, groups: ["Estado Mayor Central","ELN"] },
  "Tolima": { level: 2, groups: ["Disidencias FARC"] }, "Huila": { level: 2, groups: ["Disidencias FARC"] },
  "Meta": { level: 2, groups: ["Estado Mayor Central"] }, "Casanare": { level: 2, groups: ["Disidencias FARC"] },
  "Arauca": { level: 3, groups: ["ELN","Disidencias FARC"] }, "Santander": { level: 1, groups: ["ELN"] },
  "Norte de Santander": { level: 2, groups: ["ELN","Clan del Golfo"] }, "Bolívar": { level: 2, groups: ["Clan del Golfo","ELN"] },
  "Atlántico": { level: 1, groups: ["Clan del Golfo"] }, "Córdoba": { level: 3, groups: ["Clan del Golfo"] },
  "Sucre": { level: 2, groups: ["Clan del Golfo"] }, "Cesar": { level: 2, groups: ["Clan del Golfo","ELN"] },
  "Magdalena": { level: 2, groups: ["Clan del Golfo"] }, "La Guajira": { level: 1, groups: ["Clan del Golfo"] },
  "Chocó": { level: 3, groups: ["Clan del Golfo","ELN"] }, "Caquetá": { level: 3, groups: ["Estado Mayor Central"] },
  "Putumayo": { level: 3, groups: ["Estado Mayor Central"] }, "Guaviare": { level: 2, groups: ["Estado Mayor Central"] },
  "Vichada": { level: 1, groups: ["Disidencias FARC"] }, "Guainía": { level: 1, groups: ["Disidencias FARC"] },
  "Vaupés": { level: 1, groups: ["Disidencias FARC"] }, "Amazonas": { level: 0, groups: [] },
};

const NIGHT_RISK: Record<string, number> = {
  "Bogotá D.C.": 55, "Cundinamarca": 70, "Boyacá": 65, "Antioquia": 72, "Caldas": 60,
  "Risaralda": 58, "Quindío": 55, "Valle del Cauca": 68, "Cauca": 75, "Nariño": 78,
  "Tolima": 72, "Huila": 68, "Meta": 80, "Casanare": 75, "Arauca": 82,
  "Santander": 65, "Norte de Santander": 70, "Bolívar": 62, "Atlántico": 50, "Córdoba": 65,
  "Sucre": 60, "Cesar": 68, "Magdalena": 65, "La Guajira": 60, "Chocó": 75,
  "Caquetá": 80, "Putumayo": 82, "Guaviare": 78, "Vichada": 70, "Guainía": 65,
  "Vaupés": 70, "Amazonas": 60,
};

const ROAD: Record<string, { score: "good"|"regular"|"difficult"; notes: string }> = {
  "Bogotá D.C.": { score:"good", notes:"Acceso urbano controlado" }, "Cundinamarca": { score:"regular", notes:"Tramo La Vega: curvas y neblina" },
  "Boyacá": { score:"regular", notes:"Alto de Sote: deslizamientos en lluvias" }, "Antioquia": { score:"regular", notes:"Túnel de Occidente: restricciones de altura" },
  "Caldas": { score:"difficult", notes:"Vía Neira-Irra: derrumbes frecuentes" }, "Risaralda": { score:"good", notes:"Doble calzada en buen estado" },
  "Quindío": { score:"good", notes:"Autopista del Café en buen estado" }, "Valle del Cauca": { score:"good", notes:"Mayores desvíos en zonas rurales" },
  "Cauca": { score:"difficult", notes:"Bloqueos frecuentes. Popayán-Piendamó: alto riesgo" }, "Nariño": { score:"difficult", notes:"Vía Rumichaca: neblina y deslizamientos" },
  "Tolima": { score:"regular", notes:"Zona de Fresno: curvas pronunciadas" }, "Huila": { score:"regular", notes:"Vía Neiva-Mocoa: tramos sin pavimentar" },
  "Meta": { score:"good", notes:"Llano abierto, atención en neblina" }, "Casanare": { score:"regular", notes:"Sin doble calzada, vigilancia reducida" },
  "Arauca": { score:"difficult", notes:"Vías en mal estado, sin doble calzada" }, "Santander": { score:"good", notes:"Ruta del Sol en buen estado" },
  "Norte de Santander": { score:"regular", notes:"Cúcuta-Tibú: zona de conflicto" }, "Bolívar": { score:"regular", notes:"Mompox: barcazas en temporada seca" },
  "Atlántico": { score:"good", notes:"Acceso a puertos en buen estado" }, "Córdoba": { score:"regular", notes:"Accesos rurales en mal estado" },
  "Sucre": { score:"regular", notes:"Inundaciones en temporada" }, "Cesar": { score:"good", notes:"Troncal del Caribe en buen estado" },
  "Magdalena": { score:"regular", notes:"Santa Marta: tráfico portuario alto" }, "La Guajira": { score:"regular", notes:"Accesos secundarios sin pavimentar" },
  "Chocó": { score:"difficult", notes:"Sin vías pavimentadas en mayoría" }, "Caquetá": { score:"difficult", notes:"Vías en mal estado, lluvias frecuentes" },
  "Putumayo": { score:"difficult", notes:"Tramos inestables" }, "Guaviare": { score:"difficult", notes:"Acceso fluvial o aéreo" },
  "Vichada": { score:"difficult", notes:"Sin vías primarias" }, "Guainía": { score:"difficult", notes:"Sin vías primarias" },
  "Vaupés": { score:"difficult", notes:"Sin vías terrestres" }, "Amazonas": { score:"difficult", notes:"Acceso fluvial/aéreo" },
};

type LayerKey = "grupos" | "riesgo" | "delitos" | "vias" | "ninguna";
type BasemapKey = "dark" | "streets" | "satellite";

const BASEMAPS: Record<BasemapKey, { label: string; url: string; attr: string }> = {
  dark: {
    label: "Oscuro",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  streets: {
    label: "Calles",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    label: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
  },
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
function matchDept(raw: string): string {
  const n = normalize(raw);
  return Object.keys(ARMED).find(k => normalize(k).startsWith(n.slice(0,5))) ?? raw;
}

function armedColor(level: number) {
  if (level === 0) return "#1a2a1a";
  if (level === 1) return "#2d4a1e";
  if (level === 2) return "#7a3a00";
  return "#6b0000";
}
function nightColor(v: number) {
  if (v < 60) return "#1a2a3a";
  if (v < 70) return "#1e3a5f";
  if (v < 75) return "#5c3d00";
  return "#5c0000";
}
function roadColor(s: "good"|"regular"|"difficult") {
  if (s === "good") return "#0a2e1a";
  if (s === "regular") return "#2e2a00";
  return "#3a0a00";
}
function crimeColor(v: number, max: number) {
  const t = max > 0 ? v / max : 0;
  if (t < 0.2) return "#0a1e2a";
  if (t < 0.4) return "#0a2e4a";
  if (t < 0.6) return "#1a3a5c";
  if (t < 0.8) return "#5c2a00";
  return "#6b0000";
}

/* ── Map bounds fitter ── */
function FitBounds() {
  const map = useMap();
  useEffect(() => {
    // Colombia bounding box
    map.fitBounds([[-4.2, -79], [12.5, -66.8]], { padding: [10, 10] });
  }, [map]);
  return null;
}

interface Props { dark?: boolean; }

export function MapIntelligence({ dark = true }: Props) {
  const [activeLayer, setActiveLayer] = useState<LayerKey>("grupos");
  const [showBlockades, setShowBlockades] = useState(true);
  const [basemap, setBasemap] = useState<BasemapKey>("dark");
  const [panelOpen, setPanelOpen] = useState(true);
  const [geoData, setGeoData] = useState<any>(null);
  const geoRef = useRef<L.GeoJSON | null>(null);

  const { data: blockades = [] } = useGetBlockades(undefined, { query: { refetchInterval: 60000 } });
  const { data: crimesByDept = [] } = useGetCrimesByDepartment({});

  /* Build crime totals by dept */
  const crimeTotals = crimesByDept.reduce((acc: Record<string, number>, d: any) => {
    const key = matchDept(d.department ?? "");
    acc[key] = (acc[key] ?? 0) + (d.totalCount ?? 0);
    return acc;
  }, {} as Record<string, number>);
  const maxCrimes = Math.max(1, ...Object.values(crimeTotals));

  /* Fetch GeoJSON once */
  useEffect(() => {
    fetch(GEO_URL).then(r => r.json()).then(setGeoData).catch(() => {});
  }, []);

  /* Re-render GeoJSON when layer changes */
  const geoStyle = useCallback((feature: any) => {
    const raw = feature?.properties?.NOMBRE_DPT ?? feature?.properties?.name ?? "";
    const dept = matchDept(raw);
    let fillColor = "#1a2233";

    if (activeLayer === "grupos") fillColor = armedColor(ARMED[dept]?.level ?? 0);
    else if (activeLayer === "riesgo") fillColor = nightColor(NIGHT_RISK[dept] ?? 60);
    else if (activeLayer === "vias") fillColor = roadColor(ROAD[dept]?.score ?? "regular");
    else if (activeLayer === "delitos") fillColor = crimeColor(crimeTotals[dept] ?? 0, maxCrimes);
    else fillColor = "#141e2e";

    return {
      fillColor,
      fillOpacity: activeLayer === "ninguna" ? 0.12 : 0.72,
      color: "rgba(255,255,255,0.12)",
      weight: 0.8,
    };
  }, [activeLayer, crimeTotals, maxCrimes]);

  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    const raw = feature?.properties?.NOMBRE_DPT ?? feature?.properties?.name ?? "";
    const dept = matchDept(raw);
    const armed = ARMED[dept];
    const nightRisk = NIGHT_RISK[dept] ?? "--";
    const road = ROAD[dept];
    const crimes = crimeTotals[dept] ?? 0;

    const armedLabel = ["Sin presencia","Baja","Media","Alta","Crítica"][armed?.level ?? 0] ?? "—";
    const armedColor2 = ["#10b981","#f59e0b","#f97316","#ef4444"][armed?.level ?? 0] ?? "#888";
    const roadLabel = { good:"Buenas", regular:"Regular", difficult:"Difíciles" }[road?.score ?? "regular"];
    const roadColor2 = { good:"#10b981", regular:"#f59e0b", difficult:"#ef4444" }[road?.score ?? "regular"];

    const html = `
      <div style="font-family:sans-serif;font-size:13px;min-width:200px;color:#e2e8f0">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#00d4ff">${dept}</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="color:#94a3b8;padding:2px 0">Grupos armados</td>
              <td style="text-align:right;font-weight:600;color:${armedColor2}">${armedLabel}</td></tr>
          ${armed?.groups?.length ? `<tr><td colspan="2" style="font-size:11px;color:#64748b;padding-bottom:4px">${armed.groups.join(" · ")}</td></tr>` : ""}
          <tr><td style="color:#94a3b8;padding:2px 0">Riesgo nocturno</td>
              <td style="text-align:right;font-weight:600;color:#a78bfa">${nightRisk}/100</td></tr>
          <tr><td style="color:#94a3b8;padding:2px 0">Condiciones vías</td>
              <td style="text-align:right;font-weight:600;color:${roadColor2}">${roadLabel}</td></tr>
          <tr><td style="color:#94a3b8;padding:2px 0">Delitos registrados</td>
              <td style="text-align:right;font-weight:600;color:#f59e0b">${crimes.toLocaleString("es-CO")}</td></tr>
          ${road?.notes ? `<tr><td colspan="2" style="font-size:11px;color:#64748b;padding-top:4px;border-top:1px solid rgba(255,255,255,0.08)">${road.notes}</td></tr>` : ""}
        </table>
      </div>`;
    layer.bindPopup(html, { maxWidth: 280, className: "dark-popup" });
  }, [crimeTotals]);

  const LAYERS: { key: LayerKey; label: string; icon: any; color: string; legend: { label: string; color: string }[] }[] = [
    {
      key: "grupos", label: "Presencia Armada", icon: Shield, color: "#ef4444",
      legend: [
        { label: "Sin presencia", color: "#1a2a1a" }, { label: "Baja", color: "#2d4a1e" },
        { label: "Media", color: "#7a3a00" }, { label: "Alta / Crítica", color: "#6b0000" },
      ],
    },
    {
      key: "riesgo", label: "Riesgo Nocturno", icon: Moon, color: "#a78bfa",
      legend: [
        { label: "< 60", color: "#1a2a3a" }, { label: "60–70", color: "#1e3a5f" },
        { label: "70–75", color: "#5c3d00" }, { label: "> 75", color: "#5c0000" },
      ],
    },
    {
      key: "delitos", label: "Estadísticas Delictivas", icon: AlertTriangle, color: "#f59e0b",
      legend: [
        { label: "Muy bajo", color: "#0a1e2a" }, { label: "Bajo", color: "#0a2e4a" },
        { label: "Medio", color: "#1a3a5c" }, { label: "Alto", color: "#5c2a00" }, { label: "Crítico", color: "#6b0000" },
      ],
    },
    {
      key: "vias", label: "Condiciones Viales", icon: Route, color: "#10b981",
      legend: [
        { label: "Buenas", color: "#0a2e1a" }, { label: "Regular", color: "#2e2a00" }, { label: "Difíciles", color: "#3a0a00" },
      ],
    },
    {
      key: "ninguna", label: "Sin capa base", icon: Layers, color: "#64748b",
      legend: [],
    },
  ];

  const activeLayerMeta = LAYERS.find(l => l.key === activeLayer)!;
  const activeBlockades = blockades.filter((b: any) => b.status === "activo" || !b.status);

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 120px)", minHeight: 500, borderRadius: 12, overflow: "hidden" }}>

      {/* ── MAP ── */}
      <MapContainer
        center={[4.5, -74.3]}
        zoom={6}
        style={{ width: "100%", height: "100%", background: "#070c15" }}
        zoomControl={true}
        attributionControl={false}
      >
        <FitBounds />
        <TileLayer
          key={basemap}
          url={BASEMAPS[basemap].url}
          attribution={BASEMAPS[basemap].attr}
        />

        {/* Choropleth GeoJSON */}
        {geoData && (
          <GeoJSON
            key={`${activeLayer}-${JSON.stringify(crimeTotals).length}`}
            data={geoData}
            style={geoStyle}
            onEachFeature={onEachFeature}
          />
        )}

        {/* Bloqueos markers */}
        {showBlockades && activeBlockades.map((b: any) => {
          if (!b.lat || !b.lng) return null;
          const srcColor = b.source === "news_rss" ? "#00d4ff"
            : b.source === "news_import" ? "#a78bfa" : "#ef4444";
          return (
            <CircleMarker
              key={b.id}
              center={[b.lat, b.lng]}
              radius={8}
              pathOptions={{
                color: srcColor, fillColor: srcColor,
                fillOpacity: 0.85, weight: 2,
              }}
            >
              <Popup className="dark-popup">
                <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#e2e8f0", minWidth: 180 }}>
                  <div style={{ fontWeight: 700, color: srcColor, marginBottom: 6 }}>
                    🚧 Bloqueo {b.source === "news_rss" ? "RSS" : b.source === "news_import" ? "IA" : "Manual"}
                  </div>
                  <div><span style={{ color: "#94a3b8" }}>Dept: </span>{b.department}</div>
                  <div><span style={{ color: "#94a3b8" }}>Ubicación: </span>{b.location}</div>
                  <div><span style={{ color: "#94a3b8" }}>Causa: </span>{b.cause}</div>
                  {b.notes && <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{b.notes}</div>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* ── LAYER PANEL ── */}
      <div style={{
        position: "absolute", top: 16, right: panelOpen ? 16 : -260, zIndex: 1000,
        width: 260, background: "rgba(7,12,21,0.93)", backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
        transition: "right 0.3s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Layers size={15} style={{ color: "#00d4ff" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", letterSpacing: "0.04em" }}>
              Capas
            </span>
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 2 }}>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Basemap selector */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
            Mapa base
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(Object.keys(BASEMAPS) as BasemapKey[]).map(k => (
              <button
                key={k}
                onClick={() => setBasemap(k)}
                style={{
                  flex: 1, padding: "5px 4px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  background: basemap === k ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.05)",
                  color: basemap === k ? "#00d4ff" : "rgba(255,255,255,0.5)",
                  border: `1px solid ${basemap === k ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.07)"}`,
                  transition: "all 0.15s",
                }}>
                {BASEMAPS[k].label}
              </button>
            ))}
          </div>
        </div>

        {/* Choropleth layers */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
            Capa departamental
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {LAYERS.map(l => {
              const Icon = l.icon;
              const active = activeLayer === l.key;
              return (
                <button
                  key={l.key}
                  onClick={() => setActiveLayer(l.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, padding: "7px 10px",
                    borderRadius: 7, cursor: "pointer", textAlign: "left", width: "100%",
                    background: active ? `${l.color}18` : "transparent",
                    border: `1px solid ${active ? `${l.color}40` : "transparent"}`,
                    transition: "all 0.15s",
                  }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: active ? l.color : "rgba(255,255,255,0.2)",
                  }} />
                  <Icon size={13} style={{ color: active ? l.color : "rgba(255,255,255,0.35)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)" }}>
                    {l.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Overlay layers */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
            Superposiciones
          </div>
          <button
            onClick={() => setShowBlockades(p => !p)}
            style={{
              display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", width: "100%",
              borderRadius: 7, cursor: "pointer",
              background: showBlockades ? "rgba(239,68,68,0.12)" : "transparent",
              border: `1px solid ${showBlockades ? "rgba(239,68,68,0.3)" : "transparent"}`,
              transition: "all 0.15s",
            }}>
            {showBlockades ? <Eye size={13} style={{ color: "#ef4444" }} /> : <EyeOff size={13} style={{ color: "rgba(255,255,255,0.35)" }} />}
            <MapPin size={13} style={{ color: showBlockades ? "#ef4444" : "rgba(255,255,255,0.35)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: showBlockades ? 600 : 400, color: showBlockades ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)" }}>
              Bloqueos activos
            </span>
            {activeBlockades.length > 0 && (
              <span style={{
                marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#ef4444",
                background: "rgba(239,68,68,0.15)", borderRadius: 10, padding: "1px 6px",
              }}>
                {activeBlockades.filter((b: any) => b.lat && b.lng).length}
              </span>
            )}
          </button>
        </div>

        {/* Legend */}
        {activeLayerMeta.legend.length > 0 && (
          <div style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
              Leyenda — {activeLayerMeta.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activeLayerMeta.legend.map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 20, height: 12, borderRadius: 3, background: l.color, border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tip */}
        <div style={{ padding: "8px 14px 12px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Info size={11} style={{ color: "rgba(255,255,255,0.3)", marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
              Haga clic en un departamento o bloqueo para ver detalles.
            </span>
          </div>
        </div>
      </div>

      {/* ── Panel toggle button (when collapsed) ── */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 1001,
            background: "rgba(7,12,21,0.93)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8, padding: "8px 10px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, color: "#00d4ff",
            backdropFilter: "blur(12px)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}>
          <Layers size={16} />
          <ChevronLeft size={14} />
        </button>
      )}

      {/* ── Dark popup CSS ── */}
      <style>{`
        .dark-popup .leaflet-popup-content-wrapper {
          background: #0c1220 !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
        }
        .dark-popup .leaflet-popup-tip {
          background: #0c1220 !important;
        }
        .dark-popup .leaflet-popup-content {
          margin: 12px 14px !important;
        }
        .leaflet-container {
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}
