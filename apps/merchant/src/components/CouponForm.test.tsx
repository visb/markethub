import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildCouponPayload, CouponForm, type CouponFormValues } from "./CouponForm";

/** Formulário de cupom da rede (story 53) — react-hook-form + zod. */
describe("buildCouponPayload", () => {
  const base: CouponFormValues = {
    code: "BLACK10",
    type: "percent",
    value: "10",
    minOrderCents: "",
    validFrom: "",
    validTo: "",
    maxUses: "",
  };

  it("percent: value numérico, opcionais como null", () => {
    expect(buildCouponPayload(base)).toEqual({
      code: "BLACK10",
      type: "percent",
      value: 10,
      minOrderCents: null,
      validFrom: null,
      validTo: null,
      maxUses: null,
    });
  });

  it("free_shipping zera o value", () => {
    expect(buildCouponPayload({ ...base, type: "free_shipping", value: "" }).value).toBe(0);
  });

  it("converte opcionais preenchidos (cents, datas ISO, usos)", () => {
    const out = buildCouponPayload({
      ...base,
      type: "fixed",
      value: "500",
      minOrderCents: "2000",
      validFrom: "2026-01-01T10:00",
      validTo: "2026-02-01T10:00",
      maxUses: "50",
    });
    expect(out.value).toBe(500);
    expect(out.minOrderCents).toBe(2000);
    expect(out.maxUses).toBe(50);
    expect(out.validFrom).toBe(new Date("2026-01-01T10:00").toISOString());
    expect(out.validTo).toBe(new Date("2026-02-01T10:00").toISOString());
  });
});

describe("CouponForm", () => {
  it("esconde o campo de valor quando o tipo é frete grátis", () => {
    render(<CouponForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "free_shipping" } });
    expect(screen.queryByLabelText("Percentual (%)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Valor (centavos)")).not.toBeInTheDocument();
  });

  it("frete grátis submete com value 0", async () => {
    const onSubmit = vi.fn();
    render(<CouponForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "frete1" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "free_shipping" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = onSubmit.mock.calls[0][0] as CouponFormValues;
    expect(buildCouponPayload(values).value).toBe(0);
  });

  it("limite de usos inválido bloqueia o submit", async () => {
    const onSubmit = vi.fn();
    render(<CouponForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "usos1" } });
    fireEvent.change(screen.getByLabelText("Percentual (%)"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/Limite de usos/), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await screen.findByText("Número inválido");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("janela invertida bloqueia o submit", async () => {
    const onSubmit = vi.fn();
    render(<CouponForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "win1" } });
    fireEvent.change(screen.getByLabelText("Percentual (%)"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/Válido de/), { target: { value: "2026-02-01T10:00" } });
    fireEvent.change(screen.getByLabelText(/Válido até/), { target: { value: "2026-01-01T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await screen.findByText("Fim deve ser após o início");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cancelar dispara onCancel", () => {
    const onCancel = vi.fn();
    render(<CouponForm onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
