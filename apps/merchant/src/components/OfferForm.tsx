import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { MerchantOffer } from "@markethub/api-client";
import type { OfferPatch } from "@/api/catalog";

/**
 * Edição de oferta (story 11) — react-hook-form + zod (CLAUDE.md). Preço em reais
 * na UI, convertido p/ centavos no submit. SALVA SÓ O DIFF: campos não alterados
 * em relação ao valor atual não vão no PATCH (regra de lockedFields — só o que o
 * admin edita trava contra o sync ERP).
 */
/** "" → "" (mantém vazio); número → number. Não coage vazio para 0. */
const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? "" : Number(v)),
  z.union([z.number().min(0, "Promo inválido"), z.literal("")]),
);

const offerSchema = z.object({
  price: z.coerce.number({ invalid_type_error: "Informe o preço" }).min(0, "Preço inválido"),
  promoPrice: optionalMoney,
  available: z.boolean(),
});
export type OfferFormValues = z.infer<typeof offerSchema>;

function toCents(reais: number): number {
  return Math.round(reais * 100);
}

function centsToReais(cents: number | null | undefined): number | "" {
  return cents == null ? "" : cents / 100;
}

/** Monta o diff entre os valores do form e a oferta atual (só o que mudou). */
export function buildOfferDiff(values: OfferFormValues, offer: MerchantOffer): OfferPatch {
  const patch: OfferPatch = {};
  const newPrice = toCents(values.price);
  if (newPrice !== offer.priceCents) patch.priceCents = newPrice;

  const newPromo = values.promoPrice === "" || values.promoPrice == null ? null : toCents(values.promoPrice);
  if (newPromo !== offer.promoPriceCents) patch.promoPriceCents = newPromo;

  if (values.available !== offer.available) patch.available = values.available;
  return patch;
}

export function OfferForm({
  offer,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  offer: MerchantOffer;
  onSubmit: (patch: OfferPatch) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OfferFormValues>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      price: offer.priceCents / 100,
      promoPrice: centsToReais(offer.promoPriceCents),
      available: offer.available,
    },
  });

  const submit = (values: OfferFormValues) => onSubmit(buildOfferDiff(values, offer));

  return (
    <form className="store-form" onSubmit={handleSubmit(submit)}>
      <h2>Editar oferta — {offer.product.name}</h2>

      <div className="field-row">
        <label className="field">
          <span>Preço (R$)</span>
          <input className="input" type="number" step="0.01" {...register("price")} />
          {errors.price && <p className="error">{errors.price.message}</p>}
        </label>
        <label className="field">
          <span>Preço promocional (R$)</span>
          <input className="input" type="number" step="0.01" {...register("promoPrice")} />
          {errors.promoPrice && <p className="error">{errors.promoPrice.message}</p>}
        </label>
      </div>

      <label className="field-check">
        <input type="checkbox" {...register("available")} />
        <span>Disponível para venda</span>
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
