import { useState } from "react";
import { AlertTriangle, X, RefreshCw, CheckCircle, Wifi, WifiOff } from "lucide-react";
import { useGetRefreshStatus, useTriggerRefresh } from "@workspace/api-client-react";
import { useRoadConditions, useRefreshRoadConditions } from "@/hooks/useRoadConditions";
import { useQueryClient } from "@tanstack/react-query";

const E = {
  red:    "#ef4444",
  amber:  "#f59e0b",
  emerald:"#10b981",
  cyan:   "#00d4ff",
};

interface Alert {
  id: string;
  level: "error" | "warning" | "info";
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
  };
}

interface Props {
  dark?: boolean;
}

export function DataAlertBanner({ dark = true }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: refreshStatus, isError: crimeError, isFetching: crimeLoading } = useGetRefreshStatus({
    query: { refetchInterval: 5 * 60 * 1000 },
  });
  const { mutate: triggerCrimeRefresh, isPending: crimeRefreshing } = useTriggerRefresh({
    mutation: { onSuccess: () => queryClient.invalidateQueries() },
  });

  const { data: rcData, isError: rcError, isFetching: rcLoading } = useRoadConditions();
  const { mutate: triggerRcRefresh, isPending: rcRefreshing } = useRefreshRoadConditions();

  const alerts: Alert[] = [];

  /* ── Crime data alerts ── */
  if (crimeError) {
    alerts.push({
      id: "crime-api-down",
      level: "error",
      title: "API de delitos inaccesible",
      message: "No se pudo conectar con el servidor de estadísticas. Los datos mostrados pueden estar desactualizados.",
      action: {
        label: "Reintentar",
        onClick: () => queryClient.invalidateQueries(),
        loading: crimeLoading,
      },
    });
  } else if (refreshStatus?.status === "error") {
    alerts.push({
      id: "crime-source-error",
      level: "error",
      title: "Error al descargar datos de la Policía Nacional",
      message: refreshStatus.message ?? "El archivo AICRI no pudo descargarse. Se muestran datos de la última actualización exitosa.",
      action: {
        label: "Forzar actualización",
        onClick: () => triggerCrimeRefresh(),
        loading: crimeRefreshing,
      },
    });
  } else if (refreshStatus?.lastRefreshed) {
    const ageMs = Date.now() - new Date(refreshStatus.lastRefreshed).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 35) {
      alerts.push({
        id: "crime-stale",
        level: "warning",
        title: "Datos de delitos desactualizados",
        message: `Última actualización hace ${Math.floor(ageDays)} días. La Policía Nacional publica nuevos archivos mensualmente.`,
        action: {
          label: "Actualizar ahora",
          onClick: () => triggerCrimeRefresh(),
          loading: crimeRefreshing,
        },
      });
    }
  }

  /* ── Road conditions alerts ── */
  const isNetworkError = (msg: string) =>
    /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|AbortError|network/i.test(msg);

  if (rcError) {
    alerts.push({
      id: "road-api-down",
      level: "error",
      title: "Estado de vías inaccesible",
      message: "No se pudo obtener el estado actual de vías de policia.gov.co.",
      action: {
        label: "Reintentar",
        onClick: () => triggerRcRefresh(),
        loading: rcRefreshing || rcLoading,
      },
    });
  } else if (rcData?.error && !isNetworkError(rcData.error)) {
    alerts.push({
      id: "road-source-error",
      level: "warning",
      title: "Advertencia: Estado de vías",
      message: `${rcData.error} — Se muestran los últimos datos disponibles.`,
      action: {
        label: "Reintentar",
        onClick: () => triggerRcRefresh(),
        loading: rcRefreshing,
      },
    });
  }

  /* Critical road closures summary — info banner */
  if (!rcError && rcData && rcData.closureCount > 0 && !alerts.find(a => a.id === "road-api-down")) {
    alerts.push({
      id: "road-closures-summary",
      level: "info",
      title: `${rcData.closureCount} cierre${rcData.closureCount !== 1 ? "s" : ""} total${rcData.closureCount !== 1 ? "es" : ""} activo${rcData.closureCount !== 1 ? "s" : ""} en Colombia`,
      message: `${rcData.totalCount} afectaciones viales reportadas por la Policía Nacional. Revise la pestaña Análisis de Ruta antes de despachar.`,
    });
  }

  const visible = alerts.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
      {visible.map(alert => {
        const isError   = alert.level === "error";
        const isWarning = alert.level === "warning";
        const isInfo    = alert.level === "info";

        const accent  = isError ? E.red : isWarning ? E.amber : E.cyan;
        const bgAlpha = dark
          ? (isError ? "rgba(239,68,68,0.08)" : isWarning ? "rgba(245,158,11,0.08)" : "rgba(0,212,255,0.06)")
          : (isError ? "#fef2f2" : isWarning ? "#fffbeb" : "#f0f9ff");

        return (
          <div
            key={alert.id}
            role="alert"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "10px 14px",
              borderRadius: "10px",
              background: bgAlpha,
              border: `1px solid ${accent}40`,
              animation: "slideIn 0.2s ease",
            }}
          >
            {/* Icon */}
            <div style={{ flexShrink: 0, marginTop: "1px" }}>
              {isError   && <WifiOff   style={{ width: 15, height: 15, color: accent }} />}
              {isWarning && <AlertTriangle style={{ width: 15, height: 15, color: accent }} />}
              {isInfo    && <CheckCircle   style={{ width: 15, height: 15, color: accent }} />}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: accent, marginBottom: "2px" }}>
                {alert.title}
              </div>
              <div style={{
                fontSize: "11px",
                color: dark ? "rgba(255,255,255,0.6)" : "#4b5563",
                lineHeight: 1.4,
              }}>
                {alert.message}
              </div>
            </div>

            {/* Action button */}
            {alert.action && (
              <button
                onClick={alert.action.onClick}
                disabled={alert.action.loading}
                style={{
                  flexShrink: 0,
                  fontSize: "11px",
                  fontWeight: 600,
                  color: accent,
                  background: `${accent}18`,
                  border: `1px solid ${accent}35`,
                  borderRadius: "6px",
                  padding: "4px 10px",
                  cursor: alert.action.loading ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  opacity: alert.action.loading ? 0.7 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                <RefreshCw
                  style={{
                    width: 10,
                    height: 10,
                    animation: alert.action.loading ? "spin 1s linear infinite" : "none",
                  }}
                />
                {alert.action.label}
              </button>
            )}

            {/* Dismiss */}
            <button
              onClick={() => setDismissed(s => new Set([...s, alert.id]))}
              title="Cerrar"
              style={{
                flexShrink: 0,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: dark ? "rgba(255,255,255,0.35)" : "#9ca3af",
                padding: "2px",
                marginTop: "1px",
                display: "flex",
              }}
            >
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
