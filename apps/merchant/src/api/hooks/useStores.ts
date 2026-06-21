import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MerchantStoreInput, MerchantStoreUpdateInput } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { createStore, listStores, updateStore } from "@/api/stores";
import { queryKeys } from "@/lib/queryKeys";

/** Server-state da lista detalhada de lojas (story 08). Só roda com usuário. */
export function useStores(options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.stores.all,
    queryFn: () => listStores(api),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

/** Cria uma loja e invalida a lista (owner-only — backend reforça). */
export function useCreateStore() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MerchantStoreInput) => createStore(api, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.stores.all });
    },
  });
}

/** Edita uma loja e invalida a lista. */
export function useUpdateStore(id: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: MerchantStoreUpdateInput) => updateStore(api, id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.stores.all });
    },
  });
}
