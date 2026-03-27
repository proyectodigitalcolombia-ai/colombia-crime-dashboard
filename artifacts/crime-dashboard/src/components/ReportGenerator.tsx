import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { jsPDF } from "jspdf";
import {
  useGetNationalMonthly,
  useGetCrimesByDepartment,
  useGetBlockades,
} from "@workspace/api-client-react";
import { Building2, Upload, Download, Palette, User, Mail, Phone, FileText, CheckCircle2, RefreshCw } from "lucide-react";
import safeNodeLogoUrl from "../assets/safenode-logo.png";
import { useAuth, type UserConfig } from "@/context/AuthContext";

const LS_KEY = "colombia_report_config_v2";

interface ReportConfig {
  companyName: string;
  companySubtitle: string;
  analystName: string;
  analystEmail: string;
  analystPhone: string;
  primaryColor: string;
  logoDataUrl: string;
  footerDisclaimer: string;
}

const DEFAULTS: ReportConfig = {
  companyName: "SafeNode S.A.S.",
  companySubtitle: "Inteligencia en Seguridad Logística y Transporte",
  analystName: "Analista de Seguridad",
  analystEmail: "seguridad@safenode.com.co",
  analystPhone: "+57 300 000 0000",
  primaryColor: "#00bcd4",
  logoDataUrl: "",
  footerDisclaimer: "Documento confidencial — uso exclusivo interno.",
};

function userToConfig(u: UserConfig): Partial<ReportConfig> {
  return {
    companyName:      u.companyName      || DEFAULTS.companyName,
    companySubtitle:  u.companySubtitle  || DEFAULTS.companySubtitle,
    analystName:      u.analystName      || DEFAULTS.analystName,
    analystEmail:     u.analystEmail     || DEFAULTS.analystEmail,
    analystPhone:     u.analystPhone     || DEFAULTS.analystPhone,
    primaryColor:     u.primaryColor     || DEFAULTS.primaryColor,
    footerDisclaimer: u.footerDisclaimer || DEFAULTS.footerDisclaimer,
  };
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function isLight(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

function darken(hex: string, amount = 40): [number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  return [Math.max(0, r - amount), Math.max(0, g - amount), Math.max(0, b - amount)];
}

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTHS_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

interface Props { dark?: boolean; user?: UserConfig | null }

export function ReportGenerator({ dark = true, user = null }: Props) {
  const { updateConfig: saveToServer } = useAuth();
  const [config, setConfig] = useState<ReportConfig>(DEFAULTS);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [year, setYear] = useState(2026);
  const [defaultLogo, setDefaultLogo] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const panelBg   = dark ? "#0c1220" : "#ffffff";
  const textMain  = dark ? "#e2eaf4" : "#1a2a3a";
  const textMuted = dark ? "rgba(255,255,255,0.45)" : "#64748b";
  const borderC   = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const inputBg   = dark ? "rgba(255,255,255,0.04)" : "#f8fafc";

  /* Load config: user (server) takes priority, then localStorage (logoDataUrl only locally) */
  useEffect(() => {
    setConfig(prev => {
      let base = { ...DEFAULTS, ...prev };
      /* Restore logo from localStorage since it's not stored in DB */
      try { const s = localStorage.getItem(LS_KEY); if (s) { const p = JSON.parse(s); if (p.logoDataUrl) base.logoDataUrl = p.logoDataUrl; } } catch { /* ignore */ }
      if (user) return { ...base, ...userToConfig(user) };
      return base;
    });
  }, [user]);

  /* Load default logo as data URL for jsPDF compatibility */
  useEffect(() => {
    fetch(safeNodeLogoUrl)
      .then(r => { if (!r.ok) throw new Error("logo not found"); return r.blob(); })
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => setDefaultLogo(reader.result as string);
        reader.readAsDataURL(blob);
      })
      .catch(() => { /* logo not available */ });
  }, []);

  /* For display: use imported URL directly (instant, no async needed) */
  /* For PDF: use data URL (jsPDF requires data URL or canvas element) */
  const activeLogoDisplay = config.logoDataUrl || defaultLogo || safeNodeLogoUrl;
  const activeLogoForPdf  = config.logoDataUrl || defaultLogo;
  const activeLogo = activeLogoDisplay;

  function updateConfig(patch: Partial<ReportConfig>) {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      /* Store logoDataUrl locally (too large for DB) */
      try { localStorage.setItem(LS_KEY, JSON.stringify({ logoDataUrl: next.logoDataUrl })); } catch { /* ignore */ }
      /* Sync non-logo fields to server if user is logged in */
      const { logoDataUrl: _logo, ...serverPatch } = patch;
      if (Object.keys(serverPatch).length > 0) {
        saveToServer(serverPatch).catch(() => { /* silent — local state is still updated */ });
      }
      return next;
    });
  }

  const { data: monthlyData = [] } = useGetNationalMonthly({ year });
  const { data: prevMonthlyData = [] } = useGetNationalMonthly({ year: year - 1 });
  const { data: deptData    = [] } = useGetCrimesByDepartment({ year });
  const { data: allBlockades = [] } = useGetBlockades();

  const totalCrimes = useMemo(() => monthlyData.reduce((s: number, d: any) => s + d.count, 0), [monthlyData]);
  const prevTotalCrimes = useMemo(() => prevMonthlyData.reduce((s: number, d: any) => s + d.count, 0), [prevMonthlyData]);
  const prevMonthlyTrend = useMemo(() => {
    const m: Record<number, number> = {};
    for (const d of prevMonthlyData) m[d.month] = (m[d.month] ?? 0) + d.count;
    return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: m[i + 1] ?? 0 }));
  }, [prevMonthlyData]);

  const topDepts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of deptData as any[]) m[d.department] = (m[d.department] ?? 0) + d.totalCount;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [deptData]);

  const crimeTypeSummary = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of monthlyData) m[d.crimeTypeName] = (m[d.crimeTypeName] ?? 0) + d.count;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [monthlyData]);

  const monthlyTrend = useMemo(() => {
    const m: Record<number, number> = {};
    for (const d of monthlyData) m[d.month] = (m[d.month] ?? 0) + d.count;
    return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: m[i + 1] ?? 0 }));
  }, [monthlyData]);

  const activeBlockades = useMemo(() => (Array.isArray(allBlockades) ? allBlockades : []).filter((b: any) => b.status === "activo"), [allBlockades]);

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateConfig({ logoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  const generatePDF = useCallback(async () => {
    if (totalCrimes === 0) return;
    setGenerating(true);
    setGenerated(false);

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210, H = 297, margin = 14;
      const pri = hexToRgb(config.primaryColor);
      const [dr, dg, db] = darken(config.primaryColor, 50);
      const onPri: [number, number, number] = isLight(config.primaryColor) ? [20, 20, 20] : [255, 255, 255];
      const today = new Date();
      const dateStr = today.toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });

      /* ─── Shared helpers ─── */
      function setColor(hex: string) { const c = hexToRgb(hex); doc.setTextColor(c.r, c.g, c.b); }
      function setFill(hex: string) { const c = hexToRgb(hex); doc.setFillColor(c.r, c.g, c.b); }
      function setDraw(hex: string) { const c = hexToRgb(hex); doc.setDrawColor(c.r, c.g, c.b); }

      function pageHeader(title: string, pageNum: number) {
        /* top bar */
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.rect(0, 0, W, 14, "F");
        doc.setTextColor(...onPri);
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.text(config.companyName.toUpperCase(), margin, 9);
        doc.setFont("helvetica", "normal");
        doc.text(`Informe Gerencial de Seguridad — ${year}`, W / 2, 9, { align: "center" });
        doc.text(`Pág. ${pageNum}`, W - margin, 9, { align: "right" });
        /* section title strip */
        doc.setFillColor(245, 247, 250);
        doc.rect(0, 14, W, 10, "F");
        doc.setFontSize(10); doc.setFont("helvetica", "bold");
        doc.setTextColor(pri.r, pri.g, pri.b);
        doc.text(title, margin, 21);
        doc.setTextColor(0, 0, 0);
      }

      function pageFooter() {
        doc.setFontSize(7); doc.setTextColor(160, 160, 160);
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
        doc.line(margin, H - 10, W - margin, H - 10);
        doc.text(config.footerDisclaimer, margin, H - 6);
        doc.text(`Generado: ${dateStr}  ·  ${config.analystName}`, W - margin, H - 6, { align: "right" });
      }

      function sectionHeading(text: string, y: number): number {
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.roundedRect(margin, y, 4, 5, 1, 1, "F");
        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        doc.setTextColor(pri.r, pri.g, pri.b);
        doc.text(text, margin + 7, y + 4);
        doc.setTextColor(0, 0, 0);
        return y + 10;
      }

      function drawTable(
        headers: string[],
        rows: string[][],
        colWidths: number[],
        startY: number,
        rowHeight = 7,
      ): number {
        const tableW = colWidths.reduce((s, w) => s + w, 0);
        let y = startY;
        /* header */
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.rect(margin, y, tableW, rowHeight + 2, "F");
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.setTextColor(...onPri);
        let x = margin;
        headers.forEach((h, i) => {
          doc.text(h, x + 2, y + rowHeight - 1);
          x += colWidths[i];
        });
        y += rowHeight + 2;
        /* rows */
        rows.forEach((row, ri) => {
          if (ri % 2 === 0) {
            doc.setFillColor(240, 246, 255);
            doc.rect(margin, y, tableW, rowHeight, "F");
          }
          doc.setFontSize(8); doc.setFont("helvetica", ri === 0 ? "bold" : "normal");
          doc.setTextColor(30, 30, 50);
          x = margin;
          row.forEach((cell, ci) => {
            const maxW = colWidths[ci] - 4;
            const lines = doc.splitTextToSize(cell, maxW);
            doc.text(lines[0], x + 2, y + rowHeight - 1);
            x += colWidths[ci];
          });
          /* row border */
          doc.setDrawColor(220, 228, 240); doc.setLineWidth(0.2);
          doc.line(margin, y + rowHeight, margin + tableW, y + rowHeight);
          y += rowHeight;
        });
        /* outer border */
        setDraw(config.primaryColor); doc.setLineWidth(0.5);
        doc.rect(margin, startY, tableW, y - startY, "S");
        return y + 4;
      }

      /* ══════════════════════════════════════
         PAGE 1 — COVER  (always dark navy — matches SafeNode brand)
         ══════════════════════════════════════ */
      const navyR = 13, navyG = 27, navyB = 49;
      doc.setFillColor(navyR, navyG, navyB);
      doc.rect(0, 0, W, H, "F");
      /* Cyan top accent stripe */
      doc.setFillColor(pri.r, pri.g, pri.b);
      doc.rect(0, 0, W, 6, "F");
      /* Cyan bottom accent strip */
      doc.setFillColor(pri.r, pri.g, pri.b);
      doc.setGState(new (doc as any).GState({ opacity: 0.85 }));
      doc.rect(0, H - 44, W, 44, "F");
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      /* Logo — centered at top, large, blends into navy background */
      const logoSrc = activeLogoForPdf;
      if (logoSrc) {
        try {
          const fmt = logoSrc.startsWith("data:image/png") ? "PNG" : "JPEG";
          const logoW = 52, logoH = 52;
          doc.addImage(logoSrc, fmt, (W - logoW) / 2, 18, logoW, logoH);
        } catch { /* skip corrupt logo */ }
      }

      /* Subtle decorative glow circles (cyan, low opacity) */
      doc.setFillColor(pri.r, pri.g, pri.b);
      doc.setGState(new (doc as any).GState({ opacity: 0.07 }));
      doc.circle(W + 10, 50, 80, "F");
      doc.circle(-10, H - 80, 60, "F");
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      /* ── Cover text — always WHITE on dark navy ── */
      /* System badge above title */
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
      doc.setTextColor(pri.r, pri.g, pri.b);
      doc.setGState(new (doc as any).GState({ opacity: 0.9 }));
      doc.text("SISTEMA INTEGRADO DE SEGURIDAD LOGÍSTICA", W / 2, 83, { align: "center" });
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      /* Main title */
      doc.setFontSize(32); doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("INFORME GERENCIAL", W / 2, 104, { align: "center" });
      doc.text("DE SEGURIDAD VIAL", W / 2, 119, { align: "center" });

      /* Cyan divider line */
      doc.setDrawColor(pri.r, pri.g, pri.b); doc.setLineWidth(0.8);
      doc.line(45, 127, W - 45, 127);

      /* Year chip */
      doc.setFontSize(20); doc.setFont("helvetica", "bold");
      doc.setTextColor(pri.r, pri.g, pri.b);
      doc.text(`Colombia · ${year}`, W / 2, 142, { align: "center" });

      /* Company name block */
      doc.setFontSize(15); doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(config.companyName, W / 2, 170, { align: "center" });
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      doc.setTextColor(pri.r, pri.g, pri.b);
      doc.setGState(new (doc as any).GState({ opacity: 0.9 }));
      doc.text(config.companySubtitle, W / 2, 179, { align: "center" });
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      /* Bottom cyan strip — date + analyst */
      doc.setTextColor(navyR, navyG, navyB);
      doc.setFontSize(10); doc.setFont("helvetica", "bold");
      doc.text(dateStr.toUpperCase(), W / 2, H - 32, { align: "center" });
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
      doc.text(`${config.analystName}  ·  ${config.analystEmail}  ·  ${config.analystPhone}`, W / 2, H - 23, { align: "center" });
      doc.setFontSize(7.5);
      doc.text("Fuente: Policía Nacional de Colombia / AICRI", W / 2, H - 15, { align: "center" });
      doc.setFontSize(6.5);
      doc.setGState(new (doc as any).GState({ opacity: 0.7 }));
      doc.text(config.footerDisclaimer, W / 2, H - 7, { align: "center" });
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      /* ══════════════════════════════════════
         PAGE 2 — RESUMEN EJECUTIVO + KPIs
         ══════════════════════════════════════ */
      doc.addPage();
      pageHeader("1. Resumen Ejecutivo", 2);
      pageFooter();

      let y = 30;
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
      doc.text("APRECIACIÓN DE SITUACIÓN DE SEGURIDAD", margin, y); y += 7;
      doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 80);
      const introParts = doc.splitTextToSize(
        `La presente Apreciación de Situación de Seguridad corresponde al análisis estadístico del comportamiento delictivo en Colombia durante el período ${year}, con base en los registros oficiales de la Policía Nacional de Colombia — Sistema AICRI (Análisis de Información Criminal). El análisis está orientado a brindar elementos de juicio para la toma de decisiones estratégicas en materia de seguridad logística y transporte terrestre de carga por parte de ${config.companyName}. Se han considerado las variables de incidencia delictiva por departamento, tipología del delito y tendencia mensual, correlacionadas con los principales corredores de movilidad de interés operacional. Fuente oficial: Policía Nacional de Colombia / INDEPAZ / FIP.`,
        W - margin * 2
      );
      doc.text(introParts, margin, y); y += introParts.length * 5 + 8;

      /* KPI boxes 2x2 */
      const kpis = [
        { label: "TOTAL DELITOS REGISTRADOS", value: totalCrimes.toLocaleString("es-CO"), sub: `Año ${year}`, icon: "▼" },
        { label: "DEPTO. MAYOR INCIDENCIA",    value: topDepts[0]?.[0] ?? "—",             sub: `${topDepts[0]?.[1]?.toLocaleString("es-CO") ?? "—"} casos`, icon: "📍" },
        { label: "DELITO MÁS FRECUENTE",       value: (crimeTypeSummary[0]?.[0] ?? "—").split(" ").slice(0, 3).join(" "), sub: `${crimeTypeSummary[0]?.[1]?.toLocaleString("es-CO") ?? "—"} casos`, icon: "!" },
        { label: "BLOQUEOS VIALES ACTIVOS",    value: String(activeBlockades.length),      sub: activeBlockades.length > 0 ? "⚠ Verificar corredores" : "Sin bloqueos activos", icon: "🛑" },
      ];

      const kpiW = (W - margin * 2 - 8) / 2;
      const kpiH = 26;
      kpis.forEach((kpi, i) => {
        const kx = margin + (i % 2) * (kpiW + 8);
        const ky = y + Math.floor(i / 2) * (kpiH + 6);
        /* box background */
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.roundedRect(kx, ky, kpiW, kpiH, 2, 2, "F");
        /* label */
        doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...onPri);
        doc.setGState(new (doc as any).GState({ opacity: 0.75 }));
        doc.text(kpi.label, kx + 5, ky + 6);
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        /* value */
        doc.setFontSize(16); doc.setFont("helvetica", "bold");
        const valParts = doc.splitTextToSize(kpi.value, kpiW - 10);
        doc.text(valParts[0], kx + 5, ky + 16);
        /* sub */
        doc.setFontSize(7); doc.setFont("helvetica", "normal");
        doc.setGState(new (doc as any).GState({ opacity: 0.8 }));
        doc.text(kpi.sub, kx + 5, ky + 22);
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
      });
      y += 2 * (kpiH + 6) + 10;

      /* Quick stats row */
      y = sectionHeading("Datos clave del período", y);
      const quickStats = [
        ["Departamentos con datos", `${topDepts.length} de 32`],
        ["Tipos de delito analizados", String(crimeTypeSummary.length)],
        ["Meses con registros", String(monthlyTrend.filter(m => m.count > 0).length)],
        ["Promedio mensual", Math.round(totalCrimes / Math.max(1, monthlyTrend.filter(m => m.count > 0).length)).toLocaleString("es-CO")],
      ];
      const sw = (W - margin * 2 - 12) / 4;
      quickStats.forEach(([lbl, val], i) => {
        const sx = margin + i * (sw + 4);
        doc.setFillColor(245, 248, 255);
        doc.setDrawColor(pri.r, pri.g, pri.b); doc.setLineWidth(0.3);
        doc.roundedRect(sx, y, sw, 16, 1.5, 1.5, "FD");
        doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(pri.r, pri.g, pri.b);
        doc.text(val, sx + sw / 2, y + 9, { align: "center" });
        doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 110, 130);
        doc.text(lbl.toUpperCase(), sx + sw / 2, y + 14, { align: "center" });
      });

      /* ══════════════════════════════════════
         PAGE 3 — RANKING DEPARTAMENTAL
         ══════════════════════════════════════ */
      doc.addPage();
      pageHeader("2. Ranking Departamental de Incidencia Delictiva", 3);
      pageFooter();
      y = 30;

      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 80);
      const deptIntro = doc.splitTextToSize(
        `A continuación se presenta el ranking departamental de incidencia delictiva para el período ${year}, ordenado de mayor a menor concentración de eventos registrados por la Policía Nacional. Esta información constituye un elemento esencial para la evaluación del riesgo compuesto en los principales corredores de movilidad del país y la priorización de esquemas de seguridad diferenciados por región de operación.`,
        W - margin * 2
      );
      doc.text(deptIntro, margin, y); y += deptIntro.length * 5 + 4;

      const maxDeptCount = topDepts[0]?.[1] ?? 1;
      const barAreaW = 55;
      const deptCols = [6, 54, 28, barAreaW, 20];
      y = drawTable(
        ["#", "DEPARTAMENTO", "TOTAL CASOS", "PROPORCIÓN", "% NAL."],
        topDepts.map(([dept, count], i) => [
          String(i + 1).padStart(2, "0"),
          dept,
          count.toLocaleString("es-CO"),
          "█".repeat(Math.round((count / maxDeptCount) * 15)),  /* fake bar */
          `${((count / totalCrimes) * 100).toFixed(1)}%`,
        ]),
        deptCols, y, 7
      );

      /* Mini horizontal bar chart */
      y = sectionHeading("Comparativo visual — Top 10 departamentos", y);
      const barMaxW = W - margin * 2 - 45;
      const barH = 5.5;
      topDepts.slice(0, 10).forEach(([dept, count], i) => {
        const bW = (count / maxDeptCount) * barMaxW;
        const by = y + i * (barH + 2);
        /* label */
        doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 70);
        doc.text(dept.length > 18 ? dept.slice(0, 17) + "…" : dept, margin, by + barH - 1);
        /* bar bg */
        doc.setFillColor(235, 240, 250);
        doc.roundedRect(margin + 44, by, barMaxW, barH, 1, 1, "F");
        /* bar fill */
        doc.setFillColor(pri.r, pri.g, pri.b);
        doc.roundedRect(margin + 44, by, Math.max(bW, 2), barH, 1, 1, "F");
        /* value */
        doc.setFontSize(6.5); doc.setTextColor(80, 80, 100);
        doc.text(count.toLocaleString("es-CO"), margin + 44 + barMaxW + 2, by + barH - 1);
      });

      /* ══════════════════════════════════════
         PAGE 4 — TIPOS DE DELITO + TENDENCIA
         ══════════════════════════════════════ */
      doc.addPage();
      pageHeader("3. Distribución por Tipo de Delito", 4);
      pageFooter();
      y = 30;

      const typeCols = [10, 90, 30, 32];
      y = drawTable(
        ["#", "TIPO DE DELITO", "TOTAL CASOS", "% DEL TOTAL"],
        crimeTypeSummary.map(([name, count], i) => [
          String(i + 1).padStart(2, "0"),
          name,
          count.toLocaleString("es-CO"),
          `${((count / totalCrimes) * 100).toFixed(1)}%`,
        ]),
        typeCols, y, 7
      );
      y += 4;

      /* Donut-style distribution visual — simple pie slices via text */
      y = sectionHeading("4. Tendencia Mensual de Delitos", y);
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 100);
      const trendIntro = doc.splitTextToSize(
        `Evolución mensual de la actividad delictiva durante ${year}. El análisis de la tendencia permite identificar períodos de mayor concentración de eventos y correlacionarlos con variables estacionales, campañas electorales o escaladas del conflicto armado interno que inciden en el ambiente operacional de seguridad logística.`,
        W - margin * 2
      );
      doc.text(trendIntro, margin, y); y += trendIntro.length * 4.5 + 3;

      /* Bar chart for monthly trend */
      const trendData = monthlyTrend.filter(m => m.count > 0);
      const maxTrend = Math.max(...trendData.map(m => m.count), 1);
      const chartW = W - margin * 2;
      const chartH2 = 40;
      const barW2 = chartW / 12 - 1;

      /* Chart bg */
      doc.setFillColor(247, 250, 255);
      doc.setDrawColor(220, 225, 240); doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, chartW, chartH2 + 12, 2, 2, "FD");

      monthlyTrend.forEach(({ month, count }, i) => {
        const barH2 = count > 0 ? (count / maxTrend) * chartH2 : 0;
        const bx = margin + i * (barW2 + 1) + 0.5;
        const by2 = y + chartH2 - barH2;
        /* bar */
        if (count > 0) {
          doc.setFillColor(pri.r, pri.g, pri.b);
          doc.setGState(new (doc as any).GState({ opacity: 0.85 }));
          doc.roundedRect(bx, by2, barW2, barH2, 0.8, 0.8, "F");
          doc.setGState(new (doc as any).GState({ opacity: 1 }));
          /* value on top */
          if (barH2 > 8) {
            doc.setFontSize(5); doc.setFont("helvetica", "bold"); doc.setTextColor(...onPri);
            doc.text(count > 999 ? `${(count / 1000).toFixed(1)}k` : String(count), bx + barW2 / 2, by2 + 5, { align: "center" });
          }
        }
        /* month label */
        doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 110, 130);
        doc.text(MONTHS_ES[month - 1], bx + barW2 / 2, y + chartH2 + 8, { align: "center" });
      });

      /* ══════════════════════════════════════
         PAGE 5 — COMPARATIVO INTERANUAL
         ══════════════════════════════════════ */
      doc.addPage();
      pageHeader(`5. Comparativo Interanual: ${year - 1} vs ${year}`, 5);
      pageFooter();
      y = 30;

      if (prevTotalCrimes > 0) {
        const pctChange = ((totalCrimes - prevTotalCrimes) / prevTotalCrimes) * 100;
        const increased = pctChange >= 0;

        /* Summary KPI boxes */
        const kpiW = (W - margin * 2 - 8) / 3;
        const kpis = [
          { label: String(year - 1), value: prevTotalCrimes.toLocaleString("es-CO"), sub: "delitos registrados" },
          { label: String(year), value: totalCrimes.toLocaleString("es-CO"), sub: "delitos registrados" },
          { label: "Variación", value: `${increased ? "+" : ""}${pctChange.toFixed(1)}%`, sub: increased ? "aumento interanual" : "reducción interanual" },
        ];
        kpis.forEach((k, i) => {
          const kx = margin + i * (kpiW + 4);
          const isVar = i === 2;
          doc.setFillColor(isVar ? (increased ? 220 : 16) : pri.r, isVar ? (increased ? 38 : 185) : pri.g, isVar ? (increased ? 38 : 129) : pri.b);
          doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
          doc.roundedRect(kx, y, kpiW, 22, 2, 2, "F");
          doc.setGState(new (doc as any).GState({ opacity: 1 }));
          doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 90, 110);
          doc.text(k.label.toUpperCase(), kx + kpiW / 2, y + 6, { align: "center" });
          doc.setFontSize(14); doc.setFont("helvetica", "bold");
          doc.setTextColor(isVar ? (increased ? 180 : 5) : pri.r, isVar ? (increased ? 20 : 120) : pri.g, isVar ? 20 : pri.b);
          doc.text(k.value, kx + kpiW / 2, y + 14, { align: "center" });
          doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 110, 130);
          doc.text(k.sub, kx + kpiW / 2, y + 20, { align: "center" });
        });
        y += 30;

        /* Dual bar chart per month */
        y = sectionHeading("Evolución mensual comparativa", y);
        const dualChartW = W - margin * 2;
        const dualChartH = 45;
        const maxVal = Math.max(...monthlyTrend.map(m => m.count), ...prevMonthlyTrend.map(m => m.count), 1);
        const slotW = dualChartW / 12;
        const barPairW = slotW * 0.72;

        /* Chart bg */
        doc.setFillColor(247, 250, 255);
        doc.setDrawColor(220, 225, 240); doc.setLineWidth(0.3);
        doc.roundedRect(margin, y, dualChartW, dualChartH + 14, 2, 2, "FD");

        for (let i = 0; i < 12; i++) {
          const prevCount = prevMonthlyTrend[i].count;
          const currCount = monthlyTrend[i].count;
          const slotX = margin + i * slotW;
          const halfW = barPairW / 2 - 0.5;

          /* prev year bar (grey) */
          if (prevCount > 0) {
            const bh = (prevCount / maxVal) * dualChartH;
            doc.setFillColor(180, 190, 210); doc.setGState(new (doc as any).GState({ opacity: 0.8 }));
            doc.roundedRect(slotX + (slotW - barPairW) / 2, y + dualChartH - bh, halfW, bh, 0.5, 0.5, "F");
            doc.setGState(new (doc as any).GState({ opacity: 1 }));
          }
          /* current year bar (primary) */
          if (currCount > 0) {
            const bh = (currCount / maxVal) * dualChartH;
            doc.setFillColor(pri.r, pri.g, pri.b); doc.setGState(new (doc as any).GState({ opacity: 0.9 }));
            doc.roundedRect(slotX + (slotW - barPairW) / 2 + halfW + 1, y + dualChartH - bh, halfW, bh, 0.5, 0.5, "F");
            doc.setGState(new (doc as any).GState({ opacity: 1 }));
          }
          /* month label */
          doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 110, 130);
          doc.text(MONTHS_ES[i], slotX + slotW / 2, y + dualChartH + 6, { align: "center" });
        }
        y += dualChartH + 20;

        /* Legend */
        doc.setFillColor(180, 190, 210); doc.rect(margin, y, 8, 4, "F");
        doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 90, 110);
        doc.text(String(year - 1), margin + 10, y + 3.5);
        doc.setFillColor(pri.r, pri.g, pri.b); doc.rect(margin + 30, y, 8, 4, "F");
        doc.text(String(year), margin + 40, y + 3.5);
        y += 12;

        /* Month-by-month detail table */
        y = sectionHeading("Detalle mensual", y);
        const compCols = [16, 28, 28, 28, 30, 32];
        y = drawTable(
          ["MES", `DELITOS ${year - 1}`, `DELITOS ${year}`, "DIFERENCIA", "VARIACIÓN", "TENDENCIA"],
          MONTHS_ES.map((mo, i) => {
            const p = prevMonthlyTrend[i].count;
            const c = monthlyTrend[i].count;
            const diff = c - p;
            const pct = p > 0 ? ((diff / p) * 100).toFixed(1) + "%" : "N/D";
            const trend = diff > 0 ? "▲ Alza" : diff < 0 ? "▼ Baja" : "— Estable";
            return [mo, p.toLocaleString("es-CO"), c.toLocaleString("es-CO"), (diff >= 0 ? "+" : "") + diff.toLocaleString("es-CO"), pct, trend];
          }),
          compCols, y, 6.5,
        );
        y += 6;

        /* Interpretation */
        const absDiff = Math.abs(totalCrimes - prevTotalCrimes);
        const interp = increased
          ? `El análisis comparativo del período ${year} frente a ${year - 1} evidencia un incremento de ${absDiff.toLocaleString("es-CO")} eventos delictivos, representando una variación positiva del ${Math.abs(pctChange).toFixed(1)}%. Este comportamiento deberá ser especialmente considerado en la revisión de los planes de contingencia y en la actualización de la matriz de riesgo en ruta. Se recomienda reforzar los esquemas de seguridad motorizados y el monitoreo en tiempo real en los corredores con mayor concentración de incidentes.`
          : `El análisis comparativo del período ${year} frente a ${year - 1} evidencia una reducción de ${absDiff.toLocaleString("es-CO")} eventos delictivos, representando una variación del -${Math.abs(pctChange).toFixed(1)}%. No obstante, la reducción en delitos de alto impacto social puede estar asociada al incremento de acciones de carácter terrorista por parte de grupos armados ilegales, aspecto que deberá ser especialmente considerado en las previsiones del ambiente operacional de seguridad logística.`;
        doc.setFontSize(8.5); doc.setFont("helvetica", "italic"); doc.setTextColor(60, 70, 90);
        const interpLines = doc.splitTextToSize(interp, W - margin * 2);
        doc.text(interpLines, margin, y);
      } else {
        doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(120, 130, 150);
        doc.text(`No hay datos disponibles para el año ${year - 1} para realizar la comparación.`, margin, y);
      }

      /* ══════════════════════════════════════
         PAGE 6 — BLOQUEOS + CONCLUSIONES
         ══════════════════════════════════════ */
      doc.addPage();
      pageHeader("6. Bloqueos Viales y Conclusiones", 6);
      pageFooter();
      y = 30;

      if (activeBlockades.length > 0) {
        /* Alert banner */
        doc.setFillColor(220, 38, 38); doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
        doc.roundedRect(margin, y, W - margin * 2, 10, 2, 2, "F");
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(180, 20, 20);
        doc.text(`⚠  ${activeBlockades.length} BLOQUEO(S) ACTIVO(S) — Verificar corredores antes de despachar carga`, margin + 4, y + 7);
        y += 14;

        const blkCols = [30, 50, 22, 30, 22];
        y = drawTable(
          ["DEPARTAMENTO", "UBICACIÓN", "FECHA", "CAUSA", "ESTADO"],
          activeBlockades.map((b: any) => [
            b.department,
            b.location,
            b.date ?? "—",
            (b.cause ?? "—").replace(/_/g, " "),
            "ACTIVO",
          ]),
          blkCols, y, 7
        );
        y += 4;
      } else {
        doc.setFillColor(16, 185, 129); doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
        doc.roundedRect(margin, y, W - margin * 2, 10, 2, 2, "F");
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(5, 120, 80);
        doc.text("✓  Sin bloqueos viales activos al momento de este informe", margin + 4, y + 7);
        y += 16;
      }

      /* Conclusiones */
      y = sectionHeading("Conclusiones y Recomendaciones", y);
      const peakMo = monthlyTrend.reduce((a, b) => a.count >= b.count ? a : b, monthlyTrend[0]);
      const conclusions = [
        `Situación general: El período ${year} registra un total de ${totalCrimes.toLocaleString("es-CO")} eventos delictivos en Colombia, con datos disponibles para ${topDepts.length} departamentos. El análisis determina que la mayor concentración de incidencia se mantiene en los principales centros urbanos y corredores de conectividad logística interregional.`,
        `Departamento de mayor incidencia: ${topDepts[0]?.[0] ?? "—"} concentra ${topDepts[0]?.[1]?.toLocaleString("es-CO") ?? "—"} casos, representando el ${topDepts[0] ? ((topDepts[0][1] / totalCrimes) * 100).toFixed(1) : 0}% del total nacional. Los planes de seguridad con operaciones en este departamento deberán considerar un nivel de riesgo compuesto elevado y contar con esquemas de escolta o monitoreo reforzado.`,
        `Delito de mayor impacto logístico: "${crimeTypeSummary[0]?.[0] ?? "—"}" es el tipo delictivo predominante con ${crimeTypeSummary[0]?.[1]?.toLocaleString("es-CO") ?? "—"} casos. Se recomienda actualizar los procedimientos operativos de seguridad en instalaciones, vehículos y zonas de cargue/descargue conforme a esta tipología.`,
        peakMo?.count > 0 ? `Período de mayor concentración: El mes de ${MONTHS_FULL[peakMo.month - 1]} registró el pico más alto del período con ${peakMo.count.toLocaleString("es-CO")} eventos. Este comportamiento estacional deberá ser considerado en la planificación de recursos de seguridad para períodos equivalentes en el siguiente año.` : null,
        activeBlockades.length > 0
          ? `ALERTA OPERACIONAL: Se registran ${activeBlockades.length} bloqueo(s) vial(es) activo(s) al momento de la generación del presente informe. Es imperativo validar rutas alternativas y coordinar con la central de monitoreo antes de programar cualquier despacho en los corredores afectados.`
          : "Estado de corredores: No se registran bloqueos viales activos al momento de este informe. Las condiciones de circulación en los corredores monitoreados son normales. Se mantiene la recomendación de monitoreo permanente ante la posibilidad de paros armados por parte de grupos armados ilegales.",
        "Recomendación estratégica: Se recomienda la revisión semanal del presente informe, la actualización permanente de la matriz de riesgo en ruta, y la implementación de un esquema de monitoreo 24/7 en la Central de Tráfico, con ajuste de los planes de despacho según la evolución del ambiente operacional de seguridad en los corredores de interés.",
      ].filter(Boolean) as string[];

      conclusions.forEach((c, i) => {
        const isAlert = c.startsWith("ALERTA");
        doc.setFillColor(isAlert ? 255 : pri.r, isAlert ? 220 : pri.g, isAlert ? 220 : pri.b);
        doc.circle(margin + 1.5, y + 2, 1.5, "F");
        doc.setFontSize(8.5); doc.setFont("helvetica", isAlert ? "bold" : "normal");
        doc.setTextColor(isAlert ? 150 : 30, isAlert ? 20 : 30, isAlert ? 20 : 50);
        const lines = doc.splitTextToSize(c, W - margin * 2 - 8);
        doc.text(lines, margin + 5, y + 3);
        y += lines.length * 5 + 3;
      });

      /* Signature block */
      y += 8;
      doc.setDrawColor(220, 220, 230); doc.setLineWidth(0.4);
      doc.line(margin, y, margin + 60, y);
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(40, 40, 60);
      doc.text(config.analystName, margin, y + 5);
      doc.setFont("helvetica", "normal"); doc.setTextColor(100, 110, 130); doc.setFontSize(7.5);
      doc.text(config.analystEmail, margin, y + 10);
      doc.text(config.analystPhone, margin, y + 15);
      doc.text(dateStr, margin, y + 20);

      /* Save */
      const filename = `informe_seguridad_${config.companyName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}_${year}.pdf`;
      doc.save(filename);
      setGenerated(true);
      setTimeout(() => setGenerated(false), 4000);
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setGenerating(false);
    }
  }, [config, year, totalCrimes, prevTotalCrimes, topDepts, crimeTypeSummary, monthlyTrend, prevMonthlyTrend, activeBlockades]);

  /* ── UI styles ── */
  const S = {
    section: { background: panelBg, border: `1px solid ${borderC}`, borderRadius: "12px", padding: "18px 20px" } as React.CSSProperties,
    label: { fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: textMuted, marginBottom: "5px", display: "block" },
    input: { width: "100%", background: inputBg, border: `1px solid ${borderC}`, borderRadius: "6px", padding: "8px 11px", fontSize: "13px", color: textMain, outline: "none", boxSizing: "border-box" as const } as React.CSSProperties,
    field: { display: "flex", flexDirection: "column" as const, gap: "4px", flex: 1 },
    row: { display: "flex", gap: "12px" } as React.CSSProperties,
    sectionTitle: { fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: textMuted, marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" } as React.CSSProperties,
  };

  const PRESETS = ["#00bcd4","#0d1b31","#006b87","#0066cc","#00897b","#5e35b1","#e53935","#f57c00","#2e7d32","#37474f"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── Header ── */}
      <div style={{ background: dark?"linear-gradient(135deg,#0c1628,#0e1f38)":"linear-gradient(135deg,#e8f4ff,#dbeafe)", border:`1px solid ${dark?"rgba(99,102,241,0.2)":"rgba(99,102,241,0.15)"}`, borderRadius:"12px", padding:"14px 18px", display:"flex", alignItems:"center", gap:"12px" }}>
        <div style={{ width:36, height:36, borderRadius:"10px", background:"rgba(99,102,241,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <FileText style={{ width:18, height:18, color:"#6366f1" }} />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:"13px", fontWeight:700, color:textMain }}>Informe Gerencial PDF — Personalizable por Cliente</div>
          <div style={{ fontSize:"11px", color:textMuted, marginTop:"2px" }}>Configure el branding de su empresa · El PDF se genera localmente y se descarga listo para enviar</div>
        </div>
        <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
          <label style={{ fontSize:"10px", color:textMuted, fontWeight:600 }}>AÑO</label>
          <select value={year} onChange={e => setYear(+e.target.value)} style={{ ...S.input, width:"90px", padding:"5px 8px", fontSize:"12px", cursor:"pointer" }}>
            {[2026,2025,2024,2023,2022,2021,2020].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>

        {/* LEFT: Company data */}
        <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
          <div style={S.section}>
            <div style={S.sectionTitle}><Building2 size={12} /> Datos de la Empresa</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              <div style={S.field}>
                <label style={S.label}>Nombre de la empresa</label>
                <input style={S.input} value={config.companyName} onChange={e => updateConfig({ companyName: e.target.value })} placeholder="Transportes del Norte S.A.S." />
              </div>
              <div style={S.field}>
                <label style={S.label}>Subtítulo / Sector</label>
                <input style={S.input} value={config.companySubtitle} onChange={e => updateConfig({ companySubtitle: e.target.value })} placeholder="Logística y Transporte de Carga" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Pie de página / Confidencialidad</label>
                <textarea rows={2} style={{ ...S.input, resize:"none" }} value={config.footerDisclaimer} onChange={e => updateConfig({ footerDisclaimer: e.target.value })} />
              </div>
            </div>
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}><User size={12} /> Analista / Firmante</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              <div style={S.field}>
                <label style={S.label}>Nombre completo</label>
                <input style={S.input} value={config.analystName} onChange={e => updateConfig({ analystName: e.target.value })} placeholder="Ing. Ana Martínez" />
              </div>
              <div style={S.row}>
                <div style={S.field}>
                  <label style={S.label}><Mail size={9} style={{ display:"inline", marginRight:"3px" }} />Email</label>
                  <input style={S.input} value={config.analystEmail} onChange={e => updateConfig({ analystEmail: e.target.value })} placeholder="analista@empresa.com" />
                </div>
                <div style={S.field}>
                  <label style={S.label}><Phone size={9} style={{ display:"inline", marginRight:"3px" }} />Teléfono</label>
                  <input style={S.input} value={config.analystPhone} onChange={e => updateConfig({ analystPhone: e.target.value })} placeholder="+57 310 000 0000" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Logo + color */}
        <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
          <div style={S.section}>
            <div style={S.sectionTitle}><Upload size={12} /> Logo de la Empresa</div>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{ border:`2px dashed ${dark?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.12)"}`, borderRadius:"10px", padding:"22px", textAlign:"center", cursor:"pointer", background:dark?"rgba(255,255,255,0.02)":"#f8fafc" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = config.primaryColor)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = dark?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.12)")}
            >
              {activeLogo ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"8px" }}>
                  <img src={activeLogo} alt="Logo" style={{ maxHeight:"72px", maxWidth:"180px", objectFit:"contain", borderRadius:"6px" }} />
                  <span style={{ fontSize:"11px", color:textMuted }}>
                    {config.logoDataUrl ? "Logo personalizado · clic para cambiar" : "Logo SafeNode (por defecto) · clic para reemplazar"}
                  </span>
                </div>
              ) : (
                <>
                  <Upload style={{ width:26, height:26, color:textMuted, margin:"0 auto 8px" }} />
                  <div style={{ fontSize:"12px", fontWeight:600, color:textMain }}>Subir logo de empresa</div>
                  <div style={{ fontSize:"11px", color:textMuted, marginTop:"4px" }}>PNG o JPG — aparece en la portada del PDF</div>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" style={{ display:"none" }} onChange={handleLogoUpload} />
            {config.logoDataUrl && (
              <button onClick={() => updateConfig({ logoDataUrl:"" })} style={{ marginTop:"6px", fontSize:"10px", color:"#ef4444", background:"transparent", border:"none", cursor:"pointer" }}>✕ Restaurar logo SafeNode</button>
            )}
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}><Palette size={12} /> Color Corporativo</div>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <div style={{ display:"flex", gap:"7px", flexWrap:"wrap" }}>
                {PRESETS.map(c => (
                  <button key={c} onClick={() => updateConfig({ primaryColor:c })} title={c}
                    style={{ width:30, height:30, borderRadius:"7px", background:c, cursor:"pointer", border:config.primaryColor===c?"3px solid white":"2px solid transparent", boxSizing:"border-box", boxShadow:config.primaryColor===c?`0 0 0 2px ${c}`:"none", transition:"all 0.15s" }} />
                ))}
              </div>
              <div style={S.field}>
                <label style={S.label}>Color personalizado (hex)</label>
                <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                  <input type="color" value={config.primaryColor} onChange={e => updateConfig({ primaryColor:e.target.value })}
                    style={{ width:38, height:34, borderRadius:"6px", border:`1px solid ${borderC}`, cursor:"pointer", padding:"2px", background:"none" }} />
                  <input style={{ ...S.input, flex:1 }} value={config.primaryColor} onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) updateConfig({ primaryColor:e.target.value }); }} />
                  <div style={{ width:56, height:34, borderRadius:"6px", background:config.primaryColor, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontSize:"8px", fontWeight:700, color:isLight(config.primaryColor)?"#000":"#fff" }}>MUESTRA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview summary */}
      <div style={{ background:dark?"rgba(99,102,241,0.06)":"rgba(99,102,241,0.04)", border:`1px solid ${dark?"rgba(99,102,241,0.2)":"rgba(99,102,241,0.12)"}`, borderRadius:"12px", padding:"14px 18px" }}>
        <div style={{ fontSize:"11px", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#6366f1", marginBottom:"10px" }}>
          Contenido del PDF · {year} · {totalCrimes.toLocaleString("es-CO")} delitos · 5 páginas
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"8px" }}>
          {[
            ["Portada","Logo + branding corporativo"],
            ["Resumen Ejecutivo","4 KPIs + estadísticas clave"],
            ["Ranking Deptal.","Top 12 depts. con gráfico"],
            ["Tipos + Tendencia","Tabla + gráfico de barras"],
            ["Bloqueos + Conclusiones","Alertas + recomendaciones"],
          ].map(([title,detail]) => (
            <div key={title} style={{ background:dark?"rgba(255,255,255,0.025)":"#fff", border:`1px solid ${dark?"rgba(99,102,241,0.1)":"rgba(99,102,241,0.08)"}`, borderRadius:"7px", padding:"9px 11px" }}>
              <div style={{ fontSize:"10px", fontWeight:700, color:"#6366f1", marginBottom:"3px" }}>{title}</div>
              <div style={{ fontSize:"10px", color:textMuted }}>{detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={generatePDF}
        disabled={generating || totalCrimes === 0}
        style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"10px", padding:"15px 28px", borderRadius:"10px", cursor:generating?"wait":"pointer", fontSize:"14px", fontWeight:700, letterSpacing:"0.04em", background:generated?"#10b981":config.primaryColor, color:generated?"#fff":(isLight(config.primaryColor)?"#000":"#fff"), border:"none", boxShadow:`0 4px 22px ${config.primaryColor}55`, opacity:(generating||totalCrimes===0)?0.6:1, transition:"all 0.2s" }}
      >
        {generated
          ? <><CheckCircle2 size={18} /> PDF descargado exitosamente</>
          : generating
          ? <><RefreshCw size={18} className="animate-spin" /> Generando PDF…</>
          : <><Download size={18} /> Generar Informe Gerencial PDF</>
        }
      </button>
      {totalCrimes === 0 && <div style={{ textAlign:"center", fontSize:"12px", color:textMuted, marginTop:"-8px" }}>Cargando datos del año {year}…</div>}
    </div>
  );
}
