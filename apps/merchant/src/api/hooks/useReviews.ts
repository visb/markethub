import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MerchantReviewsFilter } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { listReviews, replyReview } from "@/api/reviews";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state das avaliações da rede (story 56). A listagem é filtrável (nota,
 * sem resposta); a mutation de resposta invalida a árvore. Telas só orquestram —
 * sem fetch inline.
 */
export function useReviews(filter: MerchantReviewsFilter = {}, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.reviews.list(filter),
    queryFn: () => listReviews(api, filter),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

export function useReplyReview() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => replyReview(api, id, text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.reviews.all });
    },
  });
}
