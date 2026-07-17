import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildAdminCouponPayload, CouponForm, type CouponFormValues } from "./CouponForm";

const merchants = [
  { id: "m1", name: "Rede A" },
  { id: "m2", name: "Rede B" },
];

/** Formulário de cupom no admin (story 53) — react-hook-form + zod. */
describe("buildAdminCouponPayload", () => {
  const base: CouponFormValues = {
    code: "GLOBAL10",
    title: "Global 10%",
    description: "",
    type: "percent",
    value: "10",
    merchantId: "",
    minOrderCents: "",
    validFrom: "",
    validTo: "",
    maxUses: "",
  };

  it("merchantId vazio vira null (global)", () => {
    expect(buildAdminCouponPayload(base).merchantId).toBeNull();
  });

  it("title trimado; description vazia vira null, preenchida trimada (story 73)", () => {
    expect(
      buildAdminCouponPayload({ ...base, title: "  Promo  ", description: "  detalhe  " }),
    ).toMatchObject({ title: "Promo", description: "detalhe" });
    expect(buildAdminCouponPayload({ ...base, description: "  " }).description).toBeNull();
  });

  it("merchantId selecionado é preservado", () => {
    expect(buildAdminCouponPayload({ ...base, merchantId: "m1" }).merchantId).toBe("m1");
  });

  it("free_shipping zera o value; opcionais convertidos", () => {
    const out = buildAdminCouponPayload({
      ...base,
      type: "free_shipping",
      value: "",
      minOrderCents: "1000",
      maxUses: "20",
    });
    expect(out.value).toBe(0);
    expect(out.minOrderCents).toBe(1000);
    expect(out.maxUses).toBe(20);
  });
});

describe("CouponForm admin", () => {
  it("esconde o valor no frete grátis", () => {
    render(<CouponForm merchants={merchants} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "free_shipping" } });
    expect(screen.queryByLabelText("Valor (centavos)")).not.toBeInTheDocument();
  });

  it("submete cupom válido para uma rede", async () => {
    const onSubmit = vi.fn();
    render(<CouponForm merchants={merchants} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "rede9" } });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Rede 9%" } });
    fireEvent.change(screen.getByLabelText("Rede"), { target: { value: "m2" } });
    fireEvent.change(screen.getByLabelText("Percentual (%)"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar cupom" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = onSubmit.mock.calls[0][0] as CouponFormValues;
    expect(buildAdminCouponPayload(values)).toMatchObject({ merchantId: "m2", value: 9 });
  });

  it("valor fixo inválido bloqueia o submit", async () => {
    const onSubmit = vi.fn();
    render(<CouponForm merchants={merchants} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "fix1" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "fixed" } });
    fireEvent.change(screen.getByLabelText("Valor (centavos)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar cupom" }));
    await screen.findByText("Valor em centavos maior que zero");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("título obrigatório bloqueia o submit (story 73)", async () => {
    const onSubmit = vi.fn();
    render(<CouponForm merchants={merchants} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "semtit" } });
    fireEvent.change(screen.getByLabelText("Percentual (%)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar cupom" }));
    await screen.findByText("Informe um título");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cancelar dispara onCancel", () => {
    const onCancel = vi.fn();
    render(<CouponForm merchants={merchants} onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
