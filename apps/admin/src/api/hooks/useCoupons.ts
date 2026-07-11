import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCreateCouponInput, UpdateCouponInput } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { createCoupon, listCoupons, removeCoupon, updateCoupon } from "@/api/coupons";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state dos cupons no admin (story 53). Lista todos (globais + por rede),
 * com filtro opcional ("global" ou um merchantId); mutations invalidam a lista.
 * Telas só orquestram — sem fetch inline (CLAUDE.md).
 */
export function useCoupons(filter?: string, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.coupons.byFilter(filter),
    queryFn: () => listCoupons(api, filter),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

function useInvalidateCoupons() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.coupons.all });
}

export function useCreateCoupon() {
  const { api } = useAuth();
  const invalidate = useInvalidateCoupons();
  return useMutation({
    mutationFn: (input: AdminCreateCouponInput) => createCoupon(api, input),
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
