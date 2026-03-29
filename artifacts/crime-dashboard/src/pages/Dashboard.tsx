import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CSVLink } from "react-csv";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import {
  useGetNationalMonthly,
  useGetCrimesByDepartment,
  useGetCrimeTypes,
  useGetRefreshStatus,
  useGetAvailableYears,
  useTriggerRefresh,
  useGetBlockades,
} from "@workspace/api-client-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  RefreshCw, ChevronDown, Printer, Sun, Moon, Download, Check, ArrowUpIcon, ArrowDownIcon,
  Activity, MapPin, AlertTriangle, TrendingUp, TrendingDown, LogOut, User
} from "lucide-react";

import { ColombiaMap } from "@/components/ColombiaMap";
import { RouteAnalyzer } from "@/components/RouteAnalyzer";
import { ReportGenerator } from "@/components/ReportGenerator";
import { DataAlertBanner } from "@/components/DataAlertBanner";
import { ArmedGroupsPanel } from "@/components/ArmedGroupsPanel";
import { HolidayRestrictions } from "@/components/HolidayRestrictions";
import { CompanyProfile } from "@/components/CompanyProfile";
import { useAuth } from "@/context/AuthContext";

/* ───────── EXECUTIVE PALETTE ───────── */
const E = {
  cyan:   "#00d4ff",
  amber:  "#f59e0b",
  purple: "#a855f7",
  emerald:"#10b981",
  red:    "#ef4444",
  bg:     "#070c15",
  panel:  "#0c1220",
  panelHover: "#0f1628",
  border: "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.12)",
  gridDark: "rgba(255,255,255,0.05)",
  tickDark: "rgba(255,255,255,0.35)",
  gridLight: "#e0e5ee",
  tickLight: "#6b7280",
  textDim:  "rgba(255,255,255,0.45)",
  textDimLight: "#6b7280",
};

const CHART_COLORS_DARK = [E.cyan, E.amber, E.emerald, E.red, E.purple, "#fb923c", "#34d399", "#f472b6"];
const CHART_COLORS_LIGHT = ["#0369a1","#d97706","#059669","#dc2626","#7c3aed","#ea580c","#10b981","#db2777"];

const DATA_SOURCES: string[] = ["Policía Nacional", "AICRI 2026"];

const INTERVAL_OPTIONS = [
  { label: "Cada 5 min",   ms: 5 * 60 * 1000 },
  { label: "Cada 15 min",  ms: 15 * 60 * 1000 },
  { label: "Cada 1 hora",  ms: 60 * 60 * 1000 },
  { label: "Cada 24 horas",ms: 24 * 60 * 60 * 1000 },
];

const HURTO_SUBCATEGORIES = [
  { id: "hurtos_personas",    name: "Hurto a Personas",    color: "#00d4ff", icon: "👤" },
  { id: "hurtos_automotores", name: "Hurto a Automotores", color: "#f59e0b", icon: "🚛" },
  { id: "hurtos_motocicletas",name: "Hurto a Motocicletas",color: "#a855f7", icon: "🏍️" },
  { id: "hurtos_comercio",    name: "Hurto a Comercio",    color: "#10b981", icon: "🏪" },
];
const HURTO_SUBCATEGORY_IDS = HURTO_SUBCATEGORIES.map(s => s.id);

/* ─── Custom dark tooltip ─── */
function ExecTooltip({ active, payload, label, dark }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const bg = dark ? "rgba(10,16,30,0.97)" : "rgba(255,255,255,0.98)";
  const border = dark ? "rgba(0,212,255,0.25)" : "rgba(3,105,161,0.25)";
  const text = dark ? "#e2e8f0" : "#1e293b";
  const muted = dark ? "rgba(255,255,255,0.45)" : "#64748b";

  return (
    <div style={{
      backgroundColor: bg,
      border: `1px solid ${border}`,
      borderRadius: "8px",
      padding: "10px 14px",
      color: text,
      fontSize: "12px",
      backdropFilter: "blur(12px)",
      boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.7)" : "0 4px 16px rgba(0,0,0,0.12)",
      minWidth: "160px",
    }}>
      <div style={{ marginBottom: "8px", fontWeight: 700, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: dark ? E.cyan : "#0369a1" }}>
        {label}
      </div>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: entry.color, flexShrink: 0, boxShadow: dark ? `0 0 6px ${entry.color}` : "none" }} />
          <span style={{ color: muted, flex: 1 }}>{entry.name}</span>
          <span style={{ fontWeight: 700, fontFamily: "IBM Plex Mono, monospace" }}>
            {typeof entry.value === "number" ? entry.value.toLocaleString("es-CO") : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ExecLegend({ payload, dark }: any) {
  if (!payload || payload.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px 14px", fontSize: "11px", marginTop: "8px" }}>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: entry.color, boxShadow: dark ? `0 0 5px ${entry.color}` : "none" }} />
          <span style={{ color: dark ? E.textDim : E.textDimLight }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── KPI Card ─── */
function KpiCard({ label, value, sub, icon: Icon, accentColor, dark, loading }: {
  label: string; value: string; sub?: string; icon: any; accentColor: string; dark: boolean; loading: boolean;
}) {
  const bg = dark ? E.panel : "#ffffff";
  const border = dark ? `rgba(${hexToRgb(accentColor)}, 0.18)` : "rgba(0,0,0,0.08)";
  const topGlow = dark ? `linear-gradient(90deg, ${accentColor}22 0%, transparent 70%)` : `linear-gradient(90deg, ${accentColor}18 0%, transparent 70%)`;

  return (
    <div className="kpi-card" style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: "12px",
      padding: "20px 22px",
      position: "relative",
      overflow: "hidden",
      boxShadow: dark ? `0 0 0 1px rgba(${hexToRgb(accentColor)},0.12), 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)` : "0 1px 4px rgba(0,0,0,0.08)",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: accentColor, opacity: 0.9, borderRadius: "12px 12px 0 0" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: topGlow, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: dark ? E.textDim : E.textDimLight }}>
            {label}
          </span>
          <Icon style={{ width: 16, height: 16, color: accentColor, opacity: 0.8 }} />
        </div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Skeleton className="h-9 w-32" style={{ background: dark ? "rgba(255,255,255,0.06)" : undefined }} />
            {sub !== undefined && <Skeleton className="h-4 w-24" style={{ background: dark ? "rgba(255,255,255,0.04)" : undefined }} />}
          </div>
        ) : (
          <>
            <div style={{ fontSize: "32px", fontWeight: 800, color: accentColor, fontFamily: "Inter, sans-serif", fontVariantNumeric: "tabular-nums", lineHeight: 1.1, letterSpacing: "-0.03em", textShadow: dark ? `0 0 24px ${accentColor}55` : "none" }}>
              {value}
            </div>
            {sub && <div style={{ fontSize: "12px", color: dark ? E.textDim : E.textDimLight, marginTop: "6px", fontWeight: 500 }}>{sub}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

/* ─── Chart Panel ─── */
function ChartPanel({ title, children, onExport, exportData, exportName, dark, loading }: any) {
  const bg = dark ? E.panel : "#ffffff";
  const border = dark ? E.border : "rgba(0,0,0,0.08)";

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: "12px",
      overflow: "hidden",
      boxShadow: dark ? "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)" : "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px 12px",
        borderBottom: `1px solid ${dark ? E.border : "rgba(0,0,0,0.06)"}`,
      }}>
        <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: dark ? "rgba(255,255,255,0.75)" : "#374151" }}>
          {title}
        </span>
        {!loading && exportData && exportData.length > 0 && (
          <CSVLink data={exportData} filename={exportName} className="print:hidden">
            <button style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "26px", height: "26px", borderRadius: "6px",
              background: dark ? "rgba(255,255,255,0.07)" : "#f3f4f6",
              color: dark ? "rgba(255,255,255,0.5)" : "#6b7280",
              border: `1px solid ${dark ? E.border : "rgba(0,0,0,0.08)"}`,
              cursor: "pointer",
            }}>
              <Download style={{ width: 12, height: 12 }} />
            </button>
          </CSVLink>
        )}
      </div>
      <div style={{ padding: "16px 20px 20px" }}>
        {children}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const [isDark, setIsDark] = useState(true);
  const [activeTab, setActiveTab] = useState<"estadisticas" | "ruta" | "informe" | "grupos" | "puentes" | "empresa">("estadisticas");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIntervalMs, setSelectedIntervalMs] = useState(INTERVAL_OPTIONS[0].ms);

  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  const [selectedCrimeType, setSelectedCrimeType] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [showComparison, setShowComparison] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: availableYears = [], isLoading: isLoadingYears } = useGetAvailableYears();

  useEffect(() => {
    if (availableYears.length > 0 && selectedYear === "all") {
      setSelectedYear(Math.max(...availableYears));
    }
  }, [availableYears, selectedYear]);

  const { data: crimeTypes = [], isLoading: isLoadingTypes } = useGetCrimeTypes();
  const { data: refreshStatus, isLoading: isLoadingStatus, dataUpdatedAt } = useGetRefreshStatus();

  const { mutate: triggerRefresh } = useTriggerRefresh({
    mutation: { onSuccess: () => { queryClient.invalidateQueries(); } }
  });

  const queryParams = {
    year: selectedYear === "all" ? undefined : selectedYear,
    crimeType: selectedCrimeType === "all" ? undefined : selectedCrimeType,
    department: selectedDepartment === "all" ? undefined : selectedDepartment,
  };
  const prevYearParams = { ...queryParams, year: selectedYear !== "all" ? selectedYear - 1 : undefined };

  const { data: monthlyData = [], isLoading: isLoadingMonthly, isFetching: isFetchingMonthly } = useGetNationalMonthly(queryParams);
  const { data: prevMonthlyData = [] } = useGetNationalMonthly(prevYearParams);
  const { data: deptData = [], isLoading: isLoadingDept, isFetching: isFetchingDept } = useGetCrimesByDepartment({ year: queryParams.year, crimeType: queryParams.crimeType });

  // Subcategory breakdown — only fetched when "hurtos" is selected
  const showSubcategoryPanel = selectedCrimeType === "hurtos";
  const { data: subcatMonthlyRaw = [], isLoading: isLoadingSubcat } = useGetNationalMonthly(
    { year: queryParams.year, department: queryParams.department },
    { query: { enabled: showSubcategoryPanel } }
  );

  const subcategoryMonthlyChart = useMemo(() => {
    if (!showSubcategoryPanel) return [];
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const pivot = months.map(m => ({ month: m } as Record<string, string | number>));
    subcatMonthlyRaw
      .filter((d: any) => HURTO_SUBCATEGORY_IDS.includes(d.crimeTypeId))
      .forEach((d: any) => {
        const idx = (d.month as number) - 1;
        if (pivot[idx]) pivot[idx][d.crimeTypeName] = ((pivot[idx][d.crimeTypeName] as number) || 0) + (d.count as number);
      });
    return pivot.filter(p => Object.keys(p).length > 1);
  }, [subcatMonthlyRaw, showSubcategoryPanel]);

  const subcategoryTotals = useMemo(() => {
    if (!showSubcategoryPanel) return [];
    return HURTO_SUBCATEGORIES.map(sc => ({
      ...sc,
      total: (subcatMonthlyRaw as any[]).filter(d => d.crimeTypeId === sc.id).reduce((s: number, d: any) => s + (d.count as number), 0),
    }));
  }, [subcatMonthlyRaw, showSubcategoryPanel]);

  const { data: allBlockadesRaw = [] } = useGetBlockades(undefined, { query: { refetchInterval: 60000 } });
  const blockadeCounts = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const b of (Array.isArray(allBlockadesRaw) ? allBlockadesRaw : []) as any[]) {
      if (b.status === "activo") m[b.department] = (m[b.department] ?? 0) + 1;
    }
    return m;
  }, [allBlockadesRaw]);

  const availableDepartments = useMemo(() => {
    return [...new Set(deptData.map((d: any) => d.department as string))].sort((a: string, b: string) => a.localeCompare(b, "es"));
  }, [deptData]);

  const filteredDeptData = useMemo(() => {
    if (selectedDepartment === "all") return deptData;
    return deptData.filter((d: any) => d.department === selectedDepartment);
  }, [deptData, selectedDepartment]);

  const loading = isLoadingYears || isLoadingTypes || isLoadingStatus || isLoadingMonthly || isLoadingDept || isFetchingMonthly || isFetchingDept || (showSubcategoryPanel && isLoadingSubcat);

  useEffect(() => {
    if (loading) { setIsSpinning(true); }
    else {
      const t = setTimeout(() => setIsSpinning(false), 600);
      return () => clearTimeout(t);
    }
  }, [loading]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => { queryClient.invalidateQueries(); }, selectedIntervalMs);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedIntervalMs, queryClient]);

  const lastRefreshed = refreshStatus?.lastRefreshed
    ? (() => {
        const d = new Date(refreshStatus.lastRefreshed);
        const time = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
        const date = d.toLocaleDateString("es-CO", { month: "short", day: "numeric" });
        return `${time} del ${date}`;
      })()
    : null;

  /* ── KPIs ── */
  const totalCrimes = monthlyData.reduce((s, d) => s + d.count, 0);
  const totalPrevCrimes = prevMonthlyData.reduce((s, d) => s + d.count, 0);
  const yoyChange = totalPrevCrimes === 0 ? 0 : ((totalCrimes - totalPrevCrimes) / totalPrevCrimes) * 100;

  const deptWithMostCrimes = useMemo(() => {
    const data = filteredDeptData.length > 0 ? filteredDeptData : deptData;
    if (data.length === 0) return { department: "--", totalCount: 0 };
    return data.reduce((max, d) => (d.totalCount > max.totalCount ? d : max), data[0]);
  }, [filteredDeptData, deptData]);

  const mostFrequentCrime = useMemo(() => {
    if (monthlyData.length === 0) return { name: "--", count: 0 };
    const counts = monthlyData.reduce((acc, curr) => {
      acc[curr.crimeTypeName] = (acc[curr.crimeTypeName] || 0) + curr.count;
      return acc;
    }, {} as Record<string, number>);
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? { name: sorted[0][0], count: sorted[0][1] } : { name: "--", count: 0 };
  }, [monthlyData]);

  /* ── Chart data ── */
  const CHART_COLORS = isDark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;

  const formattedMonthlyData = useMemo(() => {
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    // Prev year totals by month (for comparison overlay)
    const prevByMonth = Array(12).fill(0);
    prevMonthlyData.forEach((d: any) => { prevByMonth[d.month - 1] += d.count; });

    if (selectedCrimeType !== "all") {
      const grouped = monthlyData.reduce((acc, curr) => {
        acc[curr.month - 1] = (acc[curr.month - 1] || 0) + curr.count;
        return acc;
      }, Array(12).fill(0));
      return months.map((m, i) => ({
        month: m,
        count: grouped[i],
        prevCount: prevByMonth[i],
      })).filter(d => d.count > 0 || totalCrimes > 0);
    } else {
      const pivot: Record<string, any>[] = months.map(m => ({ month: m }));
      monthlyData.forEach(d => {
        if (pivot[d.month - 1]) pivot[d.month - 1][d.crimeTypeName] = d.count;
      });
      // Add total prev year per month as __prev__ key
      pivot.forEach((row, i) => { row["__prev__"] = prevByMonth[i]; });
      return pivot;
    }
  }, [monthlyData, prevMonthlyData, selectedCrimeType, totalCrimes]);

  const crimeTypesInMonthlyData = useMemo(() => {
    if (selectedCrimeType !== "all") return [];
    const types = new Set<string>();
    monthlyData.forEach(d => types.add(d.crimeTypeName));
    return Array.from(types);
  }, [monthlyData, selectedCrimeType]);

  const barChartData = useMemo(() => {
    if (selectedCrimeType !== "all") return [];
    const counts = monthlyData.reduce((acc, curr) => {
      acc[curr.crimeTypeName] = (acc[curr.crimeTypeName] || 0) + curr.count;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [monthlyData, selectedCrimeType]);

  const [sorting, setSorting] = useState<SortingState>([{ id: "totalCount", desc: true }]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      id: "index",
      header: "#",
      cell: ({ row }) => {
        const rank = row.index + 1;
        const rankColor = rank === 1 ? E.amber : rank === 2 ? "rgba(255,255,255,0.6)" : rank === 3 ? "#cd7f32" : (isDark ? E.textDim : E.textDimLight);
        return (
          <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "12px", fontWeight: 700, color: rankColor }}>
            {String(rank).padStart(2, "0")}
          </span>
        );
      },
    },
    { accessorKey: "department", header: "Departamento" },
    {
      id: "crimeType",
      header: "Tipo de Delito",
      cell: () => <span style={{ fontSize: "12px" }}>{selectedCrimeType === "all" ? "Todos" : crimeTypes.find(c => c.id === selectedCrimeType)?.name || "Específico"}</span>,
    },
    {
      accessorKey: "totalCount",
      header: "Total Casos",
      cell: ({ row }) => (
        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: isDark ? E.cyan : "#0369a1", fontSize: "13px" }}>
          {row.original.totalCount.toLocaleString("es-CO")}
        </span>
      ),
    },
  ], [selectedCrimeType, crimeTypes, isDark]);

  const table = useReactTable({
    data: filteredDeptData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const top10DeptData = useMemo(() => table.getSortedRowModel().rows.slice(0, 10).map(r => r.original), [table]);

  /* ── Colors ── */
  const gridColor = isDark ? E.gridDark : E.gridLight;
  const tickColor = isDark ? E.tickDark : E.tickLight;
  const panelBg = isDark ? E.panel : "#ffffff";
  const panelBorder = isDark ? E.border : "rgba(0,0,0,0.07)";
  const mutedText = isDark ? E.textDim : E.textDimLight;

  /* ── Control button style ── */
  const ctrlBtn = {
    background: isDark ? "rgba(255,255,255,0.06)" : "#f3f4f6",
    color: isDark ? "rgba(255,255,255,0.6)" : "#6b7280",
    border: `1px solid ${isDark ? E.border : "rgba(0,0,0,0.08)"}`,
    borderRadius: "7px",
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  } as React.CSSProperties;

  return (
    <div className="exec-bg min-h-screen" style={{ background: isDark ? E.bg : "#f0f4fa" }}>
      <div className="exec-content max-w-[1440px] mx-auto px-6 py-6">

        {/* ── HEADER ── */}
        <div style={{ marginBottom: "28px", display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <div className="status-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: E.emerald, boxShadow: isDark ? `0 0 8px ${E.emerald}` : "none", flexShrink: 0 }} />
              <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: isDark ? E.emerald : "#059669" }}>
                Sistema Activo
              </span>
              <span style={{ fontSize: "11px", color: mutedText, letterSpacing: "0.06em" }}>·</span>
              <span style={{ fontSize: "11px", color: mutedText, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Fuente: {DATA_SOURCES.join(" / ")}
              </span>
            </div>
            <h1 style={{
              fontSize: "clamp(22px, 3vw, 32px)",
              fontWeight: 900,
              letterSpacing: "-0.025em",
              color: isDark ? "#ffffff" : "#0f172a",
              lineHeight: 1.1,
              margin: 0,
            }}>
              Colombia · Estadísticas Delictivas
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
              <span style={{ fontSize: "12px", color: mutedText }}>Policía Nacional de Colombia · Actualización mensual</span>
              {lastRefreshed && (
                <>
                  <span style={{ color: isDark ? E.border : "rgba(0,0,0,0.15)" }}>|</span>
                  <span style={{ fontSize: "12px", color: mutedText }}>Actualizado: {lastRefreshed}</span>
                </>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }} className="print:hidden">
            {/* Refresh + dropdown */}
            <div className="relative" ref={dropdownRef}>
              <div style={{ display: "flex", alignItems: "center", borderRadius: "8px", overflow: "hidden", height: "32px", fontSize: "12px", background: isDark ? "rgba(255,255,255,0.06)" : "#f3f4f6", border: `1px solid ${isDark ? E.border : "rgba(0,0,0,0.08)"}` }}>
                <button onClick={() => triggerRefresh()} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 10px", height: "100%", color: isDark ? "rgba(255,255,255,0.6)" : "#6b7280", background: "transparent", cursor: "pointer" }}>
                  <RefreshCw style={{ width: 13, height: 13 }} className={isSpinning ? "animate-spin" : ""} />
                  Refrescar
                </button>
                <div style={{ width: "1px", height: "16px", background: isDark ? E.border : "rgba(0,0,0,0.1)" }} />
                <button onClick={() => setDropdownOpen(o => !o)} style={{ display: "flex", alignItems: "center", padding: "0 8px", height: "100%", color: isDark ? "rgba(255,255,255,0.6)" : "#6b7280", background: "transparent", cursor: "pointer" }}>
                  <ChevronDown style={{ width: 13, height: 13 }} />
                </button>
              </div>
              {dropdownOpen && (
                <div style={{ position: "absolute", right: 0, top: "36px", width: "180px", background: isDark ? "#0d1220" : "#ffffff", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`, borderRadius: "8px", zIndex: 50, padding: "6px 0", boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 4px 12px rgba(0,0,0,0.1)" }}>
                  <div style={{ padding: "8px 12px", borderBottom: `1px solid ${isDark ? E.border : "rgba(0,0,0,0.06)"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: mutedText, letterSpacing: "0.05em" }}>AUTO-REFRESH</span>
                    <button onClick={() => setAutoRefresh(r => !r)} style={{ width: "32px", height: "18px", borderRadius: "9px", background: autoRefresh ? E.cyan : (isDark ? "rgba(255,255,255,0.15)" : "#d1d5db"), border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                      <span style={{ position: "absolute", top: "2px", left: autoRefresh ? "16px" : "2px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                    </button>
                  </div>
                  {INTERVAL_OPTIONS.map(opt => (
                    <button key={opt.ms} onClick={() => setSelectedIntervalMs(opt.ms)} disabled={!autoRefresh} style={{ width: "100%", textAlign: "left", padding: "7px 12px", fontSize: "12px", background: "transparent", cursor: autoRefresh ? "pointer" : "default", opacity: autoRefresh ? 1 : 0.4, color: selectedIntervalMs === opt.ms ? E.cyan : (isDark ? "rgba(255,255,255,0.65)" : "#374151"), display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      {opt.label}
                      {selectedIntervalMs === opt.ms && <Check style={{ width: 11, height: 11 }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => window.print()} style={{ ...ctrlBtn, width: 32, height: 32 }} title="Exportar PDF">
              <Printer style={{ width: 13, height: 13 }} />
            </button>
            <button onClick={() => setIsDark(d => !d)} style={{ ...ctrlBtn, width: 32, height: 32 }} title="Alternar modo">
              {isDark ? <Sun style={{ width: 13, height: 13 }} /> : <Moon style={{ width: 13, height: 13 }} />}
            </button>
            {user && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4, paddingLeft: 10, borderLeft: `1px solid ${isDark ? E.border : "rgba(0,0,0,0.08)"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <User style={{ width: 12, height: 12, color: E.cyan }} />
                  </div>
                  <span style={{ fontSize: 11, color: isDark ? E.textDim : E.textDimLight, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.companyName}
                  </span>
                </div>
                <button onClick={logout} style={{ ...ctrlBtn, width: 28, height: 28, color: isDark ? "rgba(255,255,255,0.4)" : "#6b7280" }} title="Cerrar sesión">
                  <LogOut style={{ width: 12, height: 12 }} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "22px", borderBottom: `1px solid ${isDark ? E.border : "rgba(0,0,0,0.07)"}`, paddingBottom: "0" }} className="print:hidden">
          {([
            { id: "estadisticas", label: "📊  Estadísticas Delictivas" },
            { id: "grupos",       label: "⚠️  Grupos Armados" },
            { id: "ruta",         label: "🚛  Análisis de Ruta — Piratería Terrestre" },
            { id: "puentes",      label: "🚧  Restricciones Puentes Festivos" },
            { id: "informe",      label: "📄  Informe Gerencial PDF" },
            { id: "empresa",      label: "🏢  Perfil Empresa" },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "9px 18px", fontSize: "12px", fontWeight: 600,
                border: "none", cursor: "pointer",
                borderRadius: "8px 8px 0 0",
                background: activeTab === tab.id
                  ? (isDark ? E.panel : "#fff")
                  : "transparent",
                color: activeTab === tab.id
                  ? (isDark ? E.cyan : "#0369a1")
                  : (isDark ? E.textDim : "#6b7280"),
                borderBottom: activeTab === tab.id
                  ? `2px solid ${E.cyan}`
                  : "2px solid transparent",
                transition: "all 0.15s",
                letterSpacing: "0.02em",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── GLOBAL ALERT BANNERS ── */}
        <DataAlertBanner dark={isDark} />

        {/* ── GRUPOS ARMADOS TAB ── */}
        {activeTab === "grupos" && (
          <ArmedGroupsPanel dark={isDark} />
        )}

        {/* ── ROUTE ANALYZER TAB ── */}
        {activeTab === "ruta" && (
          <RouteAnalyzer dark={isDark} />
        )}

        {/* ── PUENTES FESTIVOS TAB ── */}
        {activeTab === "puentes" && (
          <HolidayRestrictions dark={isDark} />
        )}

        {/* ── INFORME GERENCIAL TAB ── */}
        {activeTab === "informe" && (
          <ReportGenerator dark={isDark} user={user} />
        )}

        {/* ── PERFIL EMPRESA TAB ── */}
        {activeTab === "empresa" && (
          <CompanyProfile dark={isDark} />
        )}

        {/* ── STATS TAB content starts here ── */}
        {activeTab === "estadisticas" && <>

        {/* ── FILTERS ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "24px", alignItems: "flex-end" }} className="print:hidden">
          {[
            { label: "Año", value: selectedYear.toString(), options: [{ value: "all", label: "Todos los años" }, ...availableYears.map(y => ({ value: y.toString(), label: String(y) }))], onChange: (v: string) => setSelectedYear(v === "all" ? "all" : parseInt(v)), width: "150px" },
            { label: "Tipo de Delito", value: selectedCrimeType, options: [{ value: "all", label: "Todos los delitos" }, ...crimeTypes.map(c => ({ value: c.id, label: c.name }))], onChange: setSelectedCrimeType, width: "220px" },
            { label: "Departamento", value: selectedDepartment, options: [{ value: "all", label: "Todos los departamentos" }, ...availableDepartments.map(d => ({ value: d, label: d }))], onChange: setSelectedDepartment, width: "220px" },
          ].map(({ label, value, options, onChange, width }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: width }}>
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: mutedText }}>{label}</span>
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger style={{
                  height: "34px", fontSize: "13px", fontWeight: 500,
                  background: isDark ? "rgba(255,255,255,0.05)" : "#ffffff",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)"}`,
                  color: isDark ? "rgba(255,255,255,0.85)" : "#1e293b",
                  borderRadius: "8px",
                }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: isDark ? "#0d1220" : "#ffffff", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}` }}>
                  {options.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} style={{ fontSize: "13px" }}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          {/* Comparison toggle — only meaningful when a specific year is selected */}
          {selectedYear !== "all" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: mutedText }}>Comparativa</span>
              <button
                onClick={() => setShowComparison(p => !p)}
                style={{
                  height: "34px", padding: "0 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                  background: showComparison
                    ? (isDark ? "rgba(168,85,247,0.18)" : "rgba(109,40,217,0.1)")
                    : (isDark ? "rgba(255,255,255,0.05)" : "#ffffff"),
                  color: showComparison ? (isDark ? "#c084fc" : "#7c3aed") : (isDark ? "rgba(255,255,255,0.55)" : "#6b7280"),
                  border: `1px solid ${showComparison
                    ? (isDark ? "rgba(192,132,252,0.4)" : "rgba(124,58,237,0.3)")
                    : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)")}`,
                  cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
                }}>
                <TrendingUp style={{ width: 13, height: 13 }} />
                vs {selectedYear - 1}
              </button>
            </div>
          )}
        </div>

        {/* ── KPI CARDS ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "16px" }}>
          <KpiCard
            label="Total de Delitos"
            value={totalCrimes.toLocaleString("es-CO")}
            icon={Activity}
            accentColor={E.cyan}
            dark={isDark}
            loading={loading}
          />
          <KpiCard
            label="Depto con Más Delitos"
            value={deptWithMostCrimes.department}
            sub={`${deptWithMostCrimes.totalCount.toLocaleString("es-CO")} casos`}
            icon={MapPin}
            accentColor={E.amber}
            dark={isDark}
            loading={loading}
          />
          <KpiCard
            label="Delito Más Frecuente"
            value={mostFrequentCrime.name}
            sub={`${mostFrequentCrime.count.toLocaleString("es-CO")} casos`}
            icon={AlertTriangle}
            accentColor={E.red}
            dark={isDark}
            loading={loading}
          />
          <KpiCard
            label="Variación vs Año Anterior"
            value={`${yoyChange > 0 ? "+" : ""}${yoyChange.toFixed(1)}%`}
            sub={selectedYear === "all" ? "N/A — todos los años" : undefined}
            icon={yoyChange >= 0 ? TrendingUp : TrendingDown}
            accentColor={yoyChange > 0 ? E.red : yoyChange < 0 ? E.emerald : E.cyan}
            dark={isDark}
            loading={loading}
          />
        </div>

        {/* ── MAIN CHARTS ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          {/* Trend */}
          <ChartPanel title="Tendencia Mensual" exportData={formattedMonthlyData} exportName="tendencia-mensual.csv" dark={isDark} loading={loading}>
            {loading ? <Skeleton className="w-full h-[300px]" /> : (
              <ResponsiveContainer width="100%" height={300} debounce={0}>
                {selectedCrimeType !== "all" ? (
                  <AreaChart data={formattedMonthlyData}>
                    <defs>
                      <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={isDark ? 0.35 : 0.2} />
                        <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ExecTooltip dark={isDark} />} isAnimationActive={false} cursor={{ stroke: isDark ? E.cyan : "#0369a1", strokeWidth: 1, strokeOpacity: 0.3 }} />
                    {showComparison && <Legend content={<ExecLegend dark={isDark} />} />}
                    <Area type="monotone" dataKey="count" name={`Casos ${selectedYear}`} fill="url(#cyanGrad)" stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: CHART_COLORS[0], stroke: isDark ? E.bg : "#fff", strokeWidth: 2 }} isAnimationActive={false} />
                    {showComparison && (
                      <Line type="monotone" dataKey="prevCount" name={`Casos ${(selectedYear as number) - 1}`} stroke={isDark ? "#a78bfa" : "#7c3aed"} strokeWidth={1.8} strokeDasharray="5 3" dot={false} activeDot={{ r: 4, fill: isDark ? "#a78bfa" : "#7c3aed", strokeWidth: 0 }} isAnimationActive={false} />
                    )}
                  </AreaChart>
                ) : (
                  <LineChart data={formattedMonthlyData}>
                    <CartesianGrid strokeDasharray="4 4" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ExecTooltip dark={isDark} />} isAnimationActive={false} cursor={{ stroke: tickColor, strokeDasharray: "3 3", strokeOpacity: 0.5 }} />
                    <Legend content={<ExecLegend dark={isDark} />} />
                    {crimeTypesInMonthlyData.map((type, idx) => (
                      <Line key={type} type="monotone" dataKey={type} name={type} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: CHART_COLORS[idx % CHART_COLORS.length], stroke: isDark ? E.bg : "#fff", strokeWidth: 2 }} isAnimationActive={false} />
                    ))}
                    {showComparison && selectedYear !== "all" && (
                      <Line type="monotone" dataKey="__prev__" name={`Total ${(selectedYear as number) - 1}`} stroke={isDark ? "#a78bfa" : "#7c3aed"} strokeWidth={1.8} strokeDasharray="5 3" dot={false} activeDot={{ r: 4, fill: isDark ? "#a78bfa" : "#7c3aed", strokeWidth: 0 }} isAnimationActive={false} />
                    )}
                  </LineChart>
                )}
              </ResponsiveContainer>
            )}
          </ChartPanel>

          {/* Bar chart or map */}
          {selectedCrimeType === "all" ? (
            <ChartPanel title="Distribución por Tipo de Delito" exportData={barChartData} exportName="comparacion-delitos.csv" dark={isDark} loading={loading}>
              {loading ? <Skeleton className="w-full h-[300px]" /> : (
                <ResponsiveContainer width="100%" height={300} debounce={0}>
                  <BarChart data={barChartData} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke={gridColor} horizontal={false} vertical={true} />
                    <XAxis type="number" tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} width={110} tickFormatter={v => v.length > 16 ? v.substring(0, 16) + "…" : v} />
                    <Tooltip content={<ExecTooltip dark={isDark} />} isAnimationActive={false} cursor={{ fill: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="count" name="Casos" isAnimationActive={false} radius={[0, 4, 4, 0]}>
                      {barChartData.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} fillOpacity={isDark ? 0.85 : 0.75} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartPanel>
          ) : (
            <ChartPanel title="Distribución Geográfica" exportData={deptData} exportName="geografica.csv" dark={isDark} loading={loading}>
              <div style={{ height: "300px" }}>
                {loading ? <Skeleton className="w-full h-full" /> : <ColombiaMap data={deptData} dark={isDark} blockadeCounts={blockadeCounts} />}
              </div>
            </ChartPanel>
          )}
        </div>

        {/* ── SUBCATEGORY BREAKDOWN — visible only when "Hurtos" is selected ── */}
        {showSubcategoryPanel && (
          <ChartPanel title="Desglose por Subcategoría de Hurto" dark={isDark} loading={loading}>
            {/* KPI mini-cards */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
              {subcategoryTotals.map(sc => {
                const grandTotal = subcategoryTotals.reduce((s, x) => s + x.total, 0);
                const pct = grandTotal > 0 ? ((sc.total / grandTotal) * 100).toFixed(1) : "0.0";
                return (
                  <div key={sc.id} style={{ flex: "1 1 130px", padding: "12px 14px", borderRadius: "8px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderLeft: `3px solid ${sc.color}` }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: sc.color, marginBottom: "4px" }}>
                      {sc.icon} {sc.name}
                    </div>
                    <div style={{ fontSize: "22px", fontWeight: 700, lineHeight: 1.1 }}>
                      {sc.total > 0 ? sc.total.toLocaleString("es-CO") : "—"}
                    </div>
                    <div style={{ fontSize: "10px", color: isDark ? E.textDim : E.textDimLight, marginTop: "2px" }}>
                      {pct}% del total hurtos
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Stacked area chart */}
            {subcategoryMonthlyChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={260} debounce={0}>
                <AreaChart data={subcategoryMonthlyChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    {HURTO_SUBCATEGORIES.map(sc => (
                      <linearGradient key={sc.id} id={`grad_${sc.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={sc.color} stopOpacity={isDark ? 0.28 : 0.18} />
                        <stop offset="100%" stopColor={sc.color} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ExecTooltip dark={isDark} />} isAnimationActive={false} />
                  <Legend content={<ExecLegend dark={isDark} />} />
                  {HURTO_SUBCATEGORIES.map(sc => (
                    <Area
                      key={sc.id}
                      type="monotone"
                      dataKey={sc.name}
                      stroke={sc.color}
                      fill={`url(#grad_${sc.id})`}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: sc.color, stroke: isDark ? E.bg : "#fff", strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: "260px", display: "flex", alignItems: "center", justifyContent: "center", color: isDark ? E.textDim : E.textDimLight, fontSize: "13px" }}>
                Cargando desglose de subcategorías…
              </div>
            )}
          </ChartPanel>
        )}

        {/* ── MAP + TABLE ── */}
        <div style={{ display: "grid", gridTemplateColumns: selectedCrimeType === "all" ? "1fr 2fr" : "1fr", gap: "12px", marginBottom: "16px" }}>
          {selectedCrimeType === "all" && (
            <ChartPanel title="Mapa de Calor" exportData={deptData} exportName="mapa-calor.csv" dark={isDark} loading={loading}>
              <div style={{ height: "380px" }}>
                {loading ? <Skeleton className="w-full h-full" /> : <ColombiaMap data={deptData} dark={isDark} blockadeCounts={blockadeCounts} />}
              </div>
            </ChartPanel>
          )}

          <ChartPanel title="Top 10 Departamentos" exportData={top10DeptData} exportName="top10-departamentos.csv" dark={isDark} loading={loading}>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : (
              <div style={{ borderRadius: "8px", overflow: "hidden", border: `1px solid ${isDark ? E.border : "rgba(0,0,0,0.07)"}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc", borderBottom: `1px solid ${isDark ? E.border : "rgba(0,0,0,0.07)"}` }}>
                      {table.getHeaderGroups().map(hg => hg.headers.map(header => (
                        <th key={header.id} onClick={header.column.getToggleSortingHandler()} style={{ padding: "10px 14px", textAlign: "left", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: mutedText, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === "desc" ? " ↓" : header.column.getIsSorted() === "asc" ? " ↑" : ""}
                        </th>
                      )))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.slice(0, 10).map((row, ri) => (
                      <tr key={row.id} style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`, background: ri % 2 === 0 ? "transparent" : (isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)"), transition: "background 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = isDark ? "rgba(0,212,255,0.05)" : "rgba(3,105,161,0.05)")}
                        onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? "transparent" : (isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)"))}>
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} style={{ padding: "10px 14px" }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {table.getRowModel().rows.length === 0 && (
                      <tr><td colSpan={columns.length} style={{ padding: "32px", textAlign: "center", color: mutedText }}>Sin datos disponibles</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </ChartPanel>
        </div>

        </>}

      </div>
    </div>
  );
}
