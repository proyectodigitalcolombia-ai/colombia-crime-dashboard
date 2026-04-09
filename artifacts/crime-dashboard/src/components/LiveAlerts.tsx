import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTelegramAlerts,
  useGetTelegramAlertsAll,
  useGetTelegramStatus,
  useResolveTelegramAlert,
  useTriggerTelegramScan,
  GET_TELEGRAM_ALERTS_KEY,
  GET_TELEGRAM_ALERTS_ALL_KEY,
  type TelegramAlert,
} from "@workspace/api-client-react";
import {
  AlertTriangle, Car, Truck, Users, CheckCircle2,
  RefreshCw, Radio, Clock, MapPin, Zap, Eye,
} from "lucide-react";

/* ── Palette ─────────────────────────────────────────────────────────────── */
const E = {
  cyan:    "#00d4ff",
  amber:   "#f59e0b",
  red:     "#ef4444",
  emerald: "#10b981",
  purple:  "#a855f7",
  orange:  "#f97316",
  bg:      "#070c15",
  panel:   "#0c1220",
  border:  "rgba(255,255,255,0.07)",
  dim:     "rgba(255,255,255,0.45)",
};

/* ── Event type config ───────────────────────────────────────────────────── */
const EVENT_CFG: Record<string, { label: string; color: string; icon: React.ReactNode; expiry: string }> = {
  accidente:     { label: "Accidente",      color: E.red,     icon: <AlertTriangle size={14} />, expiry: "6h" },
  cierre:        { label: "Cierre Vial",    color: E.amber,   icon: <Truck size={14} />,         expiry: "24h" },
  trancon:       { label: "Trancón",        color: E.orange,  icon: <Car size={14} />,            expiry: "3h" },
  manifestacion: { label: "Manifestación",  color: E.purple,  icon: <Users size={14} />,          expiry: "12h" },
  otro:          { label: "Otro",           color: E.dim,     icon: <Radio size={14} />,          expiry: "8h" },
};

function getEventCfg(type: string) {
  return EVENT_CFG[type] ?? EVENT_CFG.otro;
}

/* ── Severity badge ──────────────────────────────────────────────────────── */
function SeverityBadge({ severity }: { severity: string }) {
  const cfg = {
    alto:  { color: E.red,     label: "ALTO" },
    medio: { color: E.amber,   label: "MEDIO" },
    bajo:  { color: E.emerald, label: "BAJO" },
  }[severity] ?? { color: E.dim, label: severity.toUpperCase() };
  return (
    <span style={{
      fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
      padding: "2px 6px", borderRadius: "4px",
      background: `${cfg.color}22`, color: cfg.color, border: `1px solid ${cfg.color}44`,
    }}>
      {cfg.label}
    </span>
  );
}

/* ── Time ago ────────────────────────────────────────────────────────────── */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Ahora";
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  return `Hace ${Math.floor(h / 24)}d`;
}

/* ── Time until expiry ───────────────────────────────────────────────────── */
function timeUntilExpiry(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Expirado";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `Expira en ${m}min`;
  return `Expira en ${Math.floor(m / 60)}h`;
}

/* ── Alert card ──────────────────────────────────────────────────────────── */
function AlertCard({
  alert,
  onResolve,
  resolving,
}: {
  alert: TelegramAlert;
  onResolve: (id: number) => void;
  resolving: boolean;
}) {
  const cfg = getEventCfg(alert.eventType);
  const isResolved = alert.status !== "activo";

  return (
    <div style={{
      background: E.panel,
      border: `1px solid ${isResolved ? "rgba(255,255,255,0.05)" : cfg.color + "33"}`,
      borderRadius: "10px",
      padding: "14px 16px",
      opacity: isResolved ? 0.55 : 1,
      transition: "all 0.2s",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Type badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: "5px",
            background: `${cfg.color}22`, border: `1px solid ${cfg.color}44`,
            borderRadius: "6px", padding: "3px 8px",
            color: cfg.color, fontSize: "11px", fontWeight: 700,
          }}>
            {cfg.icon}
            {cfg.label}
          </div>
          <SeverityBadge severity={alert.severity} />
          {isResolved && (
            <span style={{
              fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
              background: `${E.emerald}22`, color: E.emerald, border: `1px solid ${E.emerald}44`,
            }}>
              {alert.status === "resuelto" ? "RESUELTO" : "EXPIRADO"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <span style={{ fontSize: "11px", color: E.dim, whiteSpace: "nowrap" }}>
            {timeAgo(alert.messageDate)}
          </span>
          {!isResolved && (
            <button
              onClick={() => onResolve(alert.id)}
              disabled={resolving}
              title="Marcar como resuelto"
              style={{
                display: "flex", alignItems: "center", gap: "4px",
                padding: "4px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                background: `${E.emerald}18`, border: `1px solid ${E.emerald}44`,
                color: E.emerald, cursor: "pointer", opacity: resolving ? 0.5 : 1,
              }}
            >
              <CheckCircle2 size={12} />
              Resolver
            </button>
          )}
        </div>
      </div>

      {/* Message text */}
      <p style={{
        fontSize: "13px", color: "rgba(255,255,255,0.85)", lineHeight: 1.5,
        margin: "0 0 10px 0", fontStyle: "italic",
      }}>
        "{alert.rawText}"
      </p>

      {/* Metadata row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        {alert.locationText && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: E.cyan }}>
            <MapPin size={11} />
            {alert.locationText}
          </div>
        )}
        {alert.department && (
          <div style={{ fontSize: "11px", color: E.dim }}>
            📍 {alert.department}
          </div>
        )}
        {alert.via && (
          <div style={{ fontSize: "11px", color: E.dim }}>
            🛣️ {alert.via}
            {alert.km && ` km ${alert.km}`}
          </div>
        )}
        {!isResolved && alert.autoExpireAt && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: E.dim, marginLeft: "auto" }}>
            <Clock size={10} />
            {timeUntilExpiry(alert.autoExpireAt)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Filter types ────────────────────────────────────────────────────────── */
const FILTER_OPTIONS = [
  { id: "all",          label: "Todas" },
  { id: "accidente",    label: "Accidentes" },
  { id: "cierre",       label: "Cierres" },
  { id: "trancon",      label: "Trancones" },
  { id: "manifestacion",label: "Manifestaciones" },
];

/* ══════════════════════════════════════════════════════════════════════════ */
interface LiveAlertsProps { isDark?: boolean }

export function LiveAlerts({ isDark = true }: LiveAlertsProps) {
  const qc = useQueryClient();
  const [filter, setFilter]       = useState<string>("all");
  const [showAll, setShowAll]     = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const { data: activeAlerts = [], isLoading: loadingActive } = useGetTelegramAlerts();
  const { data: allAlerts   = [], isLoading: loadingAll    } = useGetTelegramAlertsAll(80, {
    query: { enabled: showAll },
  });
  const { data: status } = useGetTelegramStatus();
  const { mutate: resolve } = useResolveTelegramAlert({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [GET_TELEGRAM_ALERTS_KEY] });
        qc.invalidateQueries({ queryKey: [GET_TELEGRAM_ALERTS_ALL_KEY] });
        setResolvingId(null);
      },
    },
  });
  const { mutate: triggerScan, isPending: scanning } = useTriggerTelegramScan({
    mutation: {
      onSuccess: () => {
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: [GET_TELEGRAM_ALERTS_KEY] });
          qc.invalidateQueries({ queryKey: [GET_TELEGRAM_ALERTS_ALL_KEY] });
        }, 3000);
      },
    },
  });

  const displayAlerts = showAll ? allAlerts : activeAlerts;
  const filtered = filter === "all"
    ? displayAlerts
    : displayAlerts.filter(a => a.eventType === filter);

  const counts = activeAlerts.reduce((acc, a) => {
    acc[a.eventType] = (acc[a.eventType] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const panelBg  = isDark ? E.panel : "#ffffff";
  const textMain = isDark ? "#e2e8f0" : "#0f172a";
  const dimText  = isDark ? E.dim    : "#6b7280";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", color: E.red,
              textTransform: "uppercase", display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: E.red,
                boxShadow: `0 0 8px ${E.red}`, display: "inline-block",
                animation: activeAlerts.length > 0 ? "pulse 2s infinite" : "none" }} />
              EN VIVO · @notiabel
            </span>
          </div>
          <h2 style={{ fontSize: "20px", fontWeight: 800, color: textMain, margin: 0 }}>
            Alertas de Tránsito en Tiempo Real
          </h2>
          <p style={{ fontSize: "12px", color: dimText, marginTop: "4px" }}>
            Canal de información vial de Colombia — actualización automática cada 10 minutos
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {status && (
            <div style={{ fontSize: "11px", color: dimText, textAlign: "right" }}>
              <div>Última sync: {status.lastRun ? new Date(status.lastRun).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
              <div>Próxima: {status.nextRun ? new Date(status.nextRun).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
            </div>
          )}
          <button
            onClick={() => triggerScan()}
            disabled={scanning || status?.running}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
              background: `${E.cyan}18`, border: `1px solid ${E.cyan}44`, color: E.cyan,
              cursor: scanning || status?.running ? "default" : "pointer",
              opacity: scanning || status?.running ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} className={scanning || status?.running ? "animate-spin" : ""} />
            {scanning || status?.running ? "Escaneando…" : "Escanear ahora"}
          </button>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
        {[
          { label: "Activas",       value: activeAlerts.length,                 color: E.cyan   },
          { label: "Accidentes",    value: counts.accidente    ?? 0,             color: E.red    },
          { label: "Cierres",       value: counts.cierre       ?? 0,             color: E.amber  },
          { label: "Trancones",     value: counts.trancon      ?? 0,             color: E.orange },
          { label: "Manifestaciones", value: counts.manifestacion ?? 0,          color: E.purple },
        ].map(k => (
          <div key={k.label} style={{
            background: panelBg, border: `1px solid ${isDark ? E.border : "rgba(0,0,0,0.07)"}`,
            borderRadius: "10px", padding: "12px 14px",
          }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: k.color, fontFamily: "IBM Plex Mono, monospace" }}>
              {k.value}
            </div>
            <div style={{ fontSize: "11px", color: dimText, marginTop: "2px" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
        {FILTER_OPTIONS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
              border: `1px solid ${filter === f.id ? E.cyan + "88" : (isDark ? E.border : "rgba(0,0,0,0.1)")}`,
              background: filter === f.id ? `${E.cyan}18` : "transparent",
              color: filter === f.id ? E.cyan : dimText,
              cursor: "pointer",
            }}
          >
            {f.label}
            {f.id !== "all" && (counts[f.id] ?? 0) > 0 && (
              <span style={{
                marginLeft: "5px", fontSize: "10px", fontWeight: 700,
                background: getEventCfg(f.id).color + "33",
                color: getEventCfg(f.id).color,
                padding: "1px 5px", borderRadius: "10px",
              }}>
                {counts[f.id]}
              </span>
            )}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={() => setShowAll(s => !s)}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
              border: `1px solid ${isDark ? E.border : "rgba(0,0,0,0.1)"}`,
              background: showAll ? `rgba(255,255,255,0.08)` : "transparent",
              color: showAll ? "rgba(255,255,255,0.8)" : dimText, cursor: "pointer",
            }}
          >
            <Eye size={12} />
            {showAll ? "Solo activas" : "Ver historial"}
          </button>
        </div>
      </div>

      {/* ── Alert list ─────────────────────────────────────────────────── */}
      {(loadingActive || (showAll && loadingAll)) ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: dimText }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
          <p>Cargando alertas…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: panelBg, border: `1px solid ${isDark ? E.border : "rgba(0,0,0,0.07)"}`,
          borderRadius: "12px", padding: "60px 20px", textAlign: "center",
        }}>
          <Zap size={32} style={{ color: E.emerald, margin: "0 auto 12px" }} />
          <p style={{ color: textMain, fontWeight: 600, marginBottom: "6px" }}>
            {filter === "all" ? "Sin alertas activas en este momento" : `Sin ${FILTER_OPTIONS.find(f => f.id === filter)?.label.toLowerCase()} activas`}
          </p>
          <p style={{ color: dimText, fontSize: "13px" }}>
            Las alertas aparecen aquí automáticamente al detectarse eventos en @notiabel
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onResolve={(id) => { setResolvingId(id); resolve(id); }}
              resolving={resolvingId === alert.id}
            />
          ))}
        </div>
      )}

      {/* ── Footer note ────────────────────────────────────────────────── */}
      <div style={{
        background: `${E.cyan}08`, border: `1px solid ${E.cyan}22`,
        borderRadius: "8px", padding: "10px 14px",
        display: "flex", alignItems: "flex-start", gap: "8px",
      }}>
        <Radio size={13} style={{ color: E.cyan, flexShrink: 0, marginTop: "1px" }} />
        <p style={{ fontSize: "11px", color: dimText, margin: 0, lineHeight: 1.6 }}>
          <span style={{ color: E.cyan, fontWeight: 600 }}>Fuente: Canal @notiabel de Telegram</span> —
          Información de campo reportada por transportadores en tiempo real.
          Los eventos se eliminan automáticamente al vencerse su tiempo de vida o al ser marcados como resueltos.
          <span style={{ display: "block", marginTop: "2px" }}>
            Accidentes: 6h · Cierres: 24h · Trancones: 3h · Manifestaciones: 12h
          </span>
        </p>
      </div>

    </div>
  );
}

export default LiveAlerts;
