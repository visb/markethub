import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type { AdminReviewDTO } from "@markethub/api-client";
import { useAdminReviews, useHideReview, useUnhideReview } from "@/api/hooks/useAdminReviews";
import { useMerchantOptions } from "@/api/hooks/useMerchantOptions";
import { useDebouncedValue } from "@/lib/useDebounce";
import { HideReviewForm } from "@/components/HideReviewForm";

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

const AXIS_LABEL: Record<AdminReviewDTO["axis"], string> = {
  platform: "Plataforma",
  merchant: "Loja",
  delivery: "Entrega",
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/**
 * Moderação de avaliações (story 68): listagem plana com filtros (nota,
 * ocultas/visíveis, rede, busca no texto), linha expandível com o comentário
 * completo + resposta do lojista (56) e ação de ocultar (motivo obrigatório) /
 * reexibir. Soft-hide reversível — oculta aparece riscada com motivo e autor
 * da ocultação. Orquestra hooks + componentes; sem fetch inline (CLAUDE.md).
 */
export function Reviews() {
  const [rating, setRating] = useState("");
  const [visibility, setVisibility] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search);

  const { data: reviews, isLoading } = useAdminReviews({
    rating: rating ? Number(rating) : undefined,
    hidden: visibility === "hidden" ? true : visibility === "visible" ? false : undefined,
    merchantId: merchantId || undefined,
    q: q.trim() || undefined,
  });
  const { data: merchants } = useMerchantOptions();

  const [hideTarget, setHideTarget] = useState<AdminReviewDTO | null>(null);
  const [hideError, setHideError] = useState<string | null>(null);
  const hide = useHideReview();

  const onHideSubmit = (reason: string) => {
    if (!hideTarget) return;
    setHideError(null);
    hide.mutate(
      { id: hideTarget.id, reason },
      {
        onSuccess: () => setHideTarget(null),
        onError: (e) => setHideError(errMessage(e, "Falha ao ocultar a avaliação.")),
      },
    );
  };

  return (
    <div>
      <div className="detail-head">
        <h1>Avaliações</h1>
      </div>

      <div className="toolbar">
        <select
          className="input"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          aria-label="Filtrar por nota"
        >
          <option value="">Todas as notas</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n} ★
            </option>
          ))}
        </select>
        <select
          className="input"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          aria-label="Filtrar por visibilidade"
        >
          <option value="">Todas</option>
          <option value="visible">Visíveis</option>
          <option value="hidden">Ocultas</option>
        </select>
        <select
          className="input"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          aria-label="Filtrar por rede"
        >
          <option value="">Todas as redes</option>
          {(merchants ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Buscar no comentário…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar no texto"
        />
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Nota</th>
            <th>Comentário</th>
            <th>Autor</th>
            <th>Pedido</th>
            <th>Alvo</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(reviews ?? []).map((r) => (
            <ReviewRow key={r.id} review={r} onHide={() => setHideTarget(r)} />
          ))}
        </tbody>
      </table>
      {isLoading && <p className="muted">Carregando…</p>}
      {!isLoading && reviews && reviews.length === 0 && (
        <p className="muted">Nenhuma avaliação.</p>
      )}

      {hideTarget && (
        <HideReviewForm
          onSubmit={onHideSubmit}
          onCancel={() => setHideTarget(null)}
          submitting={hide.isPending}
          error={hideError}
        />
      )}
    </div>
  );
}

function ReviewRow({ review, onHide }: { review: AdminReviewDTO; onHide: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unhide = useUnhideReview();

  const onUnhide = () => {
    setError(null);
    unhide.mutate(review.id, {
      onError: (e) => setError(errMessage(e, "Falha ao reexibir.")),
    });
  };

  return (
    <>
      <tr className={review.hidden ? "review-hidden" : undefined}>
        <td>{review.rating} ★</td>
        <td className={review.hidden ? "review-comment-hidden" : undefined}>
          {review.comment ?? <span className="muted">(sem comentário)</span>}
        </td>
        <td>{review.authorName}</td>
        <td className="muted">{review.orderId}</td>
        <td>{review.merchantName ?? <span className="badge">{AXIS_LABEL[review.axis]}</span>}</td>
        <td>
          {review.hidden ? (
            <>
              <span className="badge badge-failed">oculta</span>
              <p className="muted">
                {review.hiddenReason} — por {review.hiddenByName ?? "admin"}
              </p>
            </>
          ) : (
            <span className="badge badge-enriched">visível</span>
          )}
        </td>
        <td>
          <div className="row-actions">
            <button className="btn-ghost" type="button" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Fechar" : "Detalhes"}
            </button>
            {review.hidden ? (
              <button
                className="btn-ghost"
                type="button"
                onClick={onUnhide}
                disabled={unhide.isPending}
              >
                Reexibir
              </button>
            ) : (
              <button className="btn-ghost" type="button" onClick={onHide}>
                Ocultar
              </button>
            )}
          </div>
          {error && <p className="error">{error}</p>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7}>
            <p>
              <strong>
                Comentário ({fmtDate(review.createdAt)}, {AXIS_LABEL[review.axis]}):
              </strong>{" "}
              {review.comment ?? "—"}
            </p>
            <p>
              <strong>Resposta do lojista:</strong> {review.replyText ?? "—"}
            </p>
            {review.hidden && (
              <p className="muted">
                Oculta em {review.hiddenAt ? fmtDate(review.hiddenAt) : "—"} por{" "}
                {review.hiddenByName ?? "admin"} — motivo: {review.hiddenReason}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
