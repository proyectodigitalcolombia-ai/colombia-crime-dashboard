import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CSVLink } from "react-csv";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useGetNationalMonthly,
  useGetCrimesByDepartment,
  useGetCrimeTypes,
  useGetRefreshStatus,
  useGetAvailableYears,
  useTriggerRefresh,
} from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  RefreshCw, ChevronDown, Printer, Sun, Moon, Download, Check, ArrowUpIcon, ArrowDownIcon
} from "lucide-react";

import { ColombiaMap } from "@/components/ColombiaMap";

const CHART_COLORS = {
  blue: "#0079F2",
  purple: "#795EFF",
  green: "#009118",
  red: "#A60808",
  pink: "#ec4899",
};

const CHART_COLOR_LIST = [
  CHART_COLORS.blue,
  CHART_COLORS.purple,
  CHART_COLORS.green,
  CHART_COLORS.red,
  CHART_COLORS.pink,
];

const DATA_SOURCES: string[] = ["App DB", "Policía Nacional"];

const INTERVAL_OPTIONS = [
  { label: "Cada 5 min", ms: 5 * 60 * 1000 },
  { label: "Cada 15 min", ms: 15 * 60 * 1000 },
  { label: "Cada 1 hora", ms: 60 * 60 * 1000 },
  { label: "Cada 24 horas", ms: 24 * 60 * 60 * 1000 },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "6px",
        padding: "10px 14px",
        border: "1px solid #e0e0e0",
        color: "#1a1a1a",
        fontSize: "13px",
      }}
    >
      <div style={{ marginBottom: "6px", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
        {payload.length === 1 && payload[0].color && payload[0].color !== "#ffffff" && (
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: payload[0].color, flexShrink: 0 }} />
        )}
        {label}
      </div>
      {payload.map((entry: any, index: number) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
          {payload.length > 1 && entry.color && entry.color !== "#ffffff" && (
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color, flexShrink: 0 }} />
          )}
          <span style={{ color: "#444" }}>{entry.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            {typeof entry.value === "number" ? entry.value.toLocaleString("es-CO") : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function CustomLegend({ payload }: any) {
  if (!payload || payload.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 16px", fontSize: "13px" }}>
      {payload.map((entry: any, index: number) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color, flexShrink: 0 }} />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [isDark, setIsDark] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIntervalMs, setSelectedIntervalMs] = useState(INTERVAL_OPTIONS[0].ms);
  
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  const [selectedCrimeType, setSelectedCrimeType] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");

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

  // Fetch data
  const { data: availableYears = [], isLoading: isLoadingYears } = useGetAvailableYears();
  
  useEffect(() => {
    if (availableYears.length > 0 && selectedYear === "all") {
      setSelectedYear(Math.max(...availableYears));
    }
  }, [availableYears, selectedYear]);

  const { data: crimeTypes = [], isLoading: isLoadingTypes } = useGetCrimeTypes();
  const { data: refreshStatus, isLoading: isLoadingStatus, dataUpdatedAt } = useGetRefreshStatus();
  
  const { mutate: triggerRefresh } = useTriggerRefresh({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
      }
    }
  });

  const queryParams = {
    year: selectedYear === "all" ? undefined : selectedYear,
    crimeType: selectedCrimeType === "all" ? undefined : selectedCrimeType,
    department: selectedDepartment === "all" ? undefined : selectedDepartment,
  };

  // We need previous year data for YoY comparison
  const prevYearParams = {
    ...queryParams,
    year: selectedYear !== "all" ? selectedYear - 1 : undefined,
  };

  const { data: monthlyData = [], isLoading: isLoadingMonthly, isFetching: isFetchingMonthly } = useGetNationalMonthly(queryParams);
  const { data: prevMonthlyData = [], isLoading: isLoadingPrevMonthly, isFetching: isFetchingPrevMonthly } = useGetNationalMonthly(prevYearParams);
  const { data: deptData = [], isLoading: isLoadingDept, isFetching: isFetchingDept } = useGetCrimesByDepartment({ year: queryParams.year, crimeType: queryParams.crimeType });

  // Sorted department list for the filter dropdown (derived from dept data)
  const availableDepartments = useMemo(() => {
    return [...new Set(deptData.map((d: any) => d.department as string))].sort((a: string, b: string) => a.localeCompare(b, "es"));
  }, [deptData]);

  // Filter dept table/map data by selected department
  const filteredDeptData = useMemo(() => {
    if (selectedDepartment === "all") return deptData;
    return deptData.filter((d: any) => d.department === selectedDepartment);
  }, [deptData, selectedDepartment]);

  const loading = isLoadingYears || isLoadingTypes || isLoadingStatus || isLoadingMonthly || isLoadingDept || isFetchingMonthly || isFetchingDept;

  useEffect(() => {
    if (loading) {
      setIsSpinning(true);
    } else {
      const t = setTimeout(() => setIsSpinning(false), 600);
      return () => clearTimeout(t);
    }
  }, [loading]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries();
    }, selectedIntervalMs);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedIntervalMs, queryClient]);

  const handleRefresh = () => {
    triggerRefresh();
  };

  const lastRefreshed = refreshStatus?.lastRefreshed
    ? (() => {
        const d = new Date(refreshStatus.lastRefreshed);
        const time = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
        const date = d.toLocaleDateString("es-CO", { month: "short", day: "numeric" });
        return `${time} del ${date}`;
      })()
    : null;

  // --- KPI Calculations ---
  const totalCrimes = monthlyData.reduce((sum, d) => sum + d.count, 0);
  const totalPrevCrimes = prevMonthlyData.reduce((sum, d) => sum + d.count, 0);
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

  // --- Chart Data Formatting ---
  const formattedMonthlyData = useMemo(() => {
    if (selectedCrimeType !== "all") {
      // Single series
      const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      const grouped = monthlyData.reduce((acc, curr) => {
        acc[curr.month - 1] = (acc[curr.month - 1] || 0) + curr.count;
        return acc;
      }, Array(12).fill(0));
      return months.map((m, i) => ({ month: m, count: grouped[i] })).filter(d => d.count > 0 || totalCrimes > 0);
    } else {
      // Multi-series
      const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      const pivot: Record<string, any>[] = months.map(m => ({ month: m }));
      monthlyData.forEach(d => {
        if (pivot[d.month - 1]) {
          pivot[d.month - 1][d.crimeTypeName] = d.count;
        }
      });
      return pivot;
    }
  }, [monthlyData, selectedCrimeType, totalCrimes]);

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
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [monthlyData, selectedCrimeType]);

  // --- Table Configuration ---
  const [sorting, setSorting] = useState<SortingState>([{ id: 'totalCount', desc: true }]);
  
  const columns: ColumnDef<DepartmentStats>[] = useMemo(() => [
    {
      id: "index",
      header: "Posición",
      cell: ({ row }) => <span className="text-muted-foreground">{row.index + 1}</span>,
    },
    {
      accessorKey: "department",
      header: "Departamento",
    },
    {
      id: "crimeType",
      header: "Tipo de Delito",
      cell: () => <span>{selectedCrimeType === "all" ? "Todos" : crimeTypes.find(c => c.id === selectedCrimeType)?.name || "Específico"}</span>,
    },
    {
      accessorKey: "totalCount",
      header: "Total Casos",
      cell: ({ row }) => <span className="font-semibold">{row.original.totalCount.toLocaleString("es-CO")}</span>,
    }
  ], [selectedCrimeType, crimeTypes]);

  const table = useReactTable({
    data: filteredDeptData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const top10DeptData = useMemo(() => {
    return table.getSortedRowModel().rows.slice(0, 10).map(r => r.original);
  }, [table]);

  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  return (
    <div className="min-h-screen bg-background px-5 py-4 pt-[32px] pb-[32px] pl-[24px] pr-[24px]">
      <div className="max-w-[1400px] mx-auto">

        {/* Header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="pt-2">
            <h1 className="font-bold text-[32px]">Estadísticas Delictivas Colombia</h1>
            <p className="text-muted-foreground mt-1.5 text-[14px]">Fuente: Policía Nacional de Colombia • Actualización mensual</p>
            
            {DATA_SOURCES.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[12px] text-muted-foreground shrink-0">Fuentes:</span>
                {DATA_SOURCES.map((source) => (
                  <span
                    key={source}
                    className="text-[12px] font-bold rounded px-2 py-0.5 truncate print:!bg-[rgb(229,231,235)] print:!text-[rgb(75,85,99)]"
                    title={source}
                    style={{
                      maxWidth: "20ch",
                      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgb(229, 231, 235)",
                      color: isDark ? "#c8c9cc" : "rgb(75, 85, 99)",
                    }}
                  >
                    {source}
                  </span>
                ))}
              </div>
            )}
            
            {lastRefreshed && <p className="text-[12px] text-muted-foreground mt-3">Última actualización: {lastRefreshed}</p>}
          </div>

          <div className="flex items-center gap-3 pt-2 print:hidden">
            <div className="relative" ref={dropdownRef}>
              <div
                className="flex items-center rounded-[6px] overflow-hidden h-[26px] text-[12px]"
                style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
              >
                <button onClick={handleRefresh} disabled={loading} className="flex items-center gap-1 px-2 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`} />
                  Refrescar
                </button>
                <div className="w-px h-4 shrink-0" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)" }} />
                <button onClick={() => setDropdownOpen((o) => !o)} className="flex items-center justify-center px-1.5 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              
              {dropdownOpen && (
                <div className="absolute right-0 top-[30px] w-48 bg-popover text-popover-foreground border shadow-md rounded-md z-50 py-1">
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-xs font-medium">Auto-refresh</span>
                    <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" />
                  </div>
                  <div className="py-1">
                    {INTERVAL_OPTIONS.map((opt) => (
                      <button
                        key={opt.ms}
                        onClick={() => setSelectedIntervalMs(opt.ms)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center justify-between"
                        disabled={!autoRefresh}
                        style={{ opacity: autoRefresh ? 1 : 0.5 }}
                      >
                        {opt.label}
                        {selectedIntervalMs === opt.ms && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => window.print()}
              disabled={loading}
              className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors disabled:opacity-50"
              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
              aria-label="Exportar como PDF"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsDark((d) => !d)}
              className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors"
              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
              aria-label="Alternar modo oscuro"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
          <div className="w-[180px]">
            <Label className="text-[13px] mb-1 block">Año</Label>
            <Select
              value={selectedYear.toString()}
              onValueChange={(val) => setSelectedYear(val === "all" ? "all" : parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar año" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los años</SelectItem>
                {availableYears.map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[240px]">
            <Label className="text-[13px] mb-1 block">Tipo de Delito</Label>
            <Select
              value={selectedCrimeType}
              onValueChange={setSelectedCrimeType}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {crimeTypes.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[240px]">
            <Label className="text-[13px] mb-1 block">Departamento</Label>
            <Select
              value={selectedDepartment}
              onValueChange={setSelectedDepartment}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos los departamentos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los departamentos</SelectItem>
                {availableDepartments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <Card>
            <CardContent className="p-6">
              {loading ? (
                <>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Total de Delitos</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: "#0079F2" }}>{totalCrimes.toLocaleString("es-CO")}</p>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              {loading ? (
                <>
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-8 w-40" />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Depto con Más Delitos</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: "#0079F2" }}>
                    {deptWithMostCrimes.department}
                  </p>
                  <p className="text-sm mt-1 text-muted-foreground">{deptWithMostCrimes.totalCount.toLocaleString("es-CO")} casos</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              {loading ? (
                <>
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-8 w-full" />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Delito Más Frecuente</p>
                  <p className="text-2xl font-bold mt-1 truncate" style={{ color: "#0079F2" }} title={mostFrequentCrime.name}>
                    {mostFrequentCrime.name}
                  </p>
                  <p className="text-sm mt-1 text-muted-foreground">{mostFrequentCrime.count.toLocaleString("es-CO")} casos</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              {loading ? (
                <>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Variación vs Año Anterior</p>
                  <div className="flex items-center gap-1 mt-1">
                    <p className="text-2xl font-bold" style={{ color: yoyChange > 0 ? "#A60808" : yoyChange < 0 ? "#009118" : "#0079F2" }}>
                      {yoyChange > 0 ? "+" : ""}{yoyChange.toFixed(1)}%
                    </p>
                    {yoyChange > 0 ? <ArrowUpIcon className="w-5 h-5 text-red-600" /> : yoyChange < 0 ? <ArrowDownIcon className="w-5 h-5 text-green-600" /> : null}
                  </div>
                  {selectedYear === "all" && <p className="text-xs text-muted-foreground mt-1">N/A al seleccionar todos los años</p>}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Tendencia Mensual</CardTitle>
              {!loading && formattedMonthlyData.length > 0 && (
                <CSVLink
                  data={formattedMonthlyData}
                  filename="tendencia-mensual.csv"
                  className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80"
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
                  aria-label="Exportar a CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="w-full h-[300px]" /> : (
                <ResponsiveContainer width="100%" height={300} debounce={0}>
                  {selectedCrimeType !== "all" ? (
                    <AreaChart data={formattedMonthlyData}>
                      <defs>
                        <linearGradient id="gradientTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART_COLORS.blue} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={CHART_COLORS.blue} stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                      <YAxis tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                      <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)', stroke: 'none' }} />
                      <Area type="monotone" dataKey="count" name="Casos" fill="url(#gradientTrend)" stroke={CHART_COLORS.blue} fillOpacity={1} strokeWidth={2} activeDot={{ r: 5, fill: CHART_COLORS.blue, stroke: '#ffffff', strokeWidth: 3 }} isAnimationActive={false} />
                    </AreaChart>
                  ) : (
                    <LineChart data={formattedMonthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                      <YAxis tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                      <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ stroke: tickColor, strokeDasharray: '3 3' }} />
                      <Legend content={<CustomLegend />} />
                      {crimeTypesInMonthlyData.map((type, idx) => (
                        <Line key={type} type="monotone" dataKey={type} name={type} stroke={CHART_COLOR_LIST[idx % CHART_COLOR_LIST.length]} strokeWidth={2} dot={false} activeDot={{ r: 5, fill: CHART_COLOR_LIST[idx % CHART_COLOR_LIST.length], stroke: '#ffffff', strokeWidth: 3 }} isAnimationActive={false} />
                      ))}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {selectedCrimeType === "all" ? (
            <Card>
              <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Comparación por Tipo de Delito</CardTitle>
                {!loading && barChartData.length > 0 && (
                  <CSVLink
                    data={barChartData}
                    filename="comparacion-delitos.csv"
                    className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80"
                    style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
                    aria-label="Exportar a CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </CSVLink>
                )}
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="w-full h-[300px]" /> : (
                  <ResponsiveContainer width="100%" height={300} debounce={0}>
                    <BarChart data={barChartData} layout="vertical" margin={{ left: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={true} vertical={false} />
                      <XAxis type="number" tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={100} tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val} />
                      <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={false} />
                      <Bar dataKey="count" name="Casos" fill={CHART_COLORS.blue} fillOpacity={0.8} activeBar={{ fillOpacity: 1 }} isAnimationActive={false} radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Distribución Geográfica</CardTitle>
                {!loading && deptData.length > 0 && (
                  <CSVLink
                    data={deptData}
                    filename="distribucion-geografica.csv"
                    className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80"
                    style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
                    aria-label="Exportar a CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </CSVLink>
                )}
              </CardHeader>
              <CardContent className="h-[300px]">
                {loading ? <Skeleton className="w-full h-full" /> : <ColombiaMap data={deptData} />}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Heat Map and Top 10 Table */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {selectedCrimeType === "all" && (
            <Card className="lg:col-span-1">
              <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Mapa de Calor</CardTitle>
                {!loading && deptData.length > 0 && (
                  <CSVLink
                    data={deptData}
                    filename="mapa-de-calor.csv"
                    className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80"
                    style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
                    aria-label="Exportar a CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </CSVLink>
                )}
              </CardHeader>
              <CardContent className="h-[400px]">
                {loading ? <Skeleton className="w-full h-full" /> : <ColombiaMap data={deptData} />}
              </CardContent>
            </Card>
          )}

          <Card className={selectedCrimeType === "all" ? "lg:col-span-2" : "lg:col-span-3"}>
            <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Top 10 Departamentos</CardTitle>
              {!loading && top10DeptData.length > 0 && (
                <CSVLink
                  data={top10DeptData}
                  filename="top-10-departamentos.csv"
                  className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80"
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
                  aria-label="Exportar a CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <TableHead key={header.id} onClick={header.column.getToggleSortingHandler()} className="cursor-pointer select-none">
                              <div className="flex items-center gap-2">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {{ asc: " 🔼", desc: " 🔽" }[header.column.getIsSorted() as string] ?? null}
                              </div>
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {table.getRowModel().rows.slice(0, 10).map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {table.getRowModel().rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={columns.length} className="h-24 text-center">
                            No se encontraron datos.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
