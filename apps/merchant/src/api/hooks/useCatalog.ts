import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MerchantOffer } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import {
  createProduct,
  listOffers,
  listStocks,
  productUploadUrl,
  unlockOfferField,
  unlockStockField,
  updateOffer,
  updateProduct,
  updateStock,
  type CreateProductInput,
  type OfferFilters,
  type OfferPatch,
  type StockPatch,
  type UpdateProductInput,
} from "@/api/catalog";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state do catálogo do merchant (story 11). Ofertas/estoque escopados às
 * lojas do usuário no backend; o front filtra pela loja selecionada. As mutations
 * invalidam as query keys do recurso. Telas só orquestram — sem fetch inline.
 */

export function useOffers(filters: OfferFilters = {}, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.catalog.offers(filters),
    queryFn: () => listOffers(api, filters),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

export function useStocks(storeId?: string, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.catalog.stocks(storeId),
    queryFn: () => listStocks(api, storeId),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

/** Invalida ofertas + estoque (editar um pode refletir no outro). */
function useInvalidateCatalog() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.catalog.offersAll });
    void qc.invalidateQueries({ queryKey: queryKeys.catalog.stocksAll });
  };
}

export function useUpdateOffer() {
  const { api } = useAuth();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: OfferPatch }) => updateOffer(api, id, patch),
    onSuccess: invalidate,
  });
}

/**
 * Toggle inline de `available` da oferta (story 57) com update otimista + rollback.
 * Vira o switch na hora em todas as listas de oferta em cache (match parcial pela
 * key `offersAll`); em erro, restaura o snapshot anterior. `available` editado
 * trava contra o sync ERP (mesma semântica de lock do PATCH de oferta).
 */
export function useToggleOfferAvailable() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, available }: { id: string; available: boolean }) =>
      updateOffer(api, id, { available }),
    onMutate: async ({ id, available }) => {
      await qc.cancelQueries({ queryKey: queryKeys.catalog.offersAll });
      const snapshots = qc.getQueriesData<MerchantOffer[]>({ queryKey: queryKeys.catalog.offersAll });
      qc.setQueriesData<MerchantOffer[]>({ queryKey: queryKeys.catalog.offersAll }, (old) =>
        old?.map((o) => (o.id === id ? { ...o, available } : o)),
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.catalog.offersAll });
      void qc.invalidateQueries({ queryKey: queryKeys.catalog.stocksAll });
    },
  });
}

export function useUnlockOfferField() {
  const { api } = useAuth();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, field }: { id: string; field: string }) => unlockOfferField(api, id, field),
    onSuccess: invalidate,
  });
}

export function useUpdateStock() {
  const { api } = useAuth();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: StockPatch }) => updateStock(api, id, patch),
    onSuccess: invalidate,
  });
}

export function useUnlockStockField() {
  const { api } = useAuth();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, field }: { id: string; field: string }) => unlockStockField(api, id, field),
    onSuccess: invalidate,
  });
}

export function useCreateProduct() {
  const { api } = useAuth();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(api, input),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const { api } = useAuth();
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateProductInput }) =>
      updateProduct(api, id, patch),
    onSuccess: invalidate,
  });
}

/** Upload de imagem via presigned URL (S3/MinIO) — não sobe binário pelo backend. */
export function useProductUploadUrl() {
  const { api } = useAuth();
  return useMutation({
    mutationFn: ({ filename, contentType }: { filename: string; contentType: string }) =>
      productUploadUrl(api, filename, contentType),
  });
}
