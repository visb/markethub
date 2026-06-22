import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateMerchantStaffInput,
  UpdateMerchantStaffInput,
} from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { createStaff, listStaff, removeStaff, updateStaff } from "@/api/staff";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state dos colaboradores (story 10). Lista por loja (escopo do usuário no
 * backend); mutations invalidam a lista. Telas só orquestram — sem fetch inline.
 */
export function useStaff(storeId?: string, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.staff.byStore(storeId),
    queryFn: () => listStaff(api, storeId),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

/** Invalida toda a árvore de staff (qualquer filtro de loja). */
function useInvalidateStaff() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.staff.all });
}

export function useCreateStaff() {
  const { api } = useAuth();
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: (input: CreateMerchantStaffInput) => createStaff(api, input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useUpdateStaff() {
  const { api } = useAuth();
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMerchantStaffInput }) =>
      updateStaff(api, id, patch),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useRemoveStaff() {
  const { api } = useAuth();
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: ({ id, hard }: { id: string; hard?: boolean }) => removeStaff(api, id, hard),
    onSuccess: () => {
      void invalidate();
    },
  });
}
