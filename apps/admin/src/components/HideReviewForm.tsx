import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

/**
 * Modal de ocultação de avaliação (story 68) — react-hook-form + zod
 * (CLAUDE.md). Motivo OBRIGATÓRIO (trilha de por quê); soft-hide reversível,
 * o autor não é notificado.
 */
const schema = z.object({
  reason: z.string().trim().min(1, "Motivo é obrigatório"),
});

type HideReviewValues = z.infer<typeof schema>;

export function HideReviewForm({
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  onSubmit: (reason: string) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HideReviewValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Ocultar avaliação">
      <form className="card modal" onSubmit={handleSubmit((v) => onSubmit(v.reason.trim()))}>
        <h2>Ocultar avaliação</h2>
        <p className="muted">
          A avaliação some da vitrine e das médias, mas pode ser reexibida. O autor não é
          notificado.
        </p>

        <label className="field">
          <span>Motivo (obrigatório)</span>
          <input
            className="input"
            placeholder="Ex.: linguagem ofensiva"
            autoFocus
            {...register("reason")}
          />
          {errors.reason && <p className="error">{errors.reason.message}</p>}
        </label>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Ocultando…" : "Ocultar"}
          </button>
          <button className="btn-ghost" type="button" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
