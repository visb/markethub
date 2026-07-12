import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateSlotInput } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { createSlot, deleteSlot, listStoreSlots } from "@/api/slots";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state dos slots de agendamento de uma loja (story 55). Backend reforça o
 * escopo (owner/administrador/gerente da loja); telas só orquestram (sem fetch
 * inline). As mutations invalidam a query da própria loja.
 */
export function useStoreSlots(storeId: string, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.slots.byStore(storeId),
    queryFn: () => listStoreSlots(api, storeId),
    enabled: (options?.enabled ?? true) && Boolean(user) && Boolean(storeId),
  });
}

export function useCreateSlot(storeId: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSlotInput) => createSlot(api, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.slots.byStore(storeId) });
    },
  });
}

export function useDeleteSlot(storeId: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => deleteSlot(api, slotId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.slots.byStore(storeId) });
    },
  });
}
