import { useState, useEffect, useRef } from "react";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = localStorage.getItem("safenode_token");
  const h: Record<string, string> = { ...(extra ?? {}) };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export interface UserRoute {
  id: number;
  name: string;
  origin: string;
  destination: string;
  ruta_code: string;
  description: string;
  total_points: number;
  sheet_name: string;
  created_at: string;
}

export interface RoutePoint {
  n: number;
  dept: string;
  mun: string;
  nombre: string;
  tipo: string;
  desc: string;
  lat: number;
  lng: number;
  alt: number;
  vel: number;
  controles: string;
  riesgo: number;
}

interface Props {
  onRoutesChange: (activeRoutes: { route: UserRoute; points: RoutePoint[] }[]) => void;
}

const TIPO_COLOR: Record<string, string> = {
  "PUNTO CRITICO": "#ef4444",
  "CUERPOS DE AGUA": "#38bdf8",
  "INFRAESTRUCTURA Y EQUIPAMIENTO": "#a78bfa",
  "CENTRO POBLADO": "#34d399",
  "ZONA AGRICOLA": "#86efac",
  "AREAS NATURALES PROTEGIDAS": "#4ade80",
};
const tipoColor = (t: string) => TIPO_COLOR[t] ?? "#94a3b8";

export default function RouteManager({ onRoutesChange }: Props) {
  const [open, setOpen] = useState(false);
  const [routes, setRoutes] = useState<UserRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [activeIds, setActiveIds] = useState<Set<number>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [activeData, setActiveData] = useState<Map<number, { route: UserRoute; points: RoutePoint[] }>>(new Map());
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchRoutes() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/user-routes`, { headers: authHeaders() });
      if (r.ok) setRoutes(await r.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (open) fetchRoutes(); }, [open]);

  async function toggleRoute(route: UserRoute) {
    const id = route.id;
    if (activeIds.has(id)) {
      const next = new Set(activeIds);
      next.delete(id);
      setActiveIds(next);
      const nextData = new Map(activeData);
      nextData.delete(id);
      setActiveData(nextData);
      onRoutesChange(Array.from(nextData.values()));
      return;
    }
    if (activeIds.size >= 5) {
      alert("Máximo 5 rutas activas simultáneamente para no sobrecargar el mapa.");
      return;
    }
    setLoadingIds(prev => new Set(prev).add(id));
    try {
      const r = await fetch(`${BASE}/api/user-routes/${id}/points`, { headers: authHeaders() });
      if (!r.ok) return;
      const points: RoutePoint[] = await r.json();
      const next = new Set(activeIds);
      next.add(id);
      setActiveIds(next);
      const nextData = new Map(activeData);
      nextData.set(id, { route, points });
      setActiveData(nextData);
      onRoutesChange(Array.from(nextData.values()));
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  async function deleteRoute(id: number) {
    if (!confirm("¿Eliminar esta ruta permanentemente?")) return;
    await fetch(`${BASE}/api/user-routes/${id}`, { method: "DELETE", headers: authHeaders() });
    const next = new Set(activeIds);
    next.delete(id);
    setActiveIds(next);
    const nextData = new Map(activeData);
    nextData.delete(id);
    setActiveData(nextData);
    onRoutesChange(Array.from(nextData.values()));
    fetchRoutes();
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    if (customName.trim()) fd.append("name", customName.trim());
    try {
      const r = await fetch(`${BASE}/api/user-routes/upload`, { method: "POST", body: fd, headers: authHeaders() });
      const data = await r.json();
      if (r.ok) {
        setUploadMsg({ ok: true, text: `✓ "${data.name}" importada — ${data.total_points} puntos GPS` });
        setCustomName("");
        fetchRoutes();
      } else {
        setUploadMsg({ ok: false, text: data.error ?? "Error al importar" });
      }
    } catch {
      setUploadMsg({ ok: false, text: "Error de conexión" });
    } finally {
      setUploading(false);
    }
  }

  const filtered = routes.filter(r =>
    search === "" ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.origin.toLowerCase().includes(search.toLowerCase()) ||
    r.destination.toLowerCase().includes(search.toLowerCase())
  );

  const COLORS = ["#f59e0b","#22d3ee","#a78bfa","#34d399","#fb923c"];

  return (
    <>
      {/* Botón de apertura */}
      <div style={{ position: "absolute", bottom: 24, left: 168, zIndex: 1000 }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: open ? "rgba(245,158,11,0.2)" : "rgba(7,12,21,0.93)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${open ? "#f59e0b" : "rgba(245,158,11,0.3)"}`,
            borderRadius: 10, padding: "10px 16px",
            color: "#f59e0b", cursor: "pointer",
            fontFamily: "sans-serif", fontSize: 13, fontWeight: 600,
          }}
        >
          📂 Mis Rutas {routes.length > 0 && <span style={{ background: "#f59e0b", color: "#000", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{routes.length}</span>}
        </button>
      </div>

      {/* Panel */}
      {open && (
        <div style={{
          position: "absolute", bottom: 72, left: 168, zIndex: 1001,
          width: 420, maxHeight: "75vh",
          background: "rgba(7,12,21,0.97)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(245,158,11,0.2)", borderRadius: 14,
          display: "flex", flexDirection: "column", fontFamily: "sans-serif",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        }}>
          {/* Header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "#f59e0b", fontWeight: 700 }}>SAFENODE · GESTIÓN DE RUTAS</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginTop: 2 }}>Mis Rutas de Estudio</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>

            {/* Upload */}
            <div
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#f59e0b"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = "rgba(245,158,11,0.2)"; }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.style.borderColor = "rgba(245,158,11,0.2)";
                const f = e.dataTransfer.files[0];
                if (f) handleUpload(f);
              }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: "2px dashed rgba(245,158,11,0.3)", borderRadius: 10,
                padding: "14px 16px", cursor: "pointer", textAlign: "center",
                transition: "border-color 0.2s",
              }}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
              />
              {uploading ? (
                <div style={{ color: "#f59e0b", fontSize: 13 }}>⏳ Procesando archivo...</div>
              ) : (
                <>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>📁</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>Arrastra un Excel aquí o haz clic para subir</div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>Formato: Matriz de Puntos Críticos SafeNode (.xlsx)</div>
                </>
              )}
            </div>

            {/* Nombre personalizado */}
            <input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="Nombre personalizado para la ruta (opcional)"
              style={{
                marginTop: 8, width: "100%", boxSizing: "border-box",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "7px 12px", color: "#e2e8f0", fontSize: 12,
                outline: "none", fontFamily: "sans-serif",
              }}
            />

            {uploadMsg && (
              <div style={{
                marginTop: 8, padding: "8px 12px", borderRadius: 8, fontSize: 12,
                background: uploadMsg.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${uploadMsg.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                color: uploadMsg.ok ? "#4ade80" : "#f87171",
              }}>
                {uploadMsg.text}
              </div>
            )}
          </div>

          {/* Buscador */}
          <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Buscar ruta por nombre, origen o destino..."
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, padding: "7px 12px", color: "#e2e8f0", fontSize: 12,
                outline: "none", fontFamily: "sans-serif",
              }}
            />
          </div>

          {/* Lista de rutas */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {loading && <div style={{ textAlign: "center", color: "#475569", padding: 20, fontSize: 13 }}>Cargando rutas...</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: "center", color: "#334155", padding: 24, fontSize: 13 }}>
                {routes.length === 0 ? "Aún no hay rutas cargadas.\nSube tu primer archivo Excel ↑" : "Sin resultados para \"" + search + "\""}
              </div>
            )}
            {filtered.map((route, i) => {
              const isActive = activeIds.has(route.id);
              const isLoading = loadingIds.has(route.id);
              const color = COLORS[Array.from(activeIds).indexOf(route.id) % COLORS.length] ?? COLORS[0];
              const activeIndex = Array.from(activeIds).indexOf(route.id);
              const activeColor = activeIndex >= 0 ? COLORS[activeIndex % COLORS.length] : "#f59e0b";

              // Risk stats from route
              return (
                <div key={route.id} style={{
                  margin: "4px 12px", borderRadius: 10,
                  border: `1px solid ${isActive ? activeColor + "40" : "rgba(255,255,255,0.06)"}`,
                  background: isActive ? `${activeColor}08` : "rgba(255,255,255,0.02)",
                  padding: "10px 14px", transition: "all 0.2s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: isActive ? activeColor : "#e2e8f0", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {route.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {route.origin} → {route.destination}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, background: "rgba(255,255,255,0.06)", color: "#94a3b8", padding: "2px 7px", borderRadius: 10 }}>
                          📍 {route.total_points} puntos GPS
                        </span>
                        <span style={{ fontSize: 10, color: "#475569" }}>
                          {new Date(route.created_at).toLocaleDateString("es-CO")}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => toggleRoute(route)}
                        disabled={isLoading}
                        style={{
                          padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700,
                          border: `1px solid ${isActive ? activeColor : "rgba(245,158,11,0.4)"}`,
                          background: isActive ? `${activeColor}22` : "transparent",
                          color: isActive ? activeColor : "#f59e0b",
                          cursor: isLoading ? "wait" : "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        {isLoading ? "⏳" : isActive ? "✓ Activa" : "Ver ruta"}
                      </button>
                      <button
                        onClick={() => deleteRoute(route.id)}
                        style={{ padding: "4px 8px", borderRadius: 6, fontSize: 10, border: "1px solid rgba(239,68,68,0.2)", background: "transparent", color: "#64748b", cursor: "pointer" }}
                      >
                        🗑 Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {activeIds.size > 0 && (
            <div style={{ padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "#475569" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{activeIds.size}/5 rutas activas en el mapa</span>
                <button
                  onClick={() => { setActiveIds(new Set()); setActiveData(new Map()); onRoutesChange([]); }}
                  style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}
                >
                  Desactivar todas
                </button>
              </div>
              {/* Leyenda de tipos */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {Object.entries(TIPO_COLOR).slice(0,4).map(([tipo, color]) => (
                  <div key={tipo} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                    <span style={{ fontSize: 10, color: "#475569" }}>{tipo === "PUNTO CRITICO" ? "Crítico" : tipo === "CUERPOS DE AGUA" ? "Agua" : tipo === "INFRAESTRUCTURA Y EQUIPAMIENTO" ? "Infraest." : "Poblado"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
