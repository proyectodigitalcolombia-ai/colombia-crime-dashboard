import { useState } from "react";
import { useGetDitraReports, useGetDitraStatus, type DitraReport } from "@workspace/api-client-react";
import { FileText, Mail, AlertTriangle, Users, Activity, Clock, RefreshCw, ChevronDown, ChevronUp, Inbox } from "lucide-react";

const BG  = "#070c15";
const PAN = "#0c1220";
const BRD = "rgba(255,255,255,0.07)";
const CYN = "#00d4ff";
const AMB = "#f59e0b";
const RED = "#ef4444";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `hace ${d} día${d > 1 ? "s" : ""}`;
  if (h > 0) return `hace ${h}h`;
  return "hace menos de 1h";
}

function KPI({ label, value, color, icon: Icon }: { label: string; value: string | number; color: string; icon: any }) {
  return (
    <div style={{ background: PAN, border: `1px solid ${BRD}`, borderRadius: 10, padding: "14px 18px", flex: 1, minWidth: 120 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ReportCard({ report }: { report: DitraReport }) {
  const [open, setOpen] = useState(false);
  const pd = report.parsed_data as any;

  return (
    <div style={{ background: PAN, border: `1px solid ${BRD}`, borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
      {/* Header */}
      <div
        onClick={() => setOpen(p => !p)}
        style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
      >
        <div style={{ background: "rgba(0,212,255,0.1)", borderRadius: 8, padding: 8 }}>
          <FileText size={18} color={CYN} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#e2e8f0", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {report.email_subject || report.pdf_filename}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {report.periodo || report.fecha_reporte || "Periodo no identificado"} · {timeAgo(report.created_at)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          {report.total_accidentes > 0 && (
            <span style={{ background: "rgba(239,68,68,0.15)", color: RED, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              {report.total_accidentes} acc.
            </span>
          )}
          {report.total_muertos > 0 && (
            <span style={{ background: "rgba(239,68,68,0.25)", color: "#fca5a5", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              {report.total_muertos} 💀
            </span>
          )}
          {report.total_heridos > 0 && (
            <span style={{ background: "rgba(245,158,11,0.15)", color: AMB, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              {report.total_heridos} her.
            </span>
          )}
          <span style={{ background: "rgba(0,212,255,0.1)", color: CYN, padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600 }}>
            {report.tipo_reporte}
          </span>
          {open ? <ChevronUp size={16} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={16} color="rgba(255,255,255,0.4)" />}
        </div>
      </div>

      {/* Detalle expandido */}
      {open && (
        <div style={{ borderTop: `1px solid ${BRD}`, padding: "16px 18px" }}>
          {report.resumen_ejecutivo && (
            <div style={{ background: "rgba(0,212,255,0.06)", border: `1px solid rgba(0,212,255,0.12)`, borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: CYN, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em" }}>Resumen ejecutivo</div>
              <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>{report.resumen_ejecutivo}</div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.15)`, borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: RED }}>{report.total_accidentes}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Accidentes</div>
            </div>
            <div style={{ background: "rgba(239,68,68,0.15)", border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#fca5a5" }}>{report.total_muertos}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Fallecidos</div>
            </div>
            <div style={{ background: "rgba(245,158,11,0.08)", border: `1px solid rgba(245,158,11,0.15)`, borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: AMB }}>{report.total_heridos}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Heridos</div>
            </div>
          </div>

          {pd?.departamentos_afectados?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>Departamentos afectados</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {pd.departamentos_afectados.map((d: string, i: number) => (
                  <span key={i} style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", padding: "3px 10px", borderRadius: 20, fontSize: 11 }}>{d}</span>
                ))}
              </div>
            </div>
          )}

          {pd?.puntos_criticos?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Puntos críticos</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pd.puntos_criticos.slice(0, 8).map((p: any, i: number) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BRD}`, borderRadius: 6, padding: "8px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <AlertTriangle size={12} color={p.tipo_evento === "accidente" ? RED : AMB} style={{ marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 12, color: "#e2e8f0" }}>{p.ubicacion}</span>
                      {p.via && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}> · {p.via}</span>}
                      {p.departamento && <span style={{ color: CYN, fontSize: 11 }}> · {p.departamento}</span>}
                      {p.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{p.descripcion}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>
            <Mail size={10} style={{ display: "inline", marginRight: 4 }} />
            {report.email_from} · {report.pdf_filename}
          </div>
        </div>
      )}
    </div>
  );
}

export function DitraReports() {
  const { data: reports = [], isLoading, refetch } = useGetDitraReports({
    query: { refetchInterval: 5 * 60 * 1000 }
  });
  const { data: status } = useGetDitraStatus();
  const [scanning, setScanning] = useState(false);

  const totalAccidentes = reports.reduce((s, r) => s + (r.total_accidentes ?? 0), 0);
  const totalMuertos    = reports.reduce((s, r) => s + (r.total_muertos ?? 0), 0);
  const totalHeridos    = reports.reduce((s, r) => s + (r.total_heridos ?? 0), 0);

  async function triggerScan() {
    setScanning(true);
    try {
      const base = (window as any).__API_BASE__ ?? "";
      await fetch(`${base}/api/ditra-monitor/scan`, { method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("safenode_token")}` }
      });
      setTimeout(() => { refetch(); setScanning(false); }, 5000);
    } catch { setScanning(false); }
  }

  return (
    <div style={{ background: BG, minHeight: "100%", padding: "20px 24px", color: "#e2e8f0", fontFamily: "sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: CYN }}>Reportes DITRA / RISTRA</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            Procesamiento automático desde {status?.inbox ?? "ditra.safenode@gmail.com"}
          </p>
        </div>
        <button
          onClick={triggerScan}
          disabled={scanning || status?.running}
          style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(0,212,255,0.1)", border: `1px solid rgba(0,212,255,0.3)`, color: CYN, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: (scanning || status?.running) ? 0.6 : 1 }}
        >
          <RefreshCw size={14} className={(scanning || status?.running) ? "animate-spin" : ""} />
          {scanning || status?.running ? "Revisando..." : "Revisar ahora"}
        </button>
      </div>

      {/* Estado del monitor */}
      <div style={{ background: PAN, border: `1px solid ${BRD}`, borderRadius: 10, padding: "12px 16px", marginBottom: 18, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: status?.configured ? "#10b981" : RED }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            {status?.configured ? "Buzón conectado" : "Buzón no configurado"}
          </span>
        </div>
        {status?.lastRun && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={12} color="rgba(255,255,255,0.3)" />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              Última revisión: {timeAgo(status.lastRun)}
            </span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Activity size={12} color="rgba(255,255,255,0.3)" />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            {status?.totalScanned ?? 0} correos revisados · {status?.totalInserted ?? 0} reportes procesados
          </span>
        </div>
      </div>

      {/* KPIs */}
      {reports.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <KPI label="Reportes" value={reports.length} color={CYN} icon={FileText} />
          <KPI label="Accidentes (total)" value={totalAccidentes} color={RED} icon={AlertTriangle} />
          <KPI label="Fallecidos (total)" value={totalMuertos} color="#fca5a5" icon={Users} />
          <KPI label="Heridos (total)" value={totalHeridos} color={AMB} icon={Activity} />
        </div>
      )}

      {/* Lista de reportes */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
          Cargando reportes...
        </div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Inbox size={48} color="rgba(255,255,255,0.1)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
            Aún no hay reportes procesados
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
            Configure el reenvío automático desde su correo corporativo a{" "}
            <span style={{ color: CYN }}>ditra.safenode@gmail.com</span>.
            El sistema revisará el buzón cada 15 minutos y procesará los PDFs automáticamente.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {reports.length} reporte{reports.length !== 1 ? "s" : ""} — haga clic para expandir
          </div>
          {reports.map(r => <ReportCard key={r.id} report={r} />)}
        </div>
      )}
    </div>
  );
}
