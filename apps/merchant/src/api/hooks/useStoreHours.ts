import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateStoreClosureInput, StoreHoursEntryInput } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import {
  addStoreClosure,
  listStoreClosures,
  listStoreHours,
  removeStoreClosure,
  setStoreHours,
} from "@/api/hours";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state do horário de funcionamento + fechamentos de uma loja (story 52).
 * Owner-only no backend; telas só orquestram (sem fetch inline). Mutations
 * invalidam a própria query da loja.
 */
export function useStoreHours(storeId: string, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.storeHours.hours(storeId),
    queryFn: () => listStoreHours(api, storeId),
    enabled: (options?.enabled ?? true) && Boolean(user) && Boolean(storeId),
  });
}

export function useSetStoreHours(storeId: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hours: StoreHoursEntryInput[]) => setStoreHours(api, storeId, hours),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.storeHours.hours(storeId) });
    },
  });
}

export function useStoreClosures(storeId: string, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.storeHours.closures(storeId),
    queryFn: () => listStoreClosures(api, storeId),
    enabled: (options?.enabled ?? true) && Boolean(user) && Boolean(storeId),
  });
}

export function useAddStoreClosure(storeId: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStoreClosureInput) => addStoreClosure(api, storeId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.storeHours.closures(storeId) });
    },
  });
}

export function useRemoveStoreClosure(storeId: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (closureId: string) => removeStoreClosure(api, storeId, closureId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.storeHours.closures(storeId) });
    },
  });
}
