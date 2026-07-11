import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CouponType, CreateCouponInput } from "@markethub/api-client";

/**
 * Formulário de cupom da rede (story 53) — react-hook-form + zod (CLAUDE.md).
 * Cria e edita: na edição o código é imutável (`codeLocked`). Campos numéricos
 * opcionais viajam como string no form e são normalizados em `buildCouponPayload`.
 */
export const TYPE_LABEL: Record<CouponType, string> = {
  fixed: "Valor fixo (R$)",
  percent: "Percentual (%)",
  free_shipping: "Frete grátis",
};

const TYPE_OPTIONS: CouponType[] = ["fixed", "percent", "free_shipping"];

const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .refine((v) => /^[A-Z0-9_-]{3,32}$/.test(v), "Código: 3–32 letras/números/-/_"),
    type: z.enum(["fixed", "percent", "free_shipping"]),
    value: z.string(),
    minOrderCents: z.string(),
    validFrom: z.string(),
    validTo: z.string(),
    maxUses: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "percent") {
      const n = Number(data.value);
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Percentual entre 1 e 100" });
      }
    } else if (data.type === "fixed") {
      const n = Number(data.value);
      if (!Number.isInteger(n) || n <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Valor em centavos maior que zero" });
      }
    }
    for (const field of ["minOrderCents", "maxUses"] as const) {
      const raw = data[field];
      if (raw !== "") {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Número inválido" });
        }
      }
    }
    if (data.validFrom && data.validTo && new Date(data.validFrom) >= new Date(data.validTo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validTo"], message: "Fim deve ser após o início" });
    }
  });

export type CouponFormValues = z.infer<typeof couponFormSchema>;

/** Converte os valores do form (strings) para o payload da API (create). */
export function buildCouponPayload(values: CouponFormValues): CreateCouponInput {
  const toIso = (v: string) => (v ? new Date(v).toISOString() : null);
  const toNum = (v: string) => (v === "" ? null : Number(v));
  return {
    code: values.code,
    type: values.type,
    value: values.type === "free_shipping" ? 0 : Number(values.value),
    minOrderCents: toNum(values.minOrderCents),
    validFrom: toIso(values.validFrom),
    validTo: toIso(values.validTo),
    maxUses: toNum(values.maxUses),
  };
}

export function CouponForm({
  defaultValues,
  codeLocked = false,
  onSubmit,
  onCancel,
  submitting,
  error,
  submitLabel = "Cadastrar",
  title = "Novo cupom",
}: {
  defaultValues?: Partial<CouponFormValues>;
  codeLocked?: boolean;
  onSubmit: (values: CouponFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
  submitLabel?: string;
  title?: string;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CouponFormValues>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: {
      code: defaultValues?.code ?? "",
      type: defaultValues?.type ?? "percent",
      value: defaultValues?.value ?? "",
      minOrderCents: defaultValues?.minOrderCents ?? "",
      validFrom: defaultValues?.validFrom ?? "",
      validTo: defaultValues?.validTo ?? "",
      maxUses: defaultValues?.maxUses ?? "",
    },
  });

  const type = watch("type");

  return (
    <form className="store-form" onSubmit={handleSubmit(onSubmit)}>
      <h2>{title}</h2>

      <label className="field">
        <span>Código</span>
        <input className="input" {...register("code")} disabled={codeLocked} />
        {codeLocked && <small className="muted">O código não pode ser alterado.</small>}
        {errors.code && <p className="error">{errors.code.message}</p>}
      </label>

      <label className="field">
        <span>Tipo</span>
        <select className="input" {...register("type")}>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      {type !== "free_shipping" && (
        <label className="field">
          <span>{type === "percent" ? "Percentual (%)" : "Valor (centavos)"}</span>
          <input className="input" type="number" {...register("value")} />
          {errors.value && <p className="error">{errors.value.message}</p>}
        </label>
      )}

      <label className="field">
        <span>Pedido mínimo (centavos, opcional)</span>
        <input className="input" type="number" {...register("minOrderCents")} />
        {errors.minOrderCents && <p className="error">{errors.minOrderCents.message}</p>}
      </label>

      <label className="field">
        <span>Válido de (opcional)</span>
        <input className="input" type="datetime-local" {...register("validFrom")} />
      </label>

      <label className="field">
        <span>Válido até (opcional)</span>
        <input className="input" type="datetime-local" {...register("validTo")} />
        {errors.validTo && <p className="error">{errors.validTo.message}</p>}
      </label>

      <label className="field">
        <span>Limite de usos (opcional)</span>
        <input className="input" type="number" {...register("maxUses")} />
        {errors.maxUses && <p className="error">{errors.maxUses.message}</p>}
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
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
