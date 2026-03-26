import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ImageRun,
  PageBreak, Header, Footer, PageNumber, NumberFormat,
  TableOfContents, ShadingType,
} from "docx";
import { saveAs } from "file-saver";
import {
  useGetNationalMonthly,
  useGetCrimesByDepartment,
  useGetCrimeTypes,
  useGetBlockades,
} from "@workspace/api-client-react";
import { Building2, Upload, Download, Palette, User, Mail, Phone, FileText, CheckCircle2, RefreshCw } from "lucide-react";

const LS_KEY = "colombia_report_config";

interface ReportConfig {
  companyName: string;
  companySubtitle: string;
  analystName: string;
  analystEmail: string;
  analystPhone: string;
  primaryColor: string;
  logoDataUrl: string;
  logoMimeType: string;
  footerDisclaimer: string;
}

const DEFAULTS: ReportConfig = {
  companyName: "Mi Empresa S.A.S.",
  companySubtitle: "Gestión Logística y Transporte",
  analystName: "Analista de Seguridad",
  analystEmail: "seguridad@miempresa.com",
  analystPhone: "+57 300 000 0000",
  primaryColor: "#0066cc",
  logoDataUrl: "",
  logoMimeType: "image/png",
  footerDisclaimer: "Documento confidencial. Uso exclusivo interno. Prohibida su reproducción sin autorización.",
};

function hexToDocxColor(hex: string): string {
  return hex.replace("#", "").toUpperCase();
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function colorIsLight(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

interface Props { dark?: boolean }

export function ReportGenerator({ dark = true }: Props) {
  const [config, setConfig] = useState<ReportConfig>(DEFAULTS);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [year, setYear] = useState(2026);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const panelBg   = dark ? "#0c1220" : "#ffffff";
  const textMain  = dark ? "#e2eaf4" : "#1a2a3a";
  const textMuted = dark ? "rgba(255,255,255,0.45)" : "#64748b";
  const borderC   = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const inputBg   = dark ? "rgba(255,255,255,0.04)" : "#f8fafc";

  /* Load saved config */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setConfig(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  function updateConfig(patch: Partial<ReportConfig>) {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return next;
    });
  }

  /* Data */
  const { data: monthlyData = [] } = useGetNationalMonthly({ year });
  const { data: deptData = [] }    = useGetCrimesByDepartment({ year });
  const { data: crimeTypes = [] }  = useGetCrimeTypes();
  const { data: allBlockades = [] } = useGetBlockades();

  const totalCrimes = useMemo(() => monthlyData.reduce((s, d) => s + d.count, 0), [monthlyData]);

  const topDepts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of deptData as any[]) map[d.department] = (map[d.department] ?? 0) + d.totalCount;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [deptData]);

  const crimeTypeSummary = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of monthlyData) map[d.crimeTypeName] = (map[d.crimeTypeName] ?? 0) + d.count;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [monthlyData]);

  const monthlyTrend = useMemo(() => {
    const map: Record<number, number> = {};
    for (const d of monthlyData) map[d.month] = (map[d.month] ?? 0) + d.count;
    return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: map[i + 1] ?? 0 }));
  }, [monthlyData]);

  const activeBlockades = useMemo(() =>
    (allBlockades as any[]).filter(b => b.status === "activo"),
    [allBlockades]
  );

  /* Logo upload */
  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      updateConfig({ logoDataUrl: result, logoMimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  /* Word generation */
  const generateWord = useCallback(async () => {
    if (totalCrimes === 0) return;
    setGenerating(true);
    setGenerated(false);
    try {
      const primaryHex = hexToDocxColor(config.primaryColor);
      const onPrimary  = colorIsLight(config.primaryColor) ? "000000" : "FFFFFF";
      const today      = new Date();
      const dateStr    = today.toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
      const yearStr    = String(year);

      /* ── Helper styles ── */
      const heading1 = (text: string) => new Paragraph({
        text,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        border: { bottom: { color: primaryHex, size: 10, space: 1, style: BorderStyle.SINGLE } },
        run: { color: primaryHex, bold: true, size: 28 },
      });

      const heading2 = (text: string) => new Paragraph({
        text, heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        run: { color: primaryHex, bold: true, size: 24 },
      });

      const bodyText = (text: string, opts?: { bold?: boolean; color?: string; size?: number }) =>
        new Paragraph({
          children: [new TextRun({ text, bold: opts?.bold, color: opts?.color, size: opts?.size ?? 22 })],
          spacing: { after: 120 },
        });

      const spacer = (lines = 1) => new Paragraph({
        children: [new TextRun({ text: "" })],
        spacing: { after: 200 * lines },
      });

      /* ── Table helpers ── */
      function headerCell(text: string) {
        return new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text, bold: true, color: onPrimary, size: 18 })],
            alignment: AlignmentType.CENTER,
          })],
          shading: { fill: primaryHex, type: ShadingType.SOLID, color: primaryHex },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
        });
      }

      function dataCell(text: string, align: AlignmentType = AlignmentType.LEFT, bold = false) {
        return new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text, bold, size: 18 })],
            alignment: align,
          })],
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
        });
      }

      function altRow(idx: number) {
        return idx % 2 === 0 ? "EFF6FF" : "FFFFFF";
      }

      function tableRow(cells: TableCell[], idx: number) {
        return new TableRow({
          children: cells.map(c => {
            (c as any).options.shading = { fill: altRow(idx), type: ShadingType.SOLID, color: altRow(idx) };
            return c;
          }),
        });
      }

      /* ── Logo image ── */
      let logoImageRun: ImageRun | null = null;
      if (config.logoDataUrl) {
        try {
          const base64 = config.logoDataUrl.split(",")[1];
          const binary  = atob(base64);
          const bytes   = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const mimeType = config.logoMimeType.includes("png") ? "png" : "jpg";
          logoImageRun = new ImageRun({
            data: bytes,
            transformation: { width: 120, height: 60 },
            type: mimeType,
          });
        } catch { /* skip logo if corrupt */ }
      }

      /* ── Document sections ── */
      const coverChildren: (Paragraph | Table)[] = [
        /* Cover top spacer */
        spacer(4),
        /* Logo */
        ...(logoImageRun ? [
          new Paragraph({
            children: [logoImageRun],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),
        ] : []),
        /* Company name */
        new Paragraph({
          children: [new TextRun({ text: config.companyName, bold: true, size: 48, color: primaryHex })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 150 },
        }),
        new Paragraph({
          children: [new TextRun({ text: config.companySubtitle, size: 24, color: "555555" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
        }),
        /* Report title */
        new Paragraph({
          children: [new TextRun({ text: "INFORME GERENCIAL DE SEGURIDAD VIAL", bold: true, size: 40, color: onPrimary })],
          alignment: AlignmentType.CENTER,
          shading: { fill: primaryHex, type: ShadingType.SOLID, color: primaryHex },
          spacing: { before: 200, after: 0 },
          border: { bottom: { color: primaryHex, size: 1, style: BorderStyle.NONE } },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Estadísticas Delictivas Colombia — Año ${yearStr}`, size: 26, color: onPrimary })],
          alignment: AlignmentType.CENTER,
          shading: { fill: primaryHex, type: ShadingType.SOLID, color: primaryHex },
          spacing: { after: 400 },
        }),
        spacer(2),
        /* Metadata */
        new Paragraph({
          children: [new TextRun({ text: `Fecha de generación: ${dateStr}`, size: 22, color: "444444" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Elaborado por: ${config.analystName}`, size: 22, color: "444444" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Fuente: Policía Nacional de Colombia / AICRI ${yearStr}`, size: 20, color: "888888" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
        spacer(6),
        new Paragraph({
          children: [new TextRun({ text: config.footerDisclaimer, size: 16, italics: true, color: "AAAAAA" })],
          alignment: AlignmentType.CENTER,
        }),
        /* Page break before content */
        new Paragraph({ children: [new PageBreak()] }),
      ];

      /* ── Section 1: Resumen Ejecutivo ── */
      const kpiRows = [
        ["Total delitos registrados", totalCrimes.toLocaleString("es-CO"), `Año ${yearStr}`],
        ["Departamento con mayor incidencia", topDepts[0]?.[0] ?? "—", topDepts[0]?.[1]?.toLocaleString("es-CO") + " casos" ?? ""],
        ["Tipo de delito más frecuente", crimeTypeSummary[0]?.[0] ?? "—", crimeTypeSummary[0]?.[1]?.toLocaleString("es-CO") + " casos" ?? ""],
        ["Bloqueos viales activos", String(activeBlockades.length), activeBlockades.length > 0 ? "⚠ Verificar corredores afectados" : "Sin bloqueos activos"],
        ["Departamentos con datos", String(topDepts.length), "De 32 departamentos"],
      ];

      const kpiTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [headerCell("INDICADOR"), headerCell("VALOR"), headerCell("NOTA")],
            tableHeader: true,
          }),
          ...kpiRows.map(([ind, val, note], i) =>
            new TableRow({
              children: [
                dataCell(ind, AlignmentType.LEFT, true),
                dataCell(val, AlignmentType.CENTER, true),
                dataCell(note, AlignmentType.LEFT),
              ],
              cantSplit: true,
            })
          ),
        ],
      });

      /* ── Section 2: Top 10 Departamentos ── */
      const deptTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [headerCell("#"), headerCell("DEPARTAMENTO"), headerCell("TOTAL CASOS"), headerCell("% DEL TOTAL")],
            tableHeader: true,
          }),
          ...topDepts.map(([dept, count], i) =>
            tableRow([
              dataCell(String(i + 1).padStart(2, "0"), AlignmentType.CENTER, true),
              dataCell(dept),
              dataCell(count.toLocaleString("es-CO"), AlignmentType.RIGHT, true),
              dataCell(`${((count / totalCrimes) * 100).toFixed(1)}%`, AlignmentType.RIGHT),
            ], i)
          ),
        ],
      });

      /* ── Section 3: Tipos de Delito ── */
      const typeTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [headerCell("#"), headerCell("TIPO DE DELITO"), headerCell("TOTAL CASOS"), headerCell("% DEL TOTAL")],
            tableHeader: true,
          }),
          ...crimeTypeSummary.map(([name, count], i) =>
            tableRow([
              dataCell(String(i + 1).padStart(2, "0"), AlignmentType.CENTER),
              dataCell(name),
              dataCell(count.toLocaleString("es-CO"), AlignmentType.RIGHT, true),
              dataCell(`${((count / totalCrimes) * 100).toFixed(1)}%`, AlignmentType.RIGHT),
            ], i)
          ),
        ],
      });

      /* ── Section 4: Tendencia mensual ── */
      const trendData = monthlyTrend.filter(m => m.count > 0);
      const peakMonth = trendData.reduce((a, b) => a.count >= b.count ? a : b, trendData[0] ?? { month: 1, count: 0 });
      const lowMonth  = trendData.reduce((a, b) => a.count <= b.count ? a : b, trendData[0] ?? { month: 1, count: 0 });

      const trendTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [headerCell("MES"), headerCell("TOTAL CASOS"), headerCell("TENDENCIA")],
            tableHeader: true,
          }),
          ...trendData.map(({ month, count }, i) => {
            const prev = trendData[i - 1]?.count ?? count;
            const trend = count > prev ? "▲ Aumento" : count < prev ? "▼ Descenso" : "→ Estable";
            const trendColor = count > prev ? "CC0000" : count < prev ? "006600" : "666666";
            return new TableRow({
              children: [
                dataCell(MONTHS_ES[month - 1], AlignmentType.LEFT),
                dataCell(count.toLocaleString("es-CO"), AlignmentType.RIGHT, true),
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: trend, color: trendColor, bold: true, size: 18 })],
                    alignment: AlignmentType.CENTER,
                  })],
                  margins: { top: 60, bottom: 60, left: 120, right: 120 },
                  shading: { fill: altRow(i), type: ShadingType.SOLID, color: altRow(i) },
                }),
              ],
            });
          }),
        ],
      });

      /* ── Section 5: Bloqueos activos ── */
      const blockadeContent: (Paragraph | Table)[] = [];
      if (activeBlockades.length > 0) {
        blockadeContent.push(heading2("5. Bloqueos Viales Activos"));
        blockadeContent.push(bodyText(`Se registran ${activeBlockades.length} bloqueo(s) activo(s) en los corredores de carga. Verificar situación antes de despachar carga.`, { bold: true, color: "CC0000" }));
        const blkTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [headerCell("DEPARTAMENTO"), headerCell("UBICACIÓN"), headerCell("FECHA"), headerCell("CAUSA"), headerCell("ESTADO")],
              tableHeader: true,
            }),
            ...activeBlockades.map((b: any, i: number) =>
              tableRow([
                dataCell(b.department),
                dataCell(b.location),
                dataCell(b.date),
                dataCell(b.cause?.replace("_", " ") ?? "—"),
                dataCell("ACTIVO", AlignmentType.CENTER, true),
              ], i)
            ),
          ],
        });
        blockadeContent.push(blkTable, spacer());
      }

      /* ── Section 6: Conclusiones ── */
      const conclusions = [
        `El análisis del período ${yearStr} registra un total de ${totalCrimes.toLocaleString("es-CO")} delitos en el territorio nacional.`,
        `${topDepts[0]?.[0] ?? "—"} concentra el mayor volumen delictivo con ${topDepts[0]?.[1]?.toLocaleString("es-CO") ?? "—"} casos, representando el ${topDepts[0] ? ((topDepts[0][1] / totalCrimes) * 100).toFixed(1) : 0}% del total nacional.`,
        `${crimeTypeSummary[0]?.[0] ?? "—"} es el delito de mayor frecuencia, lo que sugiere reforzar protocolos de seguridad física en instalaciones y vías de acceso.`,
        peakMonth.count > 0 ? `El mes de mayor incidencia fue ${MONTHS_ES[peakMonth.month - 1]} con ${peakMonth.count.toLocaleString("es-CO")} casos registrados.` : "",
        peakMonth.count > 0 && lowMonth.count > 0 ? `El mes con menor incidencia fue ${MONTHS_ES[lowMonth.month - 1]} con ${lowMonth.count.toLocaleString("es-CO")} casos.` : "",
        activeBlockades.length > 0 ? `⚠ ALERTA: Existen ${activeBlockades.length} bloqueo(s) vial(es) activo(s). Se recomienda verificar alternativas de ruta antes de programar despachos.` : "No se registran bloqueos viales activos al momento de este informe.",
      ].filter(Boolean);

      /* ── Document assembly ── */
      const doc = new Document({
        title: `Informe Gerencial de Seguridad — ${config.companyName} — ${yearStr}`,
        description: `Estadísticas delictivas Colombia ${yearStr}`,
        creator: config.analystName,
        company: config.companyName,
        styles: {
          default: {
            document: { run: { font: "Calibri", size: 22, color: "1a1a2e" } },
          },
        },
        sections: [
          {
            headers: {
              default: new Header({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: config.companyName, bold: true, size: 16, color: primaryHex }),
                      new TextRun({ text: `  ·  Informe Gerencial de Seguridad ${yearStr}`, size: 16, color: "888888" }),
                    ],
                    border: { bottom: { color: primaryHex, size: 6, style: BorderStyle.SINGLE } },
                    spacing: { after: 100 },
                  }),
                ],
              }),
            },
            footers: {
              default: new Footer({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: config.footerDisclaimer + "  |  Pág. ", size: 16, color: "AAAAAA" }),
                      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "AAAAAA" }),
                      new TextRun({ text: " de ", size: 16, color: "AAAAAA" }),
                      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "AAAAAA" }),
                    ],
                    alignment: AlignmentType.RIGHT,
                    border: { top: { color: "DDDDDD", size: 4, style: BorderStyle.SINGLE } },
                  }),
                ],
              }),
            },
            children: [
              /* Cover */
              ...coverChildren,
              /* Section 1 */
              heading1("1. Resumen Ejecutivo"),
              bodyText(`Este informe presenta el análisis de las estadísticas delictivas de Colombia correspondiente al año ${yearStr}, con base en datos de la Policía Nacional de Colombia procesados por el sistema AICRI. La información permite a ${config.companyName} tomar decisiones estratégicas en materia de seguridad logística y gestión de riesgo en corredores de carga.`),
              spacer(),
              kpiTable,
              spacer(),
              new Paragraph({ children: [new PageBreak()] }),
              /* Section 2 */
              heading1("2. Ranking Departamental de Incidencia Delictiva"),
              bodyText("La siguiente tabla presenta los departamentos con mayor número de delitos registrados, ordenados de mayor a menor incidencia."),
              spacer(),
              deptTable,
              spacer(),
              new Paragraph({ children: [new PageBreak()] }),
              /* Section 3 */
              heading1("3. Distribución por Tipo de Delito"),
              bodyText("Análisis de los tipos de delitos con mayor frecuencia de ocurrencia en el período analizado."),
              spacer(),
              typeTable,
              spacer(),
              new Paragraph({ children: [new PageBreak()] }),
              /* Section 4 */
              heading1("4. Tendencia Mensual"),
              bodyText(`Evolución mensual del total de delitos registrados durante el año ${yearStr}. Permite identificar períodos de mayor y menor incidencia para planificar operaciones logísticas.`),
              spacer(),
              trendTable,
              spacer(),
              new Paragraph({ children: [new PageBreak()] }),
              /* Section 5 (blockades, conditional) */
              ...blockadeContent,
              /* Section 6 */
              heading1(`${activeBlockades.length > 0 ? "6" : "5"}. Conclusiones y Recomendaciones`),
              ...conclusions.map(c => new Paragraph({
                children: [
                  new TextRun({ text: "• ", color: primaryHex, bold: true }),
                  new TextRun({ text: c, size: 22 }),
                ],
                spacing: { after: 150 },
              })),
              spacer(2),
              /* Signature */
              new Paragraph({
                children: [new TextRun({ text: `Preparado por: ${config.analystName}`, bold: true, size: 22 })],
                spacing: { after: 80 },
              }),
              ...(config.analystEmail ? [bodyText(`Email: ${config.analystEmail}`)] : []),
              ...(config.analystPhone ? [bodyText(`Tel: ${config.analystPhone}`)] : []),
              bodyText(`Fecha: ${dateStr}`),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `informe_seguridad_${config.companyName.replace(/\s+/g, "_").toLowerCase()}_${yearStr}.docx`);
      setGenerated(true);
      setTimeout(() => setGenerated(false), 4000);
    } catch (err) {
      console.error("Error generating Word report:", err);
    } finally {
      setGenerating(false);
    }
  }, [config, year, totalCrimes, topDepts, crimeTypeSummary, monthlyTrend, activeBlockades]);

  /* ── UI ── */
  const S = {
    section: {
      background: panelBg,
      border: `1px solid ${borderC}`,
      borderRadius: "12px",
      padding: "18px 20px",
    } as React.CSSProperties,
    label: { fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: textMuted, marginBottom: "5px" },
    input: {
      width: "100%", background: inputBg, border: `1px solid ${borderC}`,
      borderRadius: "6px", padding: "8px 11px", fontSize: "13px", color: textMain,
      outline: "none", boxSizing: "border-box" as const,
    } as React.CSSProperties,
    row: { display: "flex", gap: "12px" } as React.CSSProperties,
    field: { display: "flex", flexDirection: "column" as const, gap: "4px", flex: 1 },
    sectionTitle: { fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: textMuted, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" } as React.CSSProperties,
  };

  const PRESET_COLORS = ["#0066cc","#00897b","#e53935","#5e35b1","#f57c00","#1a237e","#2e7d32","#37474f"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Header */}
      <div style={{ background: dark ? "linear-gradient(135deg,#0c1628,#0e1f38)" : "linear-gradient(135deg,#e8f4ff,#dbeafe)", border: `1px solid ${dark?"rgba(99,102,241,0.2)":"rgba(99,102,241,0.15)"}`, borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: 36, height: 36, borderRadius: "10px", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <FileText style={{ width: 18, height: 18, color: "#6366f1" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: textMain }}>Informe Gerencial Word — Personalizable por Cliente</div>
          <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>
            Configure el branding de su empresa · El informe se genera como archivo .docx listo para enviar
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ fontSize: "10px", color: textMuted, fontWeight: 600 }}>AÑO</label>
          <select value={year} onChange={e => setYear(+e.target.value)} style={{ ...S.input, width: "90px", padding: "5px 8px", fontSize: "12px" }}>
            {[2026,2025,2024,2023,2022,2021,2020].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

        {/* ── LEFT: Company branding ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          <div style={S.section}>
            <div style={S.sectionTitle}><Building2 size={12} /> Datos de la Empresa</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={S.field}>
                <label style={S.label}>Nombre de la empresa</label>
                <input style={S.input} value={config.companyName} onChange={e => updateConfig({ companyName: e.target.value })} placeholder="Ej: Transportes del Norte S.A.S." />
              </div>
              <div style={S.field}>
                <label style={S.label}>Subtítulo / Sector</label>
                <input style={S.input} value={config.companySubtitle} onChange={e => updateConfig({ companySubtitle: e.target.value })} placeholder="Ej: Logística y Transporte de Carga" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Pie de página / Cláusula de confidencialidad</label>
                <textarea rows={2} style={{ ...S.input, resize: "none" as const }} value={config.footerDisclaimer} onChange={e => updateConfig({ footerDisclaimer: e.target.value })} />
              </div>
            </div>
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}><User size={12} /> Analista / Firmante</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={S.field}>
                <label style={S.label}>Nombre completo</label>
                <input style={S.input} value={config.analystName} onChange={e => updateConfig({ analystName: e.target.value })} placeholder="Ing. Ana Martínez" />
              </div>
              <div style={S.row}>
                <div style={S.field}>
                  <label style={S.label}><Mail size={9} style={{ display: "inline", marginRight: "3px" }} />Correo</label>
                  <input style={S.input} value={config.analystEmail} onChange={e => updateConfig({ analystEmail: e.target.value })} placeholder="analista@empresa.com" />
                </div>
                <div style={S.field}>
                  <label style={S.label}><Phone size={9} style={{ display: "inline", marginRight: "3px" }} />Teléfono</label>
                  <input style={S.input} value={config.analystPhone} onChange={e => updateConfig({ analystPhone: e.target.value })} placeholder="+57 310 000 0000" />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── RIGHT: Logo + color ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          <div style={S.section}>
            <div style={S.sectionTitle}><Upload size={12} /> Logo de la Empresa</div>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dark?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.12)"}`,
                borderRadius: "10px",
                padding: "24px",
                textAlign: "center",
                cursor: "pointer",
                background: dark?"rgba(255,255,255,0.02)":"#f8fafc",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = config.primaryColor)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = dark?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.12)")}
            >
              {config.logoDataUrl ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <img src={config.logoDataUrl} alt="Logo" style={{ maxHeight: "72px", maxWidth: "180px", objectFit: "contain", borderRadius: "4px" }} />
                  <span style={{ fontSize: "11px", color: textMuted }}>Clic para cambiar logo</span>
                </div>
              ) : (
                <>
                  <Upload style={{ width: 28, height: 28, color: textMuted, margin: "0 auto 8px" }} />
                  <div style={{ fontSize: "12px", fontWeight: 600, color: textMain }}>Subir logo de empresa</div>
                  <div style={{ fontSize: "11px", color: textMuted, marginTop: "4px" }}>PNG, JPG hasta 2MB</div>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }} onChange={handleLogoUpload} />
            {config.logoDataUrl && (
              <button onClick={() => updateConfig({ logoDataUrl: "", logoMimeType: "image/png" })} style={{ marginTop: "8px", fontSize: "10px", color: "#ef4444", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                ✕ Eliminar logo
              </button>
            )}
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}><Palette size={12} /> Color Corporativo</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => updateConfig({ primaryColor: c })} title={c}
                    style={{ width: 32, height: 32, borderRadius: "8px", background: c, cursor: "pointer", border: config.primaryColor === c ? "3px solid white" : "2px solid transparent", boxSizing: "border-box", boxShadow: config.primaryColor === c ? `0 0 0 2px ${c}` : "none", transition: "all 0.15s" }}
                  />
                ))}
              </div>
              <div style={S.field}>
                <label style={S.label}>Color personalizado (hex)</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input type="color" value={config.primaryColor} onChange={e => updateConfig({ primaryColor: e.target.value })}
                    style={{ width: 40, height: 36, borderRadius: "6px", border: `1px solid ${borderC}`, background: "none", cursor: "pointer", padding: "2px" }} />
                  <input style={{ ...S.input, flex: 1 }} value={config.primaryColor} onChange={e => {
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) updateConfig({ primaryColor: e.target.value });
                  }} />
                  <div style={{ width: 60, height: 36, borderRadius: "6px", background: config.primaryColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, color: colorIsLight(config.primaryColor) ? "#000" : "#fff" }}>MUESTRA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Preview of what will be in the report */}
      <div style={{ background: dark?"rgba(99,102,241,0.06)":"rgba(99,102,241,0.04)", border: `1px solid ${dark?"rgba(99,102,241,0.2)":"rgba(99,102,241,0.12)"}`, borderRadius: "12px", padding: "14px 18px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6366f1", marginBottom: "10px" }}>
          Contenido del informe ({year}) — {totalCrimes.toLocaleString("es-CO")} delitos registrados
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          {[
            ["1. Resumen Ejecutivo", `${Object.keys({}).length + 5} KPIs principales`],
            ["2. Ranking Departamental", `Top ${topDepts.length} departamentos`],
            ["3. Tipos de Delito", `${crimeTypeSummary.length} categorías analizadas`],
            ["4. Tendencia Mensual", `${monthlyTrend.filter(m => m.count > 0).length} meses con datos`],
            ["5. Bloqueos Activos", activeBlockades.length > 0 ? `${activeBlockades.length} bloqueo(s) registrado(s)` : "Sin bloqueos activos"],
            ["6. Conclusiones", "Recomendaciones automáticas"],
          ].map(([title, detail]) => (
            <div key={title} style={{ background: dark?"rgba(255,255,255,0.025)":"#fff", border: `1px solid ${dark?"rgba(99,102,241,0.1)":"rgba(99,102,241,0.08)"}`, borderRadius: "7px", padding: "9px 11px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#6366f1", marginBottom: "3px" }}>{title}</div>
              <div style={{ fontSize: "10px", color: textMuted }}>{detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={generateWord}
        disabled={generating || totalCrimes === 0}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
          padding: "14px 28px", borderRadius: "10px", cursor: generating ? "wait" : "pointer",
          fontSize: "14px", fontWeight: 700, letterSpacing: "0.04em",
          background: generated ? "#10b981" : config.primaryColor,
          color: generated ? "#fff" : (colorIsLight(config.primaryColor) ? "#000" : "#fff"),
          border: "none",
          boxShadow: `0 4px 20px ${config.primaryColor}55`,
          opacity: (generating || totalCrimes === 0) ? 0.6 : 1,
          transition: "all 0.2s",
        }}
      >
        {generated
          ? <><CheckCircle2 size={18} /> Informe descargado</>
          : generating
          ? <><RefreshCw size={18} className="animate-spin" /> Generando informe Word…</>
          : <><Download size={18} /> Generar Informe Word (.docx)</>
        }
      </button>

      {totalCrimes === 0 && (
        <div style={{ textAlign: "center", fontSize: "12px", color: textMuted, marginTop: "-8px" }}>
          Cargando datos del año {year}…
        </div>
      )}
    </div>
  );
}
