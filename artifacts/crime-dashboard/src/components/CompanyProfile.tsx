import { useState, useRef, useEffect } from "react";
import { useAuth, apiFetch } from "@/context/AuthContext";
import { Building2, User, Upload, Save, RefreshCw, CheckCircle, AlertCircle, X, Palette } from "lucide-react";

const E = {
  bg:     "#070c15",
  panel:  "#0c1220",
  border: "rgba(255,255,255,0.09)",
  cyan:   "#00d4ff",
  amber:  "#f59e0b",
  green:  "#10b981",
  red:    "#ef4444",
  text:   "rgba(255,255,255,0.9)",
  muted:  "rgba(255,255,255,0.45)",
};

const PRESET_COLORS = [
  "#00bcd4","#00d4ff","#0ea5e9","#6366f1","#8b5cf6",
  "#ec4899","#ef4444","#f59e0b","#10b981","#14b8a6",
];

interface Props { dark: boolean; }

type SyncStatus = {
  lastChecked: string | null;
  lastChanged: string | null;
  bulletinTitle: string | null;
  bulletinUrls: string[];
  newDetected: boolean;
  sourceUrl: string;
};

export function CompanyProfile({ dark }: Props) {
  const { user, updateConfig } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [form, setForm] = useState({
    companyName: user?.companyName ?? "SafeNode S.A.S.",
    companySubtitle: user?.companySubtitle ?? "Inteligencia en Seguridad Logística y Transporte",
    companyNit: user?.companyNit ?? "",
    companyAddress: user?.companyAddress ?? "",
    companyCity: user?.companyCity ?? "Bogotá D.C.",
    companyLogo: user?.companyLogo ?? null as string | null,
    analystName: user?.analystName ?? "",
    analystCargo: user?.analystCargo ?? "Analista de Seguridad",
    analystEmail: user?.analystEmail ?? "",
    analystPhone: user?.analystPhone ?? "",
    primaryColor: user?.primaryColor ?? "#00bcd4",
    footerDisclaimer: user?.footerDisclaimer ?? "Documento confidencial — uso exclusivo interno.",
  });

  useEffect(() => {
    if (user) {
      setForm({
        companyName: user.companyName,
        companySubtitle: user.companySubtitle,
        companyNit: user.companyNit ?? "",
        companyAddress: user.companyAddress ?? "",
        companyCity: user.companyCity ?? "Bogotá D.C.",
        companyLogo: user.companyLogo ?? null,
        analystName: user.analystName,
        analystCargo: user.analystCargo ?? "Analista de Seguridad",
        analystEmail: user.analystEmail,
        analystPhone: user.analystPhone,
        primaryColor: user.primaryColor,
        footerDisclaimer: user.footerDisclaimer,
      });
    }
  }, [user]);

  useEffect(() => {
    const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
    fetch(`${API_BASE}/api/restrictions/sync-status`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setSyncStatus(data))
      .catch(() => {});
  }, []);

  function set(key: string, val: string | null) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("El logo no puede superar 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => set("companyLogo", ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError(null);
    try {
      await updateConfig(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const token = localStorage.getItem("safenode_token");
      const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
      const r = await fetch(`${API_BASE}/api/restrictions/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      const statusR = await fetch(`${API_BASE}/api/restrictions/sync-status`);
      if (statusR.ok) setSyncStatus(await statusR.json());
    } catch (err: any) {
      setError(err?.message ?? "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  const bg = dark ? E.bg : "#f8fafc";
  const panelBg = dark ? E.panel : "#ffffff";
  const borderClr = dark ? E.border : "rgba(0,0,0,0.08)";
  const textMain = dark ? E.text : "#1e293b";
  const textMuted = dark ? E.muted : "#6b7280";
  const inputBg = dark ? "rgba(255,255,255,0.05)" : "#f9fafb";

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: "8px",
    border: `1px solid ${borderClr}`, background: inputBg, color: textMain,
    fontSize: "13px", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em",
    textTransform: "uppercase", color: textMuted, marginBottom: "5px", display: "block",
  };
  const sectionStyle: React.CSSProperties = {
    background: panelBg, border: `1px solid ${borderClr}`,
    borderRadius: "14px", padding: "24px 28px", marginBottom: "18px",
  };

  return (
    <div style={{ maxWidth: "780px", margin: "0 auto", padding: "4px 0 40px" }}>

      {/* ── SYNC STATUS BANNER ── */}
      {syncStatus && (
        <div style={{
          background: syncStatus.newDetected
            ? "rgba(245,158,11,0.12)"
            : dark ? "rgba(0,212,255,0.06)" : "rgba(0,180,220,0.07)",
          border: `1px solid ${syncStatus.newDetected ? "rgba(245,158,11,0.4)" : "rgba(0,212,255,0.2)"}`,
          borderRadius: "12px", padding: "14px 20px", marginBottom: "22px",
          display: "flex", alignItems: "center", gap: "12px",
        }}>
          <RefreshCw size={16} style={{ color: syncStatus.newDetected ? E.amber : E.cyan, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: syncStatus.newDetected ? E.amber : E.cyan }}>
              {syncStatus.newDetected
                ? "⚠ Nuevo boletín detectado en MinTransporte"
                : "Sincronización con MinTransporte activa"}
            </div>
            <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>
              {syncStatus.bulletinTitle && <span>{syncStatus.bulletinTitle} · </span>}
              Última revisión: {syncStatus.lastChecked
                ? new Date(syncStatus.lastChecked).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })
                : "Pendiente"}
              {syncStatus.lastChanged && (
                <span> · Última actualización: {new Date(syncStatus.lastChanged).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</span>
              )}
            </div>
          </div>
          <button
            onClick={handleSync} disabled={syncing}
            style={{
              padding: "6px 14px", borderRadius: "7px", border: "none", cursor: "pointer",
              background: syncing ? "transparent" : "rgba(0,212,255,0.15)",
              color: E.cyan, fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px",
            }}
          >
            <RefreshCw size={12} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
            {syncing ? "Sincronizando..." : "Sincronizar ahora"}
          </button>
        </div>
      )}

      {/* ── SAVE SUCCESS / ERROR ── */}
      {saved && (
        <div style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "10px", padding: "12px 18px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle size={15} color={E.green} />
          <span style={{ fontSize: "13px", color: E.green, fontWeight: 600 }}>Perfil guardado correctamente.</span>
        </div>
      )}
      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px 18px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertCircle size={15} color={E.red} />
          <span style={{ fontSize: "13px", color: E.red, flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: E.red }}><X size={14} /></button>
        </div>
      )}

      {/* ── LOGO + EMPRESA ── */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "22px" }}>
          <Building2 size={17} color={E.cyan} />
          <span style={{ fontSize: "14px", fontWeight: 700, color: E.cyan, letterSpacing: "0.04em" }}>DATOS DE LA EMPRESA</span>
        </div>

        <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Logo upload */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", minWidth: "120px" }}>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                width: "110px", height: "110px", borderRadius: "12px",
                border: `2px dashed ${borderClr}`, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden", background: inputBg, position: "relative",
              }}
              title="Click para subir logo"
            >
              {form.companyLogo ? (
                <img src={form.companyLogo} alt="Logo empresa" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <div style={{ textAlign: "center", padding: "10px" }}>
                  <Upload size={22} color={textMuted} />
                  <div style={{ fontSize: "10px", color: textMuted, marginTop: "6px" }}>Subir logo</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
            {form.companyLogo && (
              <button
                onClick={() => set("companyLogo", null)}
                style={{ fontSize: "10px", color: E.red, background: "none", border: "none", cursor: "pointer" }}
              >
                Eliminar logo
              </button>
            )}
            <span style={{ fontSize: "10px", color: textMuted, textAlign: "center" }}>PNG/JPG · Máx 2 MB</span>
          </div>

          {/* Company fields */}
          <div style={{ flex: 1, minWidth: "260px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Razón Social</label>
                <input style={inputStyle} value={form.companyName} onChange={e => set("companyName", e.target.value)} placeholder="SafeNode S.A.S." />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Actividad / Subtítulo</label>
                <input style={inputStyle} value={form.companySubtitle} onChange={e => set("companySubtitle", e.target.value)} placeholder="Inteligencia en Seguridad..." />
              </div>
              <div>
                <label style={labelStyle}>NIT</label>
                <input style={inputStyle} value={form.companyNit} onChange={e => set("companyNit", e.target.value)} placeholder="900.123.456-7" />
              </div>
              <div>
                <label style={labelStyle}>Ciudad</label>
                <input style={inputStyle} value={form.companyCity} onChange={e => set("companyCity", e.target.value)} placeholder="Bogotá D.C." />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Dirección</label>
                <input style={inputStyle} value={form.companyAddress} onChange={e => set("companyAddress", e.target.value)} placeholder="Cra 7 # 32-50, Of 301" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── RESPONSABLE ── */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "22px" }}>
          <User size={17} color={E.cyan} />
          <span style={{ fontSize: "14px", fontWeight: 700, color: E.cyan, letterSpacing: "0.04em" }}>RESPONSABLE DEL ENVÍO DE INFORMACIÓN</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div>
            <label style={labelStyle}>Nombre completo</label>
            <input style={inputStyle} value={form.analystName} onChange={e => set("analystName", e.target.value)} placeholder="Juan Pérez López" />
          </div>
          <div>
            <label style={labelStyle}>Cargo</label>
            <input style={inputStyle} value={form.analystCargo} onChange={e => set("analystCargo", e.target.value)} placeholder="Analista de Seguridad" />
          </div>
          <div>
            <label style={labelStyle}>Correo electrónico</label>
            <input style={inputStyle} type="email" value={form.analystEmail} onChange={e => set("analystEmail", e.target.value)} placeholder="seguridad@empresa.com" />
          </div>
          <div>
            <label style={labelStyle}>Teléfono / Celular</label>
            <input style={inputStyle} value={form.analystPhone} onChange={e => set("analystPhone", e.target.value)} placeholder="+57 310 000 0000" />
          </div>
        </div>
      </div>

      {/* ── PERSONALIZACIÓN ── */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "22px" }}>
          <Palette size={17} color={E.cyan} />
          <span style={{ fontSize: "14px", fontWeight: 700, color: E.cyan, letterSpacing: "0.04em" }}>PERSONALIZACIÓN DEL INFORME</span>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label style={labelStyle}>Color corporativo</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => set("primaryColor", c)}
                style={{
                  width: "26px", height: "26px", borderRadius: "6px", border: "none", cursor: "pointer",
                  background: c,
                  outline: form.primaryColor === c ? `3px solid ${E.text}` : "none",
                  outlineOffset: "2px",
                }}
              />
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "6px" }}>
              <input
                type="color"
                value={form.primaryColor}
                onChange={e => set("primaryColor", e.target.value)}
                style={{ width: "28px", height: "28px", borderRadius: "6px", border: "none", cursor: "pointer", background: "transparent", padding: 0 }}
              />
              <span style={{ fontSize: "12px", color: textMuted, fontFamily: "monospace" }}>{form.primaryColor}</span>
            </div>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Pie de página / Aviso de confidencialidad</label>
          <textarea
            value={form.footerDisclaimer}
            onChange={e => set("footerDisclaimer", e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical", lineHeight: "1.5" }}
            placeholder="Documento confidencial — uso exclusivo interno."
          />
        </div>
      </div>

      {/* ── SAVE ── */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "11px 32px", borderRadius: "10px", border: "none", cursor: saving ? "not-allowed" : "pointer",
            background: `linear-gradient(135deg, ${form.primaryColor}, ${form.primaryColor}bb)`,
            color: "#fff", fontSize: "13px", fontWeight: 700,
            display: "flex", alignItems: "center", gap: "7px",
            opacity: saving ? 0.7 : 1, transition: "opacity 0.2s",
            boxShadow: `0 4px 14px ${form.primaryColor}44`,
          }}
        >
          {saving ? <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
          {saving ? "Guardando..." : "Guardar perfil"}
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
