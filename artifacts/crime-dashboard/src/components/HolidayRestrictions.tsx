import { useMemo, useState } from "react";

/* ───────── PALETTE ───────── */
const E = {
  cyan:    "#00d4ff",
  amber:   "#f59e0b",
  green:   "#10b981",
  red:     "#ef4444",
  purple:  "#a855f7",
  orange:  "#fb923c",
  bg:      "#070c15",
  panel:   "#0c1220",
  border:  "rgba(255,255,255,0.07)",
  textDim: "rgba(255,255,255,0.45)",
};

/* ───────── TYPES ───────── */
interface Puente {
  id: string;
  nombre: string;
  festivo: Date;
  restriccionInicio: Date;
  restriccionFin: Date;
  dias: number;
  tipo: "lunes" | "viernes" | "semana_santa" | "martes_jueves";
  nota?: string;
}

/* ───────── DATA: PUENTES 2026 ───────── */
const PUENTES_2026: Puente[] = [
  /* ── Ya pasados en 2026 (anteriores a hoy) ── */
  {
    id: "reyes-2026",
    nombre: "Reyes Magos",
    festivo: new Date("2026-01-12T00:00:00"),
    restriccionInicio: new Date("2026-01-09T18:00:00"),
    restriccionFin: new Date("2026-01-13T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "san-jose-2026",
    nombre: "San José",
    festivo: new Date("2026-03-23T00:00:00"),
    restriccionInicio: new Date("2026-03-20T18:00:00"),
    restriccionFin: new Date("2026-03-24T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "semana-santa-2026",
    nombre: "Semana Santa",
    festivo: new Date("2026-04-03T00:00:00"),
    restriccionInicio: new Date("2026-04-01T18:00:00"),
    restriccionFin: new Date("2026-04-06T05:00:00"),
    dias: 5,
    tipo: "semana_santa",
    nota: "Restricción ampliada miércoles–lunes",
  },
  /* ── Próximos ── */
  {
    id: "trabajo-2026",
    nombre: "Día del Trabajo",
    festivo: new Date("2026-05-01T00:00:00"),
    restriccionInicio: new Date("2026-04-30T18:00:00"),
    restriccionFin: new Date("2026-05-04T05:00:00"),
    dias: 3,
    tipo: "viernes",
  },
  {
    id: "ascension-2026",
    nombre: "Ascensión del Señor",
    festivo: new Date("2026-05-18T00:00:00"),
    restriccionInicio: new Date("2026-05-15T18:00:00"),
    restriccionFin: new Date("2026-05-19T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "corpus-2026",
    nombre: "Corpus Christi",
    festivo: new Date("2026-06-08T00:00:00"),
    restriccionInicio: new Date("2026-06-05T18:00:00"),
    restriccionFin: new Date("2026-06-09T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "sagrado-2026",
    nombre: "Sagrado Corazón",
    festivo: new Date("2026-06-15T00:00:00"),
    restriccionInicio: new Date("2026-06-12T18:00:00"),
    restriccionFin: new Date("2026-06-16T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "san-pedro-2026",
    nombre: "San Pedro y San Pablo",
    festivo: new Date("2026-06-29T00:00:00"),
    restriccionInicio: new Date("2026-06-26T18:00:00"),
    restriccionFin: new Date("2026-06-30T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "independencia-2026",
    nombre: "Independencia de Colombia",
    festivo: new Date("2026-07-20T00:00:00"),
    restriccionInicio: new Date("2026-07-17T18:00:00"),
    restriccionFin: new Date("2026-07-21T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "boyaca-2026",
    nombre: "Batalla de Boyacá",
    festivo: new Date("2026-08-07T00:00:00"),
    restriccionInicio: new Date("2026-08-06T18:00:00"),
    restriccionFin: new Date("2026-08-10T05:00:00"),
    dias: 3,
    tipo: "viernes",
  },
  {
    id: "asuncion-2026",
    nombre: "Asunción de la Virgen",
    festivo: new Date("2026-08-17T00:00:00"),
    restriccionInicio: new Date("2026-08-14T18:00:00"),
    restriccionFin: new Date("2026-08-18T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "raza-2026",
    nombre: "Día de la Raza",
    festivo: new Date("2026-10-12T00:00:00"),
    restriccionInicio: new Date("2026-10-09T18:00:00"),
    restriccionFin: new Date("2026-10-13T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "santos-2026",
    nombre: "Todos los Santos",
    festivo: new Date("2026-11-02T00:00:00"),
    restriccionInicio: new Date("2026-10-30T18:00:00"),
    restriccionFin: new Date("2026-11-03T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "cartagena-2026",
    nombre: "Independencia de Cartagena",
    festivo: new Date("2026-11-16T00:00:00"),
    restriccionInicio: new Date("2026-11-13T18:00:00"),
    restriccionFin: new Date("2026-11-17T05:00:00"),
    dias: 3,
    tipo: "lunes",
  },
  {
    id: "inmaculada-2026",
    nombre: "Inmaculada Concepción",
    festivo: new Date("2026-12-08T00:00:00"),
    restriccionInicio: new Date("2026-12-07T18:00:00"),
    restriccionFin: new Date("2026-12-09T05:00:00"),
    dias: 1,
    tipo: "martes_jueves",
    nota: "Festivo en martes — restricción lunes–miércoles",
  },
  {
    id: "navidad-2026",
    nombre: "Navidad",
    festivo: new Date("2026-12-25T00:00:00"),
    restriccionInicio: new Date("2026-12-24T18:00:00"),
    restriccionFin: new Date("2026-12-28T05:00:00"),
    dias: 3,
    tipo: "viernes",
  },
];

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function formatDate(d: Date) {
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}
function formatDateTime(d: Date) {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${h}:${m}`;
}

function getStatus(puente: Puente, now: Date) {
  if (now >= puente.restriccionInicio && now <= puente.restriccionFin) return "activa";
  if (now < puente.restriccionInicio) return "proxima";
  return "pasada";
}

function msToCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h.toString().padStart(2,"0")}h ${m.toString().padStart(2,"0")}m ${s.toString().padStart(2,"0")}s`;
}

/* ───────── VEHICLE CATEGORIES ───────── */
const VEHICULOS_RESTRINGIDOS = [
  { cat: "Cat. III", desc: "Camión simple 3 ejes (2S1, 3S0)", ejemplo: "Camión rígido con remolque" },
  { cat: "Cat. IV",  desc: "Tractocamión 4 ejes (2S2)", ejemplo: "Tractomula con semirremolque eje simple" },
  { cat: "Cat. V",   desc: "Tractocamión 5 ejes (3S2)", ejemplo: "Tractomula estándar" },
  { cat: "Cat. VI",  desc: "Tractocamión 6 ejes (3S3)", ejemplo: "Doble remolque / B-train" },
];

const VEHICULOS_EXENTOS = [
  "Vehículos que transporten alimentos perecederos",
  "Tanques de combustible (vacíos o llenos)",
  "Transporte de medicamentos y material hospitalario",
  "Vehículos de emergencia y socorro",
  "Transporte de animales vivos",
  "Servicio público urbano de pasajeros",
  "Vehículos del Estado (Fuerzas Militares, Policía, etc.)",
  "Transporte de correo oficial",
];

const CORREDORES = [
  { ruta: "Ruta 45 — Bogotá–Medellín", tramos: "Villeta, La Pintada, Bolombolo" },
  { ruta: "Ruta 40 — Bogotá–Buenaventura", tramos: "Buga, Tuluá, Palmira" },
  { ruta: "Ruta 25 — Cali–Pasto", tramos: "Popayán, Chachagüí" },
  { ruta: "Ruta 55 — Bogotá–Cúcuta", tramos: "Tunja, Bucaramanga, Pamplona" },
  { ruta: "Ruta 60 — Bogotá–Villavicencio", tramos: "Alto del Cable, Puerto López" },
  { ruta: "Ruta 45A — Bogotá–Cartagena", tramos: "Honda, Barrancabermeja, Magangué" },
  { ruta: "Ruta 90 — Bogotá–Costa Atlántica", tramos: "Barranquilla–Cartagena" },
];

/* ────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ──────────────────────────────────────────────────────────────── */
interface Props { dark?: boolean }

export function HolidayRestrictions({ dark = true }: Props) {
  const now = new Date();
  const [showPrint, setShowPrint] = useState(false);
  const [selectedPuente, setSelectedPuente] = useState<string | null>(null);

  const panel = dark ? E.panel : "#ffffff";
  const bg    = dark ? E.bg    : "#f1f5f9";
  const text  = dark ? "rgba(255,255,255,0.87)" : "#1e293b";
  const muted = dark ? E.textDim : "#6b7280";
  const border= dark ? E.border : "rgba(0,0,0,0.08)";

  /* classify puentes */
  const { activo, proximos, pasados } = useMemo(() => {
    const activo   = PUENTES_2026.find(p => getStatus(p, now) === "activa") ?? null;
    const proximos = PUENTES_2026.filter(p => getStatus(p, now) === "proxima");
    const pasados  = PUENTES_2026.filter(p => getStatus(p, now) === "pasada");
    return { activo, proximos, pasados };
  }, []);

  const siguiente = proximos[0] ?? null;
  const msHasta = siguiente ? siguiente.restriccionInicio.getTime() - now.getTime() : 0;

  /* ── STATUS BADGE ── */
  function StatusBadge() {
    if (activo) return (
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)",
        borderRadius: 12, padding: "20px 28px",
      }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: E.red,
          boxShadow: `0 0 16px ${E.red}`, animation: "pulse 1.5s infinite" }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: E.red, letterSpacing: "-0.02em" }}>
            🚫 RESTRICCIÓN ACTIVA — {activo.nombre.toUpperCase()}
          </div>
          <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
            Finaliza el {formatDateTime(activo.restriccionFin)} · Vehículos Cat. III–VI RESTRINGIDOS
          </div>
        </div>
      </div>
    );

    if (siguiente) return (
      <div style={{
        display: "flex", alignItems: "center", gap: 20,
        background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)",
        borderRadius: 12, padding: "20px 28px", flexWrap: "wrap",
      }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: E.green }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: E.green }}>
            ✅ Sin restricción activa
          </div>
          <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
            Próxima: <strong style={{ color: text }}>{siguiente.nombre}</strong> — inicia el {formatDateTime(siguiente.restriccionInicio)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Tiempo restante</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: E.amber, fontVariantNumeric: "tabular-nums" }}>
            {msToCountdown(msHasta)}
          </div>
        </div>
      </div>
    );

    return (
      <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${border}`, borderRadius: 12, padding: "20px 28px", color: muted }}>
        No hay más puentes programados para 2026.
      </div>
    );
  }

  /* ── PUENTE ROW ── */
  function PuenteRow({ p }: { p: Puente }) {
    const status = getStatus(p, now);
    const isSelected = selectedPuente === p.id;
    const statusColor = status === "activa" ? E.red : status === "proxima" ? E.amber : muted;
    const statusLabel = status === "activa" ? "ACTIVA" : status === "proxima" ? "PRÓXIMA" : "FINALIZADA";

    return (
      <div
        onClick={() => setSelectedPuente(isSelected ? null : p.id)}
        style={{
          background: isSelected
            ? (dark ? "rgba(0,212,255,0.06)" : "#f0f9ff")
            : (dark ? "rgba(255,255,255,0.02)" : "#f8fafc"),
          border: `1px solid ${isSelected ? "rgba(0,212,255,0.25)" : border}`,
          borderRadius: 10,
          padding: "14px 18px",
          cursor: "pointer",
          transition: "all 0.15s",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {/* status dot */}
          <div style={{
            width: 10, height: 10, borderRadius: "50%", background: statusColor, flexShrink: 0,
            boxShadow: status === "activa" ? `0 0 10px ${E.red}` : "none",
          }} />

          {/* nombre */}
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{p.nombre}</div>
            <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
              Festivo: {formatDate(p.festivo)}
            </div>
          </div>

          {/* fechas restricción */}
          <div style={{ textAlign: "center", minWidth: 200 }}>
            <div style={{ fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Restricción</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: text, marginTop: 2 }}>
              {formatDateTime(p.restriccionInicio)}
            </div>
            <div style={{ fontSize: 11, color: muted }}>al {formatDateTime(p.restriccionFin)}</div>
          </div>

          {/* dias */}
          <div style={{ textAlign: "center", minWidth: 70 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: E.cyan }}>{p.dias}</div>
            <div style={{ fontSize: 10, color: muted }}>días</div>
          </div>

          {/* badge */}
          <div style={{
            padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 800,
            letterSpacing: "0.1em", textTransform: "uppercase",
            background: status === "activa" ? "rgba(239,68,68,0.15)"
              : status === "proxima" ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)",
            color: statusColor,
          }}>
            {statusLabel}
          </div>
        </div>

        {/* expanded detail */}
        {isSelected && (
          <div style={{
            marginTop: 16, paddingTop: 16,
            borderTop: `1px solid ${border}`,
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 11, color: muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Vehículos restringidos
              </div>
              {VEHICULOS_RESTRINGIDOS.map(v => (
                <div key={v.cat} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                  <div style={{ background: "rgba(239,68,68,0.2)", color: E.red, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, flexShrink: 0 }}>
                    {v.cat}
                  </div>
                  <div style={{ fontSize: 12, color: muted }}>{v.desc}</div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Información adicional
              </div>
              {p.nota && (
                <div style={{ fontSize: 12, color: E.amber, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, padding: "8px 12px", marginBottom: 10 }}>
                  ⚠️ {p.nota}
                </div>
              )}
              <div style={{ fontSize: 12, color: muted }}>
                <div style={{ marginBottom: 4 }}>📅 Festivo: <strong style={{ color: text }}>{formatDate(p.festivo)}</strong></div>
                <div style={{ marginBottom: 4 }}>🚫 Inicio: <strong style={{ color: text }}>{formatDateTime(p.restriccionInicio)}</strong></div>
                <div>✅ Fin: <strong style={{ color: text }}>{formatDateTime(p.restriccionFin)}</strong></div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── PRINT VIEW ── */
  if (showPrint) {
    return (
      <div style={{ background: "#fff", color: "#111", padding: "40px 48px", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, borderBottom: "3px solid #0f172a", paddingBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.02em" }}>
              RESTRICCIONES DE TRÁNSITO — PUENTES FESTIVOS 2026
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
              Colombia · Vehículos de carga 3 o más ejes · Red Vial Nacional Primaria
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              Generado por SafeNode S.A.S · Área de Seguridad · {now.toLocaleDateString("es-CO")}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Fuente normativa</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>MinTransporte / INVIAS</div>
          </div>
        </div>

        {/* Alert banner */}
        {activo && (
          <div style={{ background: "#fef2f2", border: "2px solid #ef4444", borderRadius: 8, padding: "12px 20px", marginBottom: 24 }}>
            <div style={{ fontWeight: 800, color: "#dc2626", fontSize: 14 }}>
              🚫 RESTRICCIÓN ACTIVA: {activo.nombre} — finaliza {formatDateTime(activo.restriccionFin)}
            </div>
          </div>
        )}

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 32 }}>
          <thead>
            <tr style={{ background: "#0f172a", color: "#fff" }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>FESTIVO</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>FECHA FESTIVO</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>INICIO RESTRICCIÓN</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>FIN RESTRICCIÓN</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700 }}>DÍAS</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700 }}>ESTADO</th>
            </tr>
          </thead>
          <tbody>
            {PUENTES_2026.map((p, i) => {
              const status = getStatus(p, now);
              return (
                <tr key={p.id} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff", borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700, color: "#0f172a" }}>{p.nombre}</td>
                  <td style={{ padding: "9px 14px", color: "#334155" }}>{formatDate(p.festivo)}</td>
                  <td style={{ padding: "9px 14px", color: "#dc2626", fontWeight: 600 }}>{formatDateTime(p.restriccionInicio)}</td>
                  <td style={{ padding: "9px 14px", color: "#16a34a", fontWeight: 600 }}>{formatDateTime(p.restriccionFin)}</td>
                  <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: 700 }}>{p.dias}</td>
                  <td style={{ padding: "9px 14px", textAlign: "center" }}>
                    <span style={{
                      padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 800,
                      background: status === "activa" ? "#fef2f2" : status === "proxima" ? "#fefce8" : "#f0fdf4",
                      color: status === "activa" ? "#dc2626" : status === "proxima" ? "#b45309" : "#15803d",
                    }}>
                      {status === "activa" ? "ACTIVA" : status === "proxima" ? "PRÓXIMA" : "FINALIZADA"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Rules section */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 12, borderBottom: "2px solid #0f172a", paddingBottom: 6 }}>
              VEHÍCULOS RESTRINGIDOS
            </div>
            {VEHICULOS_RESTRINGIDOS.map(v => (
              <div key={v.cat} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <span style={{ background: "#fef2f2", color: "#dc2626", fontWeight: 700, fontSize: 10, padding: "2px 8px", borderRadius: 4, flexShrink: 0 }}>{v.cat}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#0f172a" }}>{v.desc}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>{v.ejemplo}</div>
                </div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 12, borderBottom: "2px solid #0f172a", paddingBottom: 6 }}>
              EXENCIONES (NO APLICA RESTRICCIÓN)
            </div>
            {VEHICULOS_EXENTOS.map(ex => (
              <div key={ex} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 11, color: "#334155" }}>
                <span style={{ color: "#16a34a", flexShrink: 0 }}>✓</span> {ex}
              </div>
            ))}
          </div>
        </div>

        {/* Corridors */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10, borderBottom: "2px solid #0f172a", paddingBottom: 6 }}>
            CORREDORES VIALES AFECTADOS (RED PRIMARIA NACIONAL)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {CORREDORES.map(c => (
              <div key={c.ruta} style={{ fontSize: 11, color: "#334155" }}>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{c.ruta}:</span> {c.tramos}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8" }}>
          <div>SafeNode S.A.S · Área de Inteligencia en Seguridad del Transporte</div>
          <div>Documento informativo — No reemplaza la resolución oficial de MinTransporte</div>
        </div>
      </div>
    );
  }

  /* ── MAIN DASHBOARD VIEW ── */
  return (
    <div style={{ color: text }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: text, margin: 0, letterSpacing: "-0.02em" }}>
            🚧 Restricciones — Puentes Festivos 2026
          </h2>
          <p style={{ fontSize: 13, color: muted, margin: "6px 0 0" }}>
            Red Vial Primaria Nacional · Vehículos de carga 3 o más ejes · Fuente: MinTransporte / INVIAS
          </p>
        </div>
        <button
          onClick={() => setShowPrint(true)}
          style={{
            padding: "9px 20px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: E.cyan, color: "#060a10", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          🖨️ Generar informe cliente
        </button>
      </div>

      {/* Status hero */}
      <div style={{ marginBottom: 24 }}>
        <StatusBadge />
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total puentes 2026", value: PUENTES_2026.length, color: E.cyan, icon: "📅" },
          { label: "Próximos", value: proximos.length, color: E.amber, icon: "⏳" },
          { label: "Finalizados", value: pasados.length, color: E.green, icon: "✅" },
          { label: "Activo ahora", value: activo ? 1 : 0, color: activo ? E.red : muted, icon: "🚫" },
        ].map(k => (
          <div key={k.label} style={{
            background: panel, border: `1px solid ${border}`, borderRadius: 10,
            padding: "16px 18px", textAlign: "center",
          }}>
            <div style={{ fontSize: 22 }}>{k.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color, lineHeight: 1.1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Active / Upcoming */}
      {activo && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: E.red, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            ● Restricción activa
          </div>
          <PuenteRow p={activo} />
        </div>
      )}

      {proximos.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: E.amber, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Próximas restricciones
          </div>
          {proximos.map(p => <PuenteRow key={p.id} p={p} />)}
        </div>
      )}

      {pasados.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Restricciones finalizadas 2026
          </div>
          {pasados.map(p => <PuenteRow key={p.id} p={p} />)}
        </div>
      )}

      {/* Rules panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Restricted vehicles */}
        <div style={{ background: panel, border: `1px solid ${border}`, borderRadius: 12, padding: "20px 22px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: E.red, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            🚫 Vehículos restringidos
          </div>
          {VEHICULOS_RESTRINGIDOS.map(v => (
            <div key={v.cat} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
              <span style={{ background: "rgba(239,68,68,0.15)", color: E.red, fontWeight: 700, fontSize: 10, padding: "3px 8px", borderRadius: 4, flexShrink: 0, lineHeight: "16px" }}>
                {v.cat}
              </span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: text }}>{v.desc}</div>
                <div style={{ fontSize: 11, color: muted }}>{v.ejemplo}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Exemptions */}
        <div style={{ background: panel, border: `1px solid ${border}`, borderRadius: 12, padding: "20px 22px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: E.green, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            ✅ Exenciones (no aplica restricción)
          </div>
          {VEHICULOS_EXENTOS.map(ex => (
            <div key={ex} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 12, color: muted, alignItems: "flex-start" }}>
              <span style={{ color: E.green, flexShrink: 0, marginTop: 1 }}>✓</span>
              <span>{ex}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Corridors */}
      <div style={{ background: panel, border: `1px solid ${border}`, borderRadius: 12, padding: "20px 22px", marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: E.cyan, marginBottom: 14 }}>
          🛣️ Corredores viales afectados — Red Primaria Nacional
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {CORREDORES.map(c => (
            <div key={c.ruta} style={{ background: dark ? "rgba(255,255,255,0.03)" : "#f8fafc", border: `1px solid ${border}`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: text }}>{c.ruta}</div>
              <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>{c.tramos}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Legal note */}
      <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "14px 18px", fontSize: 12, color: muted }}>
        <strong style={{ color: E.amber }}>⚠️ Nota legal:</strong> Las fechas y horarios son basados en el patrón histórico de resoluciones de MinTransporte. Las horas exactas pueden variar según la resolución oficial publicada para cada festivo. Siempre verifique con la resolución vigente del Ministerio de Transporte de Colombia antes de programar despachos.
      </div>
    </div>
  );
}
