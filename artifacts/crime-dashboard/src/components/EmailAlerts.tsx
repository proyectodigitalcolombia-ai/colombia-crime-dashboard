import { useState, useEffect } from "react";
import { Mail, Bell, BellOff, Plus, Trash2, Send, CheckCircle, AlertCircle, Info } from "lucide-react";
import { apiFetch } from "@/context/AuthContext";

const E = {
  bg:     "#070c15",
  panel:  "#0c1220",
  panel2: "#111827",
  border: "rgba(255,255,255,0.09)",
  cyan:   "#00d4ff",
  amber:  "#f59e0b",
  green:  "#10b981",
  red:    "#ef4444",
  violet: "#a78bfa",
  text:   "rgba(255,255,255,0.9)",
  muted:  "rgba(255,255,255,0.45)",
};

interface AlertConfig {
  id?: number;
  recipients: string[];
  enabled: boolean;
  days_before: number;
  send_hour: number;
  last_sent_at?: string | null;
}

const HOUR_OPTS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, "0")}:00 (${i < 12 ? "AM" : "PM"})`,
}));

const DAYS_OPTS = [
  { value: 1, label: "1 día antes" },
  { value: 2, label: "2 días antes" },
  { value: 3, label: "3 días antes" },
  { value: 5, label: "5 días antes" },
  { value: 7, label: "1 semana antes" },
];

export function EmailAlerts() {
  const [config, setConfig] = useState<AlertConfig>({
    recipients: [],
    enabled: true,
    days_before: 1,
    send_hour: 18,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/email-alerts/config"),
      apiFetch("/email-alerts/status"),
    ]).then(async ([cfgRes, statusRes]) => {
      if (cfgRes.ok) {
        const data = await cfgRes.json();
        if (data) {
          setConfig({
            id: data.id,
            recipients: data.recipients ?? [],
            enabled: data.enabled ?? true,
            days_before: data.days_before ?? 1,
            send_hour: data.send_hour ?? 18,
            last_sent_at: data.last_sent_at,
          });
        }
      }
      if (statusRes.ok) {
        const s = await statusRes.json();
        setProviderConfigured(s.configured);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Dirección de correo inválida");
      return;
    }
    if (config.recipients.includes(email)) {
      setEmailError("Este correo ya está en la lista");
      return;
    }
    setConfig(c => ({ ...c, recipients: [...c.recipients, email] }));
    setNewEmail("");
    setEmailError(null);
  };

  const removeEmail = (email: string) => {
    setConfig(c => ({ ...c, recipients: c.recipients.filter(r => r !== email) }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch("/email-alerts/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al guardar");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (config.recipients.length === 0) {
      setTestErr("Agregue al menos un destinatario antes de enviar la prueba");
      return;
    }
    setTesting(true);
    setTestMsg(null);
    setTestErr(null);
    try {
      const res = await apiFetch("/email-alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: config.recipients }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestErr(data.error ?? "Error al enviar");
      } else {
        setTestMsg(data.message ?? "Correo enviado con éxito");
        setTimeout(() => setTestMsg(null), 6000);
      }
    } catch {
      setTestErr("Error de conexión al enviar el correo de prueba");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid rgba(0,212,255,0.15)`, borderTopColor: E.cyan, animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Provider status banner */}
      {providerConfigured === false && (
        <div style={{
          background: "rgba(245,158,11,0.08)", border: `1px solid rgba(245,158,11,0.3)`,
          borderRadius: 10, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start",
        }}>
          <Info size={16} style={{ color: E.amber, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: E.amber, marginBottom: 4 }}>
              Proveedor de correo no configurado
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
              Para enviar correos reales, agregue la variable de entorno <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}>RESEND_API_KEY</code> en
              las variables de entorno del servicio (Render → Environment Variables). Puede obtener una clave gratuita en{" "}
              <a href="https://resend.com" target="_blank" rel="noreferrer" style={{ color: E.cyan, textDecoration: "none" }}>resend.com</a>.
            </div>
          </div>
        </div>
      )}

      {/* Toggle enabled */}
      <div style={{
        background: E.panel2, border: `1px solid ${E.border}`, borderRadius: 10, padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {config.enabled
            ? <Bell size={18} style={{ color: E.cyan }} />
            : <BellOff size={18} style={{ color: E.muted }} />
          }
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: E.text }}>Alertas por correo</div>
            <div style={{ fontSize: 12, color: E.muted, marginTop: 2 }}>
              {config.enabled ? "Las alertas están activas" : "Las alertas están desactivadas"}
            </div>
          </div>
        </div>
        <button
          onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
          style={{
            position: "relative", width: 44, height: 24, borderRadius: 12,
            background: config.enabled ? E.cyan : "rgba(255,255,255,0.12)",
            border: "none", cursor: "pointer", transition: "background 0.2s",
          }}>
          <div style={{
            position: "absolute", top: 3, left: config.enabled ? 23 : 3,
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
          }} />
        </button>
      </div>

      {/* Schedule config */}
      <div style={{
        background: E.panel2, border: `1px solid ${E.border}`, borderRadius: 10, padding: "16px 20px",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
      }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: E.muted, display: "block", marginBottom: 8 }}>
            Enviar con anticipación
          </label>
          <select
            value={config.days_before}
            onChange={e => setConfig(c => ({ ...c, days_before: Number(e.target.value) }))}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
              background: "rgba(255,255,255,0.05)", color: E.text,
              border: `1px solid ${E.border}`, outline: "none", cursor: "pointer",
            }}>
            {DAYS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: E.muted, display: "block", marginBottom: 8 }}>
            Hora de envío
          </label>
          <select
            value={config.send_hour}
            onChange={e => setConfig(c => ({ ...c, send_hour: Number(e.target.value) }))}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
              background: "rgba(255,255,255,0.05)", color: E.text,
              border: `1px solid ${E.border}`, outline: "none", cursor: "pointer",
            }}>
            {HOUR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Recipients */}
      <div style={{
        background: E.panel2, border: `1px solid ${E.border}`, borderRadius: 10, padding: "16px 20px",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: E.muted, marginBottom: 12 }}>
          Destinatarios ({config.recipients.length})
        </div>

        {/* Add email */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="email"
            placeholder="correo@empresa.com"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setEmailError(null); }}
            onKeyDown={e => e.key === "Enter" && addEmail()}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13,
              background: "rgba(255,255,255,0.05)", color: E.text,
              border: `1px solid ${emailError ? E.red : E.border}`, outline: "none",
            }}
          />
          <button
            onClick={addEmail}
            style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: "rgba(0,212,255,0.1)", color: E.cyan,
              border: `1px solid rgba(0,212,255,0.25)`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
            }}>
            <Plus size={14} /> Agregar
          </button>
        </div>
        {emailError && <div style={{ fontSize: 12, color: E.red, marginBottom: 10 }}>{emailError}</div>}

        {/* Recipients list */}
        {config.recipients.length === 0 ? (
          <div style={{ fontSize: 13, color: E.muted, padding: "12px 0", textAlign: "center" }}>
            Sin destinatarios — agregue al menos uno
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {config.recipients.map(email => (
              <div key={email} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Mail size={13} style={{ color: E.cyan }} />
                  <span style={{ fontSize: 13, color: E.text }}>{email}</span>
                </div>
                <button
                  onClick={() => removeEmail(email)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: E.muted, padding: 4, borderRadius: 4 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Last sent info */}
      {config.last_sent_at && (
        <div style={{ fontSize: 12, color: E.muted, textAlign: "center" }}>
          Último envío: {new Date(config.last_sent_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={handleTest}
          disabled={testing || config.recipients.length === 0}
          style={{
            flex: 1, minWidth: 150, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "rgba(167,139,250,0.12)", color: E.violet,
            border: `1px solid rgba(167,139,250,0.25)`,
            cursor: testing || config.recipients.length === 0 ? "not-allowed" : "pointer",
            opacity: testing || config.recipients.length === 0 ? 0.6 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
          <Send size={14} />
          {testing ? "Enviando…" : "Enviar prueba"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1, minWidth: 150, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: saved ? "rgba(16,185,129,0.15)" : "rgba(0,212,255,0.12)",
            color: saved ? E.green : E.cyan,
            border: `1px solid ${saved ? "rgba(16,185,129,0.3)" : "rgba(0,212,255,0.25)"}`,
            cursor: saving ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
          {saved ? <CheckCircle size={14} /> : null}
          {saving ? "Guardando…" : saved ? "¡Guardado!" : "Guardar configuración"}
        </button>
      </div>

      {/* Feedback */}
      {testMsg && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "rgba(16,185,129,0.08)", border: `1px solid rgba(16,185,129,0.25)`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: E.green }}>
          <CheckCircle size={14} /> {testMsg}
        </div>
      )}
      {testErr && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: E.red }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {testErr}
        </div>
      )}
      {error && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: E.red }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </div>
  );
}
