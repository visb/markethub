import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type { MerchantReviewDTO } from "@markethub/api-client";
import { useReplyReview, useReviews } from "@/api/hooks/useReviews";
import { ReviewReplyForm } from "@/components/ReviewReplyForm";

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

const RATING_OPTIONS = [5, 4, 3, 2, 1] as const;

/** Estrelas em texto (nota inteira 1..5). */
function stars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

/**
 * Avaliações da rede (story 56). Owner/administrador (capability `reviews.manage`,
 * reforçada no backend) leem os comentários e respondem/editam a resposta. Filtros
 * por nota e "sem resposta". Orquestra hooks + componentes; sem fetch inline.
 */
export function Reviews() {
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [unanswered, setUnanswered] = useState(false);
  const { data: reviews, isLoading } = useReviews({ rating, unanswered });

  return (
    <section>
      <div className="page-head">
        <h1>Avaliações</h1>
      </div>

      <div className="filters">
        <label>
          Nota
          <select
            value={rating ?? ""}
            onChange={(e) => setRating(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Todas</option>
            {RATING_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r} estrela{r > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={unanswered}
            onChange={(e) => setUnanswered(e.target.checked)}
          />
          Somente sem resposta
        </label>
      </div>

      {isLoading && <p className="muted">Carregando…</p>}
      {reviews && reviews.length === 0 && <p className="muted">Nenhuma avaliação encontrada.</p>}
      {reviews && reviews.length > 0 && (
        <ul className="review-list">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewCard({ review }: { review: MerchantReviewDTO }) {
  const reply = useReplyReview();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (text: string) => {
    setError(null);
    reply.mutate(
      { id: review.id, text },
      {
        onSuccess: () => setEditing(false),
        onError: (e) => setError(errMessage(e, "Falha ao enviar resposta.")),
      },
    );
  };

  return (
    <li className="review-card" data-testid="review-card">
      <div className="review-head">
        <span className="review-stars" aria-label={`Nota ${review.rating} de 5`}>
          {stars(review.rating)}
        </span>
        <span className="muted">
          {review.authorName} · {shortDate(review.createdAt)}
        </span>
      </div>
      {review.comment && <p className="review-comment">{review.comment}</p>}

      {editing ? (
        <ReviewReplyForm
          defaultText={review.replyText ?? ""}
          submitLabel={review.replyText ? "Salvar resposta" : "Responder"}
          submitting={reply.isPending}
          error={error}
          onSubmit={onSubmit}
          onCancel={() => {
            setError(null);
            setEditing(false);
          }}
        />
      ) : review.replyText ? (
        <div className="review-reply">
          <strong>Sua resposta</strong>
          <p>{review.replyText}</p>
          <button className="btn-ghost" type="button" onClick={() => setEditing(true)}>
            Editar resposta
          </button>
        </div>
      ) : (
        <button className="btn-primary" type="button" onClick={() => setEditing(true)}>
          Responder
        </button>
      )}
    </li>
  );
}

export { stars };
