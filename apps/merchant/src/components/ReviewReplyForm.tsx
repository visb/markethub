import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

/**
 * Formulário de resposta a uma avaliação (story 56) — react-hook-form + zod
 * (CLAUDE.md). Texto de 1 a 1000 chars (espelha o DTO do backend). Reutilizado
 * para responder e editar (o `defaultText` pré-preenche a resposta atual).
 */
const replySchema = z.object({
  text: z.string().trim().min(1, "Escreva uma resposta").max(1000, "Máximo de 1000 caracteres"),
});

export type ReplyFormValues = z.infer<typeof replySchema>;

export function ReviewReplyForm({
  defaultText = "",
  submitLabel = "Responder",
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  defaultText?: string;
  submitLabel?: string;
  submitting: boolean;
  error?: string | null;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReplyFormValues>({
    resolver: zodResolver(replySchema),
    defaultValues: { text: defaultText },
  });

  return (
    <form className="reply-form" onSubmit={handleSubmit((v) => onSubmit(v.text.trim()))}>
      <textarea
        rows={3}
        placeholder="Escreva uma resposta pública…"
        {...register("text")}
        disabled={submitting}
      />
      {errors.text && <p className="error">{errors.text.message}</p>}
      {error && <p className="error">{error}</p>}
      <div className="row-actions">
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : submitLabel}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
