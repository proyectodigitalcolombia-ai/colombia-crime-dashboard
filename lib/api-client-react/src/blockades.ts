import { useQuery, useMutation, type UseQueryOptions, type UseMutationOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface Blockade {
  id: number;
  corridorId: string | null;
  location: string;
  department: string;
  cause: string;
  status: string;
  source: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  reportedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBlockadeBody {
  corridorId?: string | null;
  location: string;
  department: string;
  cause: string;
  status?: string;
  description?: string | null;
  lat?: number | null;
  lng?: number | null;
  reportedAt?: string | null;
  expiresAt?: string | null;
}

export const GET_BLOCKADES_KEY = "getBlockades";

export function getGetBlockadesQueryKey(corridorId?: string): readonly [string, ...any[]] {
  return corridorId ? [GET_BLOCKADES_KEY, corridorId] : [GET_BLOCKADES_KEY];
}

export function useGetBlockades(
  corridorId?: string,
  options?: { query?: Partial<UseQueryOptions<Blockade[], Error>> }
) {
  return useQuery<Blockade[], Error>({
    queryKey: getGetBlockadesQueryKey(corridorId),
    queryFn: async () => {
      const url = corridorId ? `/api/blockades?corridorId=${encodeURIComponent(corridorId)}` : "/api/blockades";
      return customFetch<Blockade[]>(url);
    },
    ...options?.query,
  });
}

export function useCreateBlockade(options?: {
  mutation?: Partial<UseMutationOptions<Blockade, Error, CreateBlockadeBody>>;
}) {
  return useMutation<Blockade, Error, CreateBlockadeBody>({
    mutationFn: async (body) => customFetch<Blockade>("/api/blockades", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    ...options?.mutation,
  });
}

export function useDeleteBlockade(options?: {
  mutation?: Partial<UseMutationOptions<void, Error, number>>;
}) {
  return useMutation<void, Error, number>({
    mutationFn: async (id) => customFetch<void>(`/api/blockades/${id}`, { method: "DELETE" }),
    ...options?.mutation,
  });
}
