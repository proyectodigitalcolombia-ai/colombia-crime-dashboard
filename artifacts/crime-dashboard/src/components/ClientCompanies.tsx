import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/context/AuthContext";
import { Building2, Plus, Pencil, Trash2, Save, X, Upload, Mail, Phone, MapPin, FileText, ChevronDown, ChevronUp } from "lucide-react";

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
  dark:   "rgba(255,255,255,0.06)",
};

interface Company {
  id: number;
  name: string;
  nit: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  city: string;
  logo: string | null;
  notes: string;
  created_at: string;
}

const EMPTY: Omit<Company, "id" | "created_at"> = {
  name: "", nit: "", contact_name: "", contact_email: "",
  contact_phone: "", address: "", city: "", logo: null, notes: "",
};

interface Props { dark: boolean; }

export function ClientCompanies({ dark }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const panel  = dark ? E.panel  : "#ffffff";
  const border = dark ? E.border : "rgba(0,0,0,0.1)";
  const text   = dark ? E.text   : "#0f172a";
  const muted  = dark ? E.muted  : "#6b7280";
  const darkBg = dark ? E.dark   : "#f8fafc";

  useEffect(() => { loadCompanies(); }, []);

  async function loadCompanies() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/companies");
      if (!res.ok) throw new Error("Error al cargar empresas");
      setCompanies(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  function startNew() {
    setForm({ ...EMPTY });
    setEditId("new");
    setExpanded(null);
  }

  function startEdit(c: Company) {
    setForm({
      name: c.name, nit: c.nit, contact_name: c.contact_name,
      contact_email: c.contact_email, contact_phone: c.contact_phone,
      address: c.address, city: c.city, logo: c.logo, notes: c.notes,
    });
    setEditId(c.id);
    setExpanded(c.id);
  }

  function cancelEdit() { setEditId(null); }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, logo: ev.target?.result as string }));
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const isNew = editId === "new";
      const res = await apiFetch(
        isNew ? "/api/companies" : `/api/companies/${editId}`,
        { method: isNew ? "POST" : "PATCH", body: JSON.stringify(form) }
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al guardar");
      await loadCompanies();
      setEditId(null);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/api/companies/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      setCompanies(cs => cs.filter(c => c.id !== id));
      setDeleteConfirm(null);
      if (expanded === id) setExpanded(null);
    } catch (e: any) { setError(e.message); }
  }

  function Field({ label, field, type = "text", icon }: { label: string; field: keyof typeof EMPTY; type?: string; icon?: React.ReactNode }) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
        <label style={{ fontSize:10, fontWeight:700, color:muted, textTransform:"uppercase", letterSpacing:"0.07em",
          display:"flex", alignItems:"center", gap:5 }}>
          {icon} {label}
        </label>
        <input
          type={type}
          value={(form[field] as string) ?? ""}
          onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          style={{ background: darkBg, border:`1px solid ${border}`, borderRadius:6, padding:"7px 10px",
            color:text, fontSize:12, outline:"none" }}
          placeholder={label}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:text, display:"flex", alignItems:"center", gap:8 }}>
            <Building2 size={18} color={E.cyan} /> Empresas Cliente
          </div>
          <div style={{ fontSize:11, color:muted, marginTop:3 }}>
            Gestione los perfiles de sus clientes para envío de informes personalizados
          </div>
        </div>
        <button onClick={startNew} style={{
          padding:"8px 14px", borderRadius:8, fontSize:11, fontWeight:700,
          background:E.cyan, color:"#060a10", border:"none", cursor:"pointer",
          display:"flex", alignItems:"center", gap:6 }}>
          <Plus size={14} /> Nueva empresa
        </button>
      </div>

      {error && (
        <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)",
          borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:E.red,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          {error}
          <button onClick={() => setError(null)} style={{ background:"none", border:"none", color:E.red, cursor:"pointer" }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* New company form */}
      {editId === "new" && (
        <div style={{ background: panel, border:`1px solid ${E.cyan}`, borderRadius:10, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:800, color:E.cyan, marginBottom:16,
            display:"flex", alignItems:"center", gap:8 }}>
            <Plus size={14} /> Nueva empresa cliente
          </div>
          <CompanyForm form={form} setForm={setForm} Field={Field} logoRef={logoRef}
            handleLogoChange={handleLogoChange} dark={dark} border={border} darkBg={darkBg} text={text} muted={muted} />
          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{
              padding:"8px 16px", borderRadius:8, fontSize:12, fontWeight:700,
              background: saving ? "#334155" : E.cyan, color:"#060a10",
              border:"none", cursor: saving ? "wait" : "pointer",
              display:"flex", alignItems:"center", gap:6 }}>
              <Save size={14} /> {saving ? "Guardando..." : "Guardar empresa"}
            </button>
            <button onClick={cancelEdit} style={{
              padding:"8px 14px", borderRadius:8, fontSize:12, fontWeight:700,
              background:"transparent", color:muted, border:`1px solid ${border}`, cursor:"pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Company list */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40, color:muted, fontSize:12 }}>Cargando empresas...</div>
      ) : companies.length === 0 ? (
        <div style={{ background: panel, border:`1px solid ${border}`, borderRadius:10,
          padding:"40px 20px", textAlign:"center" }}>
          <Building2 size={36} color={muted} style={{ marginBottom:12 }} />
          <div style={{ color:muted, fontSize:12 }}>
            No hay empresas registradas.<br />
            Agregue clientes para gestionar el envío de informes personalizados.
          </div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {companies.map(c => (
            <div key={c.id} style={{ background: panel, border:`1px solid ${expanded===c.id ? E.cyan+"44" : border}`,
              borderRadius:10, overflow:"hidden", transition:"border-color 0.2s" }}>
              {/* Row header */}
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", cursor:"pointer" }}
                onClick={() => setExpanded(expanded===c.id ? null : c.id)}>
                {c.logo ? (
                  <img src={c.logo} alt="Logo" style={{ width:36, height:36, objectFit:"contain",
                    borderRadius:6, background:"#fff", padding:2, flexShrink:0 }} />
                ) : (
                  <div style={{ width:36, height:36, borderRadius:6, background:darkBg,
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Building2 size={18} color={muted} />
                  </div>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:text, display:"flex", alignItems:"center", gap:8 }}>
                    {c.name}
                    {c.nit && <span style={{ fontSize:10, color:muted, fontWeight:400 }}>NIT {c.nit}</span>}
                  </div>
                  <div style={{ fontSize:11, color:muted, marginTop:2, display:"flex", gap:14, flexWrap:"wrap" }}>
                    {c.city && <span>📍 {c.city}</span>}
                    {c.contact_email && <span>✉ {c.contact_email}</span>}
                    {c.contact_phone && <span>☎ {c.contact_phone}</span>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, flexShrink:0, alignItems:"center" }}>
                  <button onClick={e => { e.stopPropagation(); startEdit(c); }} style={{
                    padding:"5px 10px", borderRadius:6, fontSize:11, fontWeight:600,
                    background:"transparent", color:E.cyan, border:`1px solid ${E.cyan}44`,
                    cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                    <Pencil size={12} /> Editar
                  </button>
                  {deleteConfirm === c.id ? (
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }} style={{
                        padding:"5px 10px", borderRadius:6, fontSize:11, fontWeight:700,
                        background:E.red, color:"#fff", border:"none", cursor:"pointer" }}>
                        Confirmar
                      </button>
                      <button onClick={e => { e.stopPropagation(); setDeleteConfirm(null); }} style={{
                        padding:"5px 8px", borderRadius:6, fontSize:11,
                        background:"transparent", color:muted, border:`1px solid ${border}`, cursor:"pointer" }}>
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); setDeleteConfirm(c.id); }} style={{
                      padding:"5px 8px", borderRadius:6, fontSize:11,
                      background:"transparent", color:E.red, border:`1px solid ${E.red}44`,
                      cursor:"pointer", display:"flex", alignItems:"center" }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                  {expanded===c.id ? <ChevronUp size={14} color={muted} /> : <ChevronDown size={14} color={muted} />}
                </div>
              </div>

              {/* Expanded detail / edit form */}
              {expanded === c.id && (
                <div style={{ borderTop:`1px solid ${border}`, padding:"16px 16px 20px" }}>
                  {editId === c.id ? (
                    <>
                      <CompanyForm form={form} setForm={setForm} Field={Field} logoRef={logoRef}
                        handleLogoChange={handleLogoChange} dark={dark} border={border} darkBg={darkBg} text={text} muted={muted} />
                      <div style={{ display:"flex", gap:10, marginTop:16 }}>
                        <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{
                          padding:"8px 16px", borderRadius:8, fontSize:12, fontWeight:700,
                          background: saving ? "#334155" : E.cyan, color:"#060a10",
                          border:"none", cursor: saving ? "wait" : "pointer",
                          display:"flex", alignItems:"center", gap:6 }}>
                          <Save size={14} /> {saving ? "Guardando..." : "Guardar cambios"}
                        </button>
                        <button onClick={cancelEdit} style={{
                          padding:"8px 14px", borderRadius:8, fontSize:12, fontWeight:700,
                          background:"transparent", color:muted, border:`1px solid ${border}`, cursor:"pointer" }}>
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 24px", fontSize:12 }}>
                      {c.contact_name && <Row label="Contacto" value={c.contact_name} muted={muted} text={text} />}
                      {c.contact_email && <Row label="Email" value={c.contact_email} muted={muted} text={text} icon={<Mail size={11}/>} />}
                      {c.contact_phone && <Row label="Teléfono" value={c.contact_phone} muted={muted} text={text} icon={<Phone size={11}/>} />}
                      {c.address && <Row label="Dirección" value={c.address} muted={muted} text={text} icon={<MapPin size={11}/>} />}
                      {c.city && <Row label="Ciudad" value={c.city} muted={muted} text={text} />}
                      {c.notes && <Row label="Notas" value={c.notes} muted={muted} text={text} icon={<FileText size={11}/>} wide />}
                      <Row label="Registrada" value={new Date(c.created_at).toLocaleDateString("es-CO")} muted={muted} text={text} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <input ref={logoRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleLogoChange} />
    </div>
  );
}

function Row({ label, value, muted, text, icon, wide }: {
  label: string; value: string; muted: string; text: string; icon?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <span style={{ color:muted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em",
        display:"flex", alignItems:"center", gap:4 }}>{icon}{label}</span>
      <span style={{ color:text, fontWeight:500, marginLeft:2 }}>{value}</span>
    </div>
  );
}

function CompanyForm({ form, setForm, Field, logoRef, handleLogoChange, dark, border, darkBg, text, muted }: any) {
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div style={{ gridColumn:"1 / -1" }}>
          <Field label="Nombre de la empresa *" field="name" icon={<Building2 size={11}/>} />
        </div>
        <Field label="NIT" field="nit" />
        <Field label="Ciudad" field="city" />
        <Field label="Dirección" field="address" icon={<MapPin size={11}/>} />
        <Field label="Contacto principal" field="contact_name" />
        <Field label="Email" field="contact_email" type="email" icon={<Mail size={11}/>} />
        <Field label="Teléfono" field="contact_phone" type="tel" icon={<Phone size={11}/>} />
        <div style={{ gridColumn:"1 / -1", display:"flex", flexDirection:"column", gap:4 }}>
          <label style={{ fontSize:10, fontWeight:700, color:muted, textTransform:"uppercase", letterSpacing:"0.07em",
            display:"flex", alignItems:"center", gap:5 }}>
            <FileText size={11} /> Notas internas
          </label>
          <textarea
            value={form.notes ?? ""}
            onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))}
            rows={2}
            style={{ background:darkBg, border:`1px solid ${border}`, borderRadius:6, padding:"7px 10px",
              color:text, fontSize:12, outline:"none", resize:"vertical", fontFamily:"inherit" }}
            placeholder="Observaciones, notas sobre el cliente..."
          />
        </div>
        <div style={{ gridColumn:"1 / -1" }}>
          <label style={{ fontSize:10, fontWeight:700, color:muted, textTransform:"uppercase",
            letterSpacing:"0.07em", display:"block", marginBottom:8 }}>Logo</label>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {form.logo ? (
              <>
                <img src={form.logo} alt="Logo" style={{ height:48, objectFit:"contain",
                  borderRadius:6, background:"#fff", padding:4, border:`1px solid ${border}` }} />
                <button onClick={() => setForm((f: any) => ({ ...f, logo: null }))} style={{
                  padding:"5px 10px", borderRadius:6, fontSize:11,
                  background:"transparent", color:muted, border:`1px solid ${border}`, cursor:"pointer" }}>
                  Quitar logo
                </button>
              </>
            ) : (
              <button onClick={() => logoRef.current?.click()} style={{
                padding:"7px 14px", borderRadius:6, fontSize:11, fontWeight:600,
                background:"transparent", border:`1px solid ${border}`, color:muted,
                cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                <Upload size={13} /> Subir logo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
