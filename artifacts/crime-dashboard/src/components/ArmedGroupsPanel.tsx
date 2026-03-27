import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, LineChart, Line,
} from "recharts";

/* ── Types ──────────────────────────────────────────────────────── */
interface GroupPresence { department: string; level: "alta" | "media" | "baja" }
interface ArmedGroup {
  id: string; name: string; shortName: string; color: string;
  description: string; activities: string[]; logisticsRisk: "critical" | "high" | "medium" | "low";
  riskNote: string; annualIncidents: Record<string, number>; presence: GroupPresence[];
}
interface ArmedGroupsMeta {
  lastUpdated: string; dataSource: string; note: string;
  totalGroups: number; totalIncidents2024: number;
}
interface DeptPresence {
  department: string;
  groups: { groupId: string; groupName: string; shortName: string; color: string; level: "alta" | "media" | "baja" }[];
  groupCount: number; maxRisk: string; highPresenceCount: number;
}

/* ── Palette ────────────────────────────────────────────────────── */
const E = {
  bg: "#070c15", panel: "#0c1220", border: "rgba(255,255,255,0.07)",
  cyan: "#00d4ff", amber: "#f59e0b", textDim: "rgba(255,255,255,0.45)",
  textDimLight: "#6b7280",
};

const RISK_LABEL: Record<string, string> = {
  critical: "CRÍTICO", high: "ALTO", medium: "MEDIO", low: "BAJO",
};
const RISK_COLOR: Record<string, string> = {
  critical: "#ef4444", high: "#f59e0b", medium: "#a855f7", low: "#10b981",
};
const LEVEL_COLOR: Record<string, string> = {
  alta: "#ef4444", media: "#f59e0b", baja: "#64748b",
};
const LEVEL_LABEL: Record<string, string> = {
  alta: "Alta", media: "Media", baja: "Baja",
};

function Badge({ label, color, dark }: { label: string; color: string; dark: boolean }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: "4px",
      fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em",
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>{label}</span>
  );
}

function ExecTooltip({ active, payload, label, dark }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const bg = dark ? "rgba(10,16,30,0.97)" : "rgba(255,255,255,0.98)";
  const border = dark ? "rgba(0,212,255,0.25)" : "rgba(3,105,161,0.25)";
  const text = dark ? "#e2e8f0" : "#1e293b";
  const muted = dark ? "rgba(255,255,255,0.45)" : "#64748b";
  return (
    <div style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: "8px", padding: "10px 14px", color: text, fontSize: "12px", backdropFilter: "blur(12px)", boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.7)" : "0 4px 16px rgba(0,0,0,0.12)", minWidth: "160px" }}>
      <div style={{ marginBottom: "8px", fontWeight: 700, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: dark ? E.cyan : "#0369a1" }}>{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: entry.color, flexShrink: 0 }} />
          <span style={{ color: muted, flex: 1 }}>{entry.name}</span>
          <span style={{ fontWeight: 700, fontFamily: "IBM Plex Mono, monospace" }}>{typeof entry.value === "number" ? entry.value.toLocaleString("es-CO") : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function ExecLegend({ payload, dark }: any) {
  if (!payload || payload.length === 0) return null;
  const muted = dark ? E.textDim : E.textDimLight;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px 14px", fontSize: "11px", marginTop: "8px" }}>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: entry.color }} />
          <span style={{ color: muted }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────── */
export function ArmedGroupsPanel({ dark }: { dark: boolean }) {
  const [groups, setGroups] = useState<ArmedGroup[]>([]);
  const [meta, setMeta] = useState<ArmedGroupsMeta | null>(null);
  const [deptData, setDeptData] = useState<DeptPresence[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [activeView, setActiveView] = useState<"overview" | "mapa" | "tendencia">("overview");
  const [selectedYear, setSelectedYear] = useState("2025");

  const text = dark ? "#e2e8f0" : "#1e293b";
  const mutedText = dark ? E.textDim : E.textDimLight;
  const gridColor = dark ? E.border : "#e0e5ee";
  const tickColor = dark ? "rgba(255,255,255,0.35)" : "#6b7280";
  const panelBg = dark ? E.panel : "#ffffff";
  const borderColor = dark ? E.border : "rgba(0,0,0,0.07)";

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [groupsRes, deptRes] = await Promise.all([
          fetch("/api/armed-groups"),
          fetch("/api/armed-groups/by-department"),
        ]);
        const groupsData = await groupsRes.json();
        const deptDataRaw = await deptRes.json();
        setGroups(groupsData.groups ?? []);
        setMeta(groupsData.meta ?? null);
        setDeptData(deptDataRaw ?? []);
      } catch (err) {
        console.error("Error fetching armed groups:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredDeptData = useMemo(() => {
    if (selectedGroup === "all") return deptData;
    return deptData.filter(d => d.groups.some(g => g.groupId === selectedGroup));
  }, [deptData, selectedGroup]);

  const trendData = useMemo(() => {
    const years = ["2022", "2023", "2024", "2025", "2026"];
    return years.map(y => {
      const row: Record<string, any> = { year: y };
      for (const g of groups) {
        row[g.shortName] = g.annualIncidents[y] ?? null;
      }
      return row;
    });
  }, [groups]);

  const ALL_YEARS = ["2022", "2023", "2024", "2025", "2026"] as const;
  const prevYear = String(Number(selectedYear) - 1);
  const totalIncidentsYear = groups.reduce((s, g) => s + (g.annualIncidents[selectedYear] ?? 0), 0);

  const cardStyle = {
    background: panelBg,
    borderRadius: "12px",
    border: `1px solid ${borderColor}`,
    padding: "20px",
    boxShadow: dark ? "0 2px 16px rgba(0,0,0,0.4)" : "0 1px 8px rgba(0,0,0,0.06)",
  };

  const subBtnActive = {
    padding: "6px 14px", borderRadius: "6px", fontSize: "11px", fontWeight: 700,
    border: "none", cursor: "pointer",
    background: dark ? "rgba(0,212,255,0.15)" : "rgba(3,105,161,0.12)",
    color: dark ? E.cyan : "#0369a1",
  };
  const subBtnInactive = {
    ...subBtnActive,
    background: "transparent",
    color: mutedText,
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "400px", color: mutedText, fontSize: "14px" }}>
        Cargando datos de grupos armados…
      </div>
    );
  }

  return (
    <div style={{ color: text }}>

      {/* ── SOURCE NOTE ── */}
      {meta && (
        <div style={{ marginBottom: "20px", padding: "10px 16px", borderRadius: "8px", background: dark ? "rgba(0,212,255,0.06)" : "rgba(3,105,161,0.06)", border: `1px solid ${dark ? "rgba(0,212,255,0.15)" : "rgba(3,105,161,0.12)"}`, fontSize: "11px", color: mutedText, display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          <span>📊 <strong style={{ color: text }}>Fuente:</strong> {meta.dataSource}</span>
          <span>🕐 <strong style={{ color: text }}>Actualización:</strong> {new Date(meta.lastUpdated).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}</span>
          <span style={{ flex: 1 }}>⚠️ {meta.note}</span>
        </div>
      )}

      {/* ── YEAR SELECTOR ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: mutedText }}>Año de referencia:</span>
        {ALL_YEARS.map(y => (
          <button key={y} onClick={() => setSelectedYear(y)}
            style={{
              padding: "4px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
              border: "none", cursor: "pointer",
              background: selectedYear === y
                ? (dark ? "rgba(0,212,255,0.18)" : "rgba(3,105,161,0.12)")
                : (dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"),
              color: selectedYear === y ? (dark ? E.cyan : "#0369a1") : mutedText,
              outline: selectedYear === y ? `1px solid ${dark ? "rgba(0,212,255,0.35)" : "rgba(3,105,161,0.25)"}` : "none",
            }}>
            {y}{y === "2026" ? " *" : ""}
          </button>
        ))}
        {selectedYear === "2026" && (
          <span style={{ fontSize: "10px", color: mutedText }}>* Datos parciales (ene–mar 2026)</span>
        )}
      </div>

      {/* ── KPI ROW ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <div style={{ ...cardStyle, borderLeft: `3px solid #ef4444` }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#ef4444", marginBottom: "6px" }}>Grupos Activos</div>
          <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>{groups.length}</div>
          <div style={{ fontSize: "11px", color: mutedText, marginTop: "4px" }}>organizaciones monitoreadas</div>
        </div>
        <div style={{ ...cardStyle, borderLeft: `3px solid ${E.amber}` }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: E.amber, marginBottom: "6px" }}>Acciones {selectedYear}</div>
          <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>{totalIncidentsYear.toLocaleString("es-CO")}</div>
          <div style={{ fontSize: "11px", color: mutedText, marginTop: "4px" }}>acciones bélicas registradas</div>
        </div>
        <div style={{ ...cardStyle, borderLeft: `3px solid #a855f7` }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#a855f7", marginBottom: "6px" }}>Depts. Afectados</div>
          <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>{deptData.length}</div>
          <div style={{ fontSize: "11px", color: mutedText, marginTop: "4px" }}>con presencia confirmada</div>
        </div>
        <div style={{ ...cardStyle, borderLeft: `3px solid #ef4444` }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#ef4444", marginBottom: "6px" }}>Riesgo Crítico</div>
          <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>{deptData.filter(d => d.maxRisk === "critical").length}</div>
          <div style={{ fontSize: "11px", color: mutedText, marginTop: "4px" }}>departamentos nivel crítico</div>
        </div>
      </div>

      {/* ── VIEW TABS ── */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
        {([
          { id: "overview", label: "Resumen de Grupos" },
          { id: "mapa", label: "Presencia por Departamento" },
          { id: "tendencia", label: "Tendencia de Incidentes" },
        ] as const).map(v => (
          <button key={v.id} onClick={() => setActiveView(v.id)}
            style={activeView === v.id ? subBtnActive : subBtnInactive}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW VIEW ── */}
      {activeView === "overview" && (
        <div style={{ display: "grid", gap: "12px" }}>
          {groups.map(group => (
            <div key={group.id} style={{ ...cardStyle, borderLeft: `4px solid ${group.color}` }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-start" }}>
                {/* Header */}
                <div style={{ flex: "1 1 300px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "15px", fontWeight: 800, color: group.color }}>{group.shortName}</span>
                    <Badge label={RISK_LABEL[group.logisticsRisk] ?? group.logisticsRisk} color={RISK_COLOR[group.logisticsRisk] ?? "#64748b"} dark={dark} />
                  </div>
                  <p style={{ fontSize: "12px", color: mutedText, margin: "0 0 8px 0", lineHeight: 1.6 }}>{group.description}</p>
                  <div style={{ fontSize: "11px", padding: "8px 10px", borderRadius: "6px", background: dark ? "rgba(239,68,68,0.07)" : "rgba(239,68,68,0.05)", border: `1px solid rgba(239,68,68,0.15)`, color: dark ? "rgba(239,68,68,0.9)" : "#dc2626", lineHeight: 1.5 }}>
                    <strong>⚠️ Riesgo logístico:</strong> {group.riskNote}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ flex: "0 0 auto", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  {/* Incidents */}
                  <div style={{ textAlign: "center", minWidth: "80px" }}>
                    <div style={{ fontSize: "10px", color: mutedText, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Acciones {selectedYear}</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: group.color }}>{(group.annualIncidents[selectedYear] ?? 0).toLocaleString("es-CO")}</div>
                    {group.annualIncidents[selectedYear] && group.annualIncidents[prevYear] ? (() => {
                      const curr = group.annualIncidents[selectedYear];
                      const prev = group.annualIncidents[prevYear];
                      const isUp = curr > prev;
                      const pct = Math.abs(((curr - prev) / prev) * 100).toFixed(1);
                      return <div style={{ fontSize: "10px", fontWeight: 600, color: isUp ? "#ef4444" : "#22c55e" }}>{isUp ? "▲" : "▼"} {pct}% vs {prevYear}</div>;
                    })() : <div style={{ fontSize: "10px", color: mutedText }}>—</div>}
                  </div>
                  {/* Presence count */}
                  <div style={{ textAlign: "center", minWidth: "80px" }}>
                    <div style={{ fontSize: "10px", color: mutedText, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Depts. Presencia</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: group.color }}>{group.presence.length}</div>
                    <div style={{ fontSize: "10px", color: mutedText }}>{group.presence.filter(p => p.level === "alta").length} presencia alta</div>
                  </div>
                </div>
              </div>

              {/* Activities */}
              <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {group.activities.map(a => (
                  <span key={a} style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "4px", background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: borderColor, color: mutedText }}>
                    {a}
                  </span>
                ))}
              </div>

              {/* Presence dots */}
              <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {(["alta", "media", "baja"] as const).map(level => {
                  const depts = group.presence.filter(p => p.level === level);
                  if (depts.length === 0) return null;
                  return (
                    <div key={level} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: LEVEL_COLOR[level], minWidth: "36px" }}>{LEVEL_LABEL[level]}:</span>
                      {depts.map(d => (
                        <span key={d.department} style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "3px", background: `${LEVEL_COLOR[level]}18`, border: `1px solid ${LEVEL_COLOR[level]}33`, color: LEVEL_COLOR[level] }}>{d.department}</span>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── DEPT PRESENCE VIEW ── */}
      {activeView === "mapa" && (
        <div>
          {/* Group filter */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
            <button onClick={() => setSelectedGroup("all")} style={selectedGroup === "all" ? subBtnActive : subBtnInactive}>
              Todos los grupos
            </button>
            {groups.map(g => (
              <button key={g.id} onClick={() => setSelectedGroup(g.id)}
                style={selectedGroup === g.id
                  ? { ...subBtnActive, background: `${g.color}22`, color: g.color }
                  : subBtnInactive}>
                {g.shortName}
              </button>
            ))}
          </div>

          <div style={{ borderRadius: "10px", overflow: "hidden", border: `1px solid ${borderColor}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: dark ? "rgba(255,255,255,0.04)" : "#f8fafc", borderBottom: `1px solid ${borderColor}` }}>
                  {["Departamento", "Nivel de Riesgo", "Grupos con Presencia"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: mutedText, whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDeptData.map((dept, ri) => (
                  <tr key={dept.department}
                    style={{ borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`, background: ri % 2 === 0 ? "transparent" : (dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)") }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{dept.department}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <Badge
                        label={RISK_LABEL[dept.maxRisk] ?? dept.maxRisk}
                        color={RISK_COLOR[dept.maxRisk] ?? "#64748b"}
                        dark={dark}
                      />
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                        {dept.groups
                          .filter(g => selectedGroup === "all" || g.groupId === selectedGroup)
                          .map(g => (
                            <span key={g.groupId} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", background: `${g.color}18`, border: `1px solid ${g.color}44`, color: g.color, display: "flex", alignItems: "center", gap: "4px" }}>
                              {g.shortName}
                              <span style={{ fontSize: "9px", color: LEVEL_COLOR[g.level] }}>●{LEVEL_LABEL[g.level]}</span>
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredDeptData.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: "32px", textAlign: "center", color: mutedText }}>Sin presencia registrada para el filtro seleccionado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TENDENCIA VIEW ── */}
      {activeView === "tendencia" && (
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={cardStyle}>
            <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Acciones Bélicas por Grupo — Evolución Anual</div>
            <div style={{ fontSize: "11px", color: mutedText, marginBottom: "16px" }}>
              2026 = proyección parcial (ene–mar). Fuente: {meta?.dataSource}
            </div>
            <ResponsiveContainer width="100%" height={300} debounce={0}>
              <LineChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke={gridColor} vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <Tooltip content={<ExecTooltip dark={dark} />} isAnimationActive={false} />
                <Legend content={<ExecLegend dark={dark} />} />
                {groups.map(g => (
                  <Line key={g.id} type="monotone" dataKey={g.shortName} stroke={g.color}
                    strokeWidth={2.5} dot={{ r: 4, fill: g.color, stroke: dark ? "#070c15" : "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 5 }} isAnimationActive={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bar: selected year comparison */}
          <div style={cardStyle}>
            <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>Comparativo de Acciones {selectedYear} — Por Grupo</div>
            <div style={{ fontSize: "11px", color: mutedText, marginBottom: "16px" }}>Incluye todas las modalidades: piratería, extorsión, bloqueos, atentados</div>
            <ResponsiveContainer width="100%" height={220} debounce={0}>
              <BarChart data={groups.map(g => ({ name: g.shortName, Acciones: g.annualIncidents[selectedYear] ?? 0, color: g.color }))} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="4 4" stroke={gridColor} horizontal={false} />
                <XAxis type="number" tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<ExecTooltip dark={dark} />} isAnimationActive={false} />
                <Bar dataKey="Acciones" isAnimationActive={false} radius={[0, 4, 4, 0]}>
                  {groups.map(g => <Cell key={g.id} fill={g.color} fillOpacity={dark ? 0.85 : 0.75} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
