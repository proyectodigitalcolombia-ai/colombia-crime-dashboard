import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface DitraReport {
  id: number;
  email_subject: string;
  email_from: string;
  email_date: string | null;
  pdf_filename: string;
  periodo: string | null;
  fecha_reporte: string | null;
  tipo_reporte: string;
  total_accidentes: number;
  total_muertos: number;
  total_heridos: number;
  resumen_ejecutivo: string | null;
  created_at: string;
  parsed_data?: Record<string, any>;
  raw_text?: string;
}

export interface DitraMonitorStatus {
  lastRun: string | null;
  nextRun: string | null;
  running: boolean;
  errors: string[];
  totalScanned: number;
  totalInserted: number;
  inbox: string;
  configured: boolean;
}

export const GET_DITRA_REPORTS_KEY = "getDitraReports";
export const GET_DITRA_STATUS_KEY  = "getDitraStatus";

export function useGetDitraReports(
  options?: { query?: Partial<UseQueryOptions<DitraReport[], Error>> }
) {
  return useQuery<DitraReport[], Error>({
    queryKey: [GET_DITRA_REPORTS_KEY],
    queryFn: () => customFetch<DitraReport[]>("/api/ditra-reports"),
    ...options?.query,
  });
}

export function useGetDitraReport(
  id: number,
  options?: { query?: Partial<UseQueryOptions<DitraReport, Error>> }
) {
  return useQuery<DitraReport, Error>({
    queryKey: [GET_DITRA_REPORTS_KEY, id],
    queryFn: () => customFetch<DitraReport>(`/api/ditra-reports/${id}`),
    enabled: !!id,
    ...options?.query,
  });
}

export function useGetDitraStatus(
  options?: { query?: Partial<UseQueryOptions<DitraMonitorStatus, Error>> }
) {
  return useQuery<DitraMonitorStatus, Error>({
    queryKey: [GET_DITRA_STATUS_KEY],
    queryFn: () => customFetch<DitraMonitorStatus>("/api/ditra-monitor/status"),
    refetchInterval: 30000,
    ...options?.query,
  });
}
