import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { marketplace, type AvailableCoupon, type CartView } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Cupons disponíveis no carrinho (story 74). Query central + mutations de
 * aplicar/remover que devolvem a visão atualizada do carrinho e invalidam a
 * lista (mudou o cupom aplicado → muda o destaque). Quem mexe nos itens deve
 * invalidar `queryKeys.cart.availableCoupons` também (a elegibilidade muda).
 */
export function useAvailableCoupons() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const query = useQuery({
    queryKey: queryKeys.cart.availableCoupons,
    queryFn: () => mkt.availableCoupons(),
  });
  const coupons: AvailableCoupon[] = query.data ?? [];
  return { coupons, loading: query.isLoading };
}

/** Aplica um cupom (POST /cart/coupon) e invalida a lista de disponíveis. */
export function useApplyCoupon() {
  const { api } = useAuth();
  const qc = useQueryClient();
  const mkt = marketplace(api);
  return useMutation<CartView, unknown, string>({
    mutationFn: (code: string) => mkt.applyCoupon(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cart.availableCoupons }),
  });
}

/** Remove o cupom aplicado (DELETE /cart/coupon) e invalida a lista. */
export function useRemoveCoupon() {
  const { api } = useAuth();
  const qc = useQueryClient();
  const mkt = marketplace(api);
  return useMutation<CartView, unknown, void>({
    mutationFn: () => mkt.removeCoupon(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cart.availableCoupons }),
  });
}
