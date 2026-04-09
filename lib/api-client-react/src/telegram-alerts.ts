import { useQuery, useMutation, type UseQueryOptions, type UseMutationOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface TelegramAlert {
  id: number;
  messageId: string;
  channel: string;
  rawText: string;
  eventType: string;
  department: string | null;
  via: string | null;
  km: string | null;
  locationText: string | null;
  severity: string;
  lat: number | null;
  lng: number | null;
  status: string;
  messageDate: string | null;
  processedAt: string | null;
  resolvedAt: string | null;
  autoExpireAt: string | null;
}

export interface TelegramMonitorStatus {
  lastRun: string | null;
  nextRun: string | null;
  lastInserted: number;
  totalInserted: number;
  totalResolved: number;
  errors: string[];
  running: boolean;
  messagesFound: number;
  aiAvailable: boolean;
  channel: string;
}

export const GET_TELEGRAM_ALERTS_KEY = "getTelegramAlerts";
export const GET_TELEGRAM_ALERTS_ALL_KEY = "getTelegramAlertsAll";
export const GET_TELEGRAM_STATUS_KEY = "getTelegramStatus";

export function useGetTelegramAlerts(
  options?: { query?: Partial<UseQueryOptions<TelegramAlert[], Error>> }
) {
  return useQuery<TelegramAlert[], Error>({
    queryKey: [GET_TELEGRAM_ALERTS_KEY],
    queryFn: () => customFetch<TelegramAlert[]>("/api/telegram-alerts"),
    refetchInterval: 60_000,
    ...options?.query,
  });
}

export function useGetTelegramAlertsAll(
  limit = 50,
  options?: { query?: Partial<UseQueryOptions<TelegramAlert[], Error>> }
) {
  return useQuery<TelegramAlert[], Error>({
    queryKey: [GET_TELEGRAM_ALERTS_ALL_KEY, limit],
    queryFn: () => customFetch<TelegramAlert[]>(`/api/telegram-alerts/all?limit=${limit}`),
    refetchInterval: 60_000,
    ...options?.query,
  });
}

export function useGetTelegramStatus(
  options?: { query?: Partial<UseQueryOptions<TelegramMonitorStatus, Error>> }
) {
  return useQuery<TelegramMonitorStatus, Error>({
    queryKey: [GET_TELEGRAM_STATUS_KEY],
    queryFn: () => customFetch<TelegramMonitorStatus>("/api/telegram-alerts/status"),
    refetchInterval: 30_000,
    ...options?.query,
  });
}

export function useResolveTelegramAlert(options?: {
  mutation?: Partial<UseMutationOptions<{ ok: boolean }, Error, number>>;
}) {
  return useMutation<{ ok: boolean }, Error, number>({
    mutationFn: (id) =>
      customFetch<{ ok: boolean }>(`/api/telegram-alerts/${id}/resolve`, { method: "PUT" }),
    ...options?.mutation,
  });
}

export function useTriggerTelegramScan(options?: {
  mutation?: Partial<UseMutationOptions<{ message: string }, Error, void>>;
}) {
  return useMutation<{ message: string }, Error, void>({
    mutationFn: () =>
      customFetch<{ message: string }>("/api/telegram-alerts/scan", { method: "POST" }),
    ...options?.mutation,
  });
}
