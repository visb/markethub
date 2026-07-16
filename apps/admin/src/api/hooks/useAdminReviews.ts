import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminReviewsFilter } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { hideReview, listAdminReviews, unhideReview } from "@/api/reviews";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state da moderação de avaliações no admin (story 68). Listagem plana
 * com filtros (nota, ocultas/visíveis, rede, busca no texto); hide/unhide
 * invalidam a lista. Telas só orquestram — sem fetch inline (CLAUDE.md).
 */
export function useAdminReviews(filter: AdminReviewsFilter = {}, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.adminReviews.list(filter),
    queryFn: () => listAdminReviews(api, filter),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

function useInvalidateAdminReviews() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.adminReviews.all });
}

/** Oculta (soft-hide) com motivo obrigatório — reversível via useUnhideReview. */
export function useHideReview() {
  const { api } = useAuth();
  const invalidate = useInvalidateAdminReviews();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => hideReview(api, id, reason),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useUnhideReview() {
  const { api } = useAuth();
  const invalidate = useInvalidateAdminReviews();
  return useMutation({
    mutationFn: (id: string) => unhideReview(api, id),
    onSuccess: () => {
      void invalidate();
    },
  });
}
