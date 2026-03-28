import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface InviasClosure {
  via: string;
  department: string;
  sector: string;
  km: string;
  condition: string;
  conditionCode: "cierre_total" | "cierre_parcial" | "obra" | "derrumbe" | "otro";
  reason: string;
  alternativeRoute: string;
  startDate: string;
  endDate: string;
  indefinite: boolean;
  municipality: string;
}

export interface InviasClosuresResponse {
  closures: InviasClosure[];
  fetchedAt: string;
  source: string;
  error: string | null;
  totalCount: number;
  closureCount: number;
}

const QUERY_KEY = ["invias-closures"] as const;

export function useInviasClosures() {
  return useQuery<InviasClosuresResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch<InviasClosuresResponse>("/api/invias-closures"),
    staleTime: 2 * 60 * 60 * 1000,
    refetchInterval: 2 * 60 * 60 * 1000,
    retry: 2,
  });
}

export function useInviasClosuresByDepartment(departments: string[]) {
  const { data, ...rest } = useInviasClosures();
  const filtered = (data?.closures ?? []).filter(c =>
    departments.some(d =>
      c.department.toLowerCase().includes(d.toLowerCase()) ||
      d.toLowerCase().includes(c.department.toLowerCase())
    )
  );
  return { closures: filtered, meta: data, ...rest };
}

export function useRefreshInviasClosures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => customFetch("/api/invias-closures/refresh", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
