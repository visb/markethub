import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCouponInput, UpdateCouponInput } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { createCoupon, listCoupons, removeCoupon, updateCoupon } from "@/api/coupons";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state dos cupons da rede (story 53). Lista por rede (escopo do usuário no
 * backend); mutations invalidam a lista. Telas só orquestram — sem fetch inline.
 */
export function useCoupons(merchantId?: string, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.coupons.byMerchant(merchantId),
    queryFn: () => listCoupons(api, merchantId),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

/** Invalida toda a árvore de cupons (qualquer filtro de rede). */
function useInvalidateCoupons() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.coupons.all });
}

export function useCreateCoupon() {
  const { api } = useAuth();
  const invalidate = useInvalidateCoupons();
  return useMutation({
    mutationFn: (input: CreateCouponInput) => createCoupon(api, input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useUpdateCoupon() {
  const { api } = useAuth();
  const invalidate = useInvalidateCoupons();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateCouponInput }) =>
      updateCoupon(api, id, patch),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useDeleteCoupon() {
  const { api } = useAuth();
  const invalidate = useInvalidateCoupons();
  return useMutation({
    mutationFn: (id: string) => removeCoupon(api, id),
    onSuccess: () => {
      void invalidate();
    },
  });
}
