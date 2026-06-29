import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { marketplace, type FavoriteView, type ProductDetail } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Detalhe do produto (modal — story 31): `GET /products/:id`. `id` vazio
 * (rota ainda sem param) desliga a busca via `enabled`.
 */
export function useProductDetail(id: string | undefined) {
  const { api } = useAuth();
  const mkt = marketplace(api);

  const query = useQuery({
    queryKey: queryKeys.products.detail(id ?? ""),
    queryFn: () => mkt.productDetail(id as string),
    enabled: !!id,
  });

  return {
    product: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
  };
}

/** Favoritos de oferta do usuário (story 31). */
export function useFavorites() {
  const { api } = useAuth();
  const mkt = marketplace(api);

  const query = useQuery({
    queryKey: queryKeys.favorites.all,
    queryFn: () => mkt.favorites(),
  });

  return {
    favorites: (query.data ?? []) as FavoriteView[],
    loading: query.isLoading,
  };
}

/**
 * Alterna o favorito de uma oferta (add/remove conforme `favorite`) e invalida
 * `queryKeys.favorites.all` para a UI refletir o novo estado (story 31).
 */
export function useToggleFavorite() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ offerId, favorite }: { offerId: string; favorite: boolean }) => {
      if (favorite) await mkt.removeFavorite(offerId);
      else await mkt.addFavorite(offerId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.favorites.all }),
  });
}

/** Adiciona um item ao carrinho (story 31): tira o `addItem` solto na tela. */
export function useAddCartItem() {
  const { api } = useAuth();
  const mkt = marketplace(api);

  return useMutation({
    mutationFn: (body: { offerId: string; quantity?: number; weightGrams?: number; note?: string }) =>
      mkt.addItem(body),
  });
}

export type { ProductDetail };
