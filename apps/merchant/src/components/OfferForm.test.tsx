import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MerchantOffer } from "@markethub/api-client";
import { buildOfferDiff, OfferForm, type OfferFormValues } from "./OfferForm";

const offer: MerchantOffer = {
  id: "o1",
  storeId: "s1",
  storeName: "Loja A",
  product: { id: "p1", name: "Arroz", brand: "Tio", imageUrl: null, saleType: "unit", categoryId: null },
  priceCents: 1000,
  promoPriceCents: null,
  available: true,
  lockedFields: [],
  stock: null,
};

describe("buildOfferDiff (story 11) — só o diff", () => {
  it("vazio quando nada mudou", () => {
    const values: OfferFormValues = { price: 10, promoPrice: "", available: true };
    expect(buildOfferDiff(values, offer)).toEqual({});
  });

  it("inclui só o preço quando só o preço muda", () => {
    const values: OfferFormValues = { price: 12, promoPrice: "", available: true };
    expect(buildOfferDiff(values, offer)).toEqual({ priceCents: 1200 });
  });

  it("define promoPriceCents (reais → centavos) quando preenchido", () => {
    const values: OfferFormValues = { price: 10, promoPrice: 8.5, available: true };
    expect(buildOfferDiff(values, offer)).toEqual({ promoPriceCents: 850 });
  });

  it("zera promo (null) quando havia promo e o campo é esvaziado", () => {
    const withPromo = { ...offer, promoPriceCents: 850 };
    const values: OfferFormValues = { price: 10, promoPrice: "", available: true };
    expect(buildOfferDiff(values, withPromo)).toEqual({ promoPriceCents: null });
  });

  it("inclui available quando alternado", () => {
    const values: OfferFormValues = { price: 10, promoPrice: "", available: false };
    expect(buildOfferDiff(values, offer)).toEqual({ available: false });
  });
});

describe("OfferForm (story 11)", () => {
  it("submete só o diff (preço alterado)", async () => {
    const onSubmit = vi.fn();
    render(<OfferForm offer={offer} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Preço (R$)"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ priceCents: 1500 });
  });

  it("cancela", () => {
    const onCancel = vi.fn();
    render(<OfferForm offer={offer} onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
