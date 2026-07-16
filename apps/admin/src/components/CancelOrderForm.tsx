import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

/**
 * Confirmação do cancelamento admin (story 67) — react-hook-form + zod
 * (CLAUDE.md). Motivo opcional; vai no payload do evento (visível na timeline).
 */
const schema = z.object({ reason: z.string() });

export type CancelOrderValues = z.infer<typeof schema>;

export function CancelOrderForm({
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  onSubmit: (input: { reason?: string }) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const { register, handleSubmit } = useForm<CancelOrderValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });

  const submit = (values: CancelOrderValues) => {
    onSubmit({ reason: values.reason.trim() || undefined });
  };

  return (
    <form className="card" onSubmit={handleSubmit(submit)}>
      <h2>Cancelar pedido</h2>
      <p className="muted">
        O pedido inteiro será cancelado e o valor pago estornado ao cliente. Esta ação não pode ser
        desfeita.
      </p>

      <label className="field">
        <span>Motivo (opcional)</span>
        <input className="input" placeholder="Ex.: cliente solicitou" {...register("reason")} />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Cancelando…" : "Confirmar cancelamento"}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel} disabled={submitting}>
          Voltar
        </button>
      </div>
    </form>
  );
}
