import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface RoadCondition {
  via: string;
  department: string;
  sector: string;
  km: string;
  condition: string;
  conditionCode: "cierre_total" | "cierre_parcial" | "desvio" | "otro";
  reason: string;
  alternativeRoute: string;
  startDate: string;
  endDate: string;
  indefinite: boolean;
  responsibleEntity: string;
}

export interface RoadConditionsResponse {
  conditions: RoadCondition[];
  fetchedAt: string;
  source: string;
  error: string | null;
  totalCount: number;
  closureCount: number;
}

const QUERY_KEY = ["road-conditions"] as const;

export function useRoadConditions() {
  return useQuery<RoadConditionsResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch<RoadConditionsResponse>("/api/road-conditions"),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    retry: 2,
  });
}

export function useRoadConditionsByDepartment(departments: string[]) {
  const { data, ...rest } = useRoadConditions();

  const filtered = (data?.conditions ?? []).filter(c =>
    departments.some(dept =>
      c.department.toLowerCase().includes(dept.toLowerCase()) ||
      dept.toLowerCase().includes(c.department.toLowerCase())
    )
  );

  return { conditions: filtered, meta: data, ...rest };
}

export function useRefreshRoadConditions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => customFetch("/api/road-conditions/refresh", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
