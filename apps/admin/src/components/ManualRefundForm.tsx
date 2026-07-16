import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

/**
 * Reembolso manual do suporte (story 67) — react-hook-form + zod (CLAUDE.md).
 * Valor em R$ (máscara BRL → centavos) por grupo, limitado ao teto restante
 * (pago − já reembolsado) validado também no client; nota opcional.
 */

/** "R$ 12,34" | "12,34" | "12.34" | "1.234,56" → centavos. null = inválido. */
export function parseBrlToCents(raw: string): number | null {
  const s = raw.trim().replace(/^R\$\s*/i, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

function makeSchema(remainingCents: number) {
  return z
    .object({
      orderGroupId: z.string().min(1, "Selecione o sub-pedido"),
      amount: z.string().min(1, "Informe o valor"),
      note: z.string(),
    })
    .superRefine((data, ctx) => {
      const cents = parseBrlToCents(data.amount);
      if (cents == null || cents <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "Valor inválido — use o formato 12,34",
        });
        return;
      }
      if (cents > remainingCents) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: `Valor excede o teto reembolsável (${brl(remainingCents)})`,
        });
      }
    });
}

export type ManualRefundValues = { orderGroupId: string; amount: string; note: string };

export function ManualRefundForm({
  groups,
  remainingCents,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  groups: { id: string; label: string }[];
  remainingCents: number;
  onSubmit: (input: { orderGroupId: string; amountCents: number; note?: string }) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ManualRefundValues>({
    resolver: zodResolver(makeSchema(remainingCents)),
    defaultValues: { orderGroupId: groups[0]?.id ?? "", amount: "", note: "" },
  });

  const submit = (values: ManualRefundValues) => {
    const amountCents = parseBrlToCents(values.amount)!;
    onSubmit({
      orderGroupId: values.orderGroupId,
      amountCents,
      note: values.note.trim() || undefined,
    });
  };

  return (
    <form className="card" onSubmit={handleSubmit(submit)}>
      <h2>Reembolso manual</h2>
      <p className="muted">Teto restante: {brl(remainingCents)}</p>

      <label className="field">
        <span>Sub-pedido (loja)</span>
        <select className="input" {...register("orderGroupId")}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        {errors.orderGroupId && <p className="error">{errors.orderGroupId.message}</p>}
      </label>

      <label className="field">
        <span>Valor (R$)</span>
        <input className="input" placeholder="0,00" inputMode="decimal" {...register("amount")} />
        {errors.amount && <p className="error">{errors.amount.message}</p>}
      </label>

      <label className="field">
        <span>Nota (opcional)</span>
        <input className="input" placeholder="Motivo do reembolso" {...register("note")} />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Enviando…" : "Reembolsar"}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
