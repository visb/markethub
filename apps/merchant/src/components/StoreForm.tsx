import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { MerchantStoreDetailDTO } from "@markethub/api-client";

/**
 * Formulário de loja (story 08) — react-hook-form + zod (CLAUDE.md). Lat/lng não
 * são editados aqui: o backend geocodifica o endereço (override manual fora de escopo).
 *
 * Seção "Entrega" (story 58): taxa (com "herdar da rede" ↔ null), pedido mínimo e
 * raio de cobertura. Valores monetários em reais no form → centavos no payload;
 * campo vazio = herda/sem limite (null).
 */
const storeSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome da loja"),
    externalId: z.string().trim(),
    street: z.string().trim(),
    number: z.string().trim(),
    district: z.string().trim(),
    city: z.string().trim(),
    state: z.string().trim(),
    zipCode: z.string().trim(),
    avgPrepMinutes: z.coerce.number().int().min(0, "Tempo inválido"),
    active: z.boolean(),
    // Entrega (story 58) — reais/km como texto; parse/validação abaixo.
    inheritDeliveryFee: z.boolean(),
    deliveryFeeReais: z.string().trim(),
    minOrderReais: z.string().trim(),
    deliveryRadiusKm: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (!v.inheritDeliveryFee && !isNonNegNumber(v.deliveryFeeReais, { required: true })) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryFeeReais"], message: "Taxa inválida" });
    }
    if (!isNonNegNumber(v.minOrderReais)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["minOrderReais"], message: "Pedido mínimo inválido" });
    }
    if (!isNonNegNumber(v.deliveryRadiusKm)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryRadiusKm"], message: "Raio inválido" });
    }
  });
export type StoreFormValues = z.infer<typeof storeSchema>;

/** Aceita vazio (opcional) ou número >= 0. `required` recusa vazio. */
function isNonNegNumber(raw: string, opts: { required?: boolean } = {}): boolean {
  const t = raw.trim().replace(",", ".");
  if (t === "") return !opts.required;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0;
}

function reaisToCents(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function kmToNumber(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function centsToReais(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

/** Payload limpo para a API: strings vazias viram null (campos opcionais). */
export function toStorePayload(v: StoreFormValues) {
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    name: v.name.trim(),
    externalId: orNull(v.externalId),
    street: orNull(v.street),
    number: orNull(v.number),
    district: orNull(v.district),
    city: orNull(v.city),
    state: orNull(v.state),
    zipCode: orNull(v.zipCode),
    avgPrepMinutes: v.avgPrepMinutes,
    active: v.active,
    // Entrega (story 58): "herdar" → null; campos monetários vazios → null.
    deliveryFeeCents: v.inheritDeliveryFee ? null : reaisToCents(v.deliveryFeeReais),
    minOrderCents: reaisToCents(v.minOrderReais),
    deliveryRadiusKm: kmToNumber(v.deliveryRadiusKm),
  };
}

function defaults(store?: MerchantStoreDetailDTO): StoreFormValues {
  return {
    name: store?.name ?? "",
    externalId: store?.externalId ?? "",
    street: store?.street ?? "",
    number: store?.number ?? "",
    district: store?.district ?? "",
    city: store?.city ?? "",
    state: store?.state ?? "",
    zipCode: store?.zipCode ?? "",
    avgPrepMinutes: store?.avgPrepMinutes ?? 15,
    active: store?.active ?? true,
    inheritDeliveryFee: store?.deliveryFeeCents == null,
    deliveryFeeReais: centsToReais(store?.deliveryFeeCents),
    minOrderReais: centsToReais(store?.minOrderCents),
    deliveryRadiusKm: store?.deliveryRadiusKm == null ? "" : String(store.deliveryRadiusKm),
  };
}

export function StoreForm({
  store,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  store?: MerchantStoreDetailDTO;
  onSubmit: (values: StoreFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: defaults(store),
  });

  const inheritDeliveryFee = watch("inheritDeliveryFee");
  const networkFeeReais = centsToReais(store?.merchantDeliveryFeeCents);

  return (
    <form className="store-form" onSubmit={handleSubmit(onSubmit)}>
      <h2>{store ? "Editar loja" : "Nova loja"}</h2>

      <label className="field">
        <span>Nome</span>
        <input className="input" {...register("name")} />
        {errors.name && <p className="error">{errors.name.message}</p>}
      </label>

      <label className="field">
        <span>Rua</span>
        <input className="input" {...register("street")} />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Número</span>
          <input className="input" {...register("number")} />
        </label>
        <label className="field">
          <span>Bairro</span>
          <input className="input" {...register("district")} />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Cidade</span>
          <input className="input" {...register("city")} />
        </label>
        <label className="field">
          <span>UF</span>
          <input className="input" {...register("state")} />
        </label>
        <label className="field">
          <span>CEP</span>
          <input className="input" {...register("zipCode")} />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Tempo de preparo (min)</span>
          <input className="input" type="number" {...register("avgPrepMinutes")} />
          {errors.avgPrepMinutes && <p className="error">{errors.avgPrepMinutes.message}</p>}
        </label>
        <label className="field">
          <span>ID no ERP</span>
          <input className="input" {...register("externalId")} />
        </label>
      </div>

      {/* Entrega (story 58): taxa herdada/própria, pedido mínimo e raio. */}
      <fieldset className="store-delivery">
        <legend>Entrega</legend>

        <label className="checkbox">
          <input type="checkbox" {...register("inheritDeliveryFee")} />
          <span>Herdar a taxa de entrega da rede{networkFeeReais ? ` (R$ ${networkFeeReais})` : ""}</span>
        </label>

        {!inheritDeliveryFee && (
          <label className="field">
            <span>Taxa de entrega (R$)</span>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              placeholder={networkFeeReais || "0,00"}
              {...register("deliveryFeeReais")}
            />
            {errors.deliveryFeeReais && <p className="error">{errors.deliveryFeeReais.message}</p>}
          </label>
        )}

        <div className="field-row">
          <label className="field">
            <span>Pedido mínimo (R$)</span>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              placeholder="sem mínimo"
              {...register("minOrderReais")}
            />
            {errors.minOrderReais && <p className="error">{errors.minOrderReais.message}</p>}
          </label>
          <label className="field">
            <span>Raio de entrega (km)</span>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              placeholder="sem limite"
              {...register("deliveryRadiusKm")}
            />
            {errors.deliveryRadiusKm && <p className="error">{errors.deliveryRadiusKm.message}</p>}
          </label>
        </div>
      </fieldset>

      <label className="checkbox">
        <input type="checkbox" {...register("active")} />
        <span>Loja ativa</span>
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar"}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
