import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoreForm, toStorePayload, type StoreFormValues } from "./StoreForm";

const baseValues: StoreFormValues = {
  name: "  Loja  ",
  externalId: "",
  street: "Rua A",
  number: "",
  district: "",
  city: "Curitiba",
  state: "PR",
  zipCode: "",
  avgPrepMinutes: 20,
  active: false,
  inheritDeliveryFee: true,
  deliveryFeeReais: "",
  minOrderReais: "",
  deliveryRadiusKm: "",
};

describe("StoreForm (story 08)", () => {
  it("toStorePayload converte strings vazias em null e mantém preenchidas", () => {
    const payload = toStorePayload(baseValues);
    expect(payload).toEqual({
      name: "Loja",
      externalId: null,
      street: "Rua A",
      number: null,
      district: null,
      city: "Curitiba",
      state: "PR",
      zipCode: null,
      avgPrepMinutes: 20,
      active: false,
      // Entrega (story 58): herda → null.
      deliveryFeeCents: null,
      minOrderCents: null,
      deliveryRadiusKm: null,
    });
  });

  it("valida nome obrigatório (zod) e não chama onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<StoreForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Informe o nome da loja");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submete valores válidos", async () => {
    const onSubmit = vi.fn();
    render(<StoreForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Loja X" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].name).toBe("Loja X");
  });

  it("cancela ao clicar em Cancelar", () => {
    const onCancel = vi.fn();
    render(<StoreForm onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ── Entrega por loja (story 58) ──
describe("StoreForm — seção Entrega (story 58)", () => {
  it("toStorePayload: override converte reais→centavos e km", () => {
    const payload = toStorePayload({
      ...baseValues,
      name: "Loja",
      inheritDeliveryFee: false,
      deliveryFeeReais: "7,50",
      minOrderReais: "30",
      deliveryRadiusKm: "4,5",
    });
    expect(payload.deliveryFeeCents).toBe(750);
    expect(payload.minOrderCents).toBe(3000);
    expect(payload.deliveryRadiusKm).toBe(4.5);
  });

  it("toStorePayload: herdar taxa → deliveryFeeCents null mesmo com valor digitado", () => {
    const payload = toStorePayload({
      ...baseValues,
      inheritDeliveryFee: true,
      deliveryFeeReais: "9,99",
    });
    expect(payload.deliveryFeeCents).toBeNull();
  });

  it("campo de taxa aparece ao desmarcar 'herdar'; herda por padrão o esconde", () => {
    render(
      <StoreForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        store={{
          id: "s1",
          merchantId: "m1",
          name: "Loja",
          externalId: null,
          street: null,
          number: null,
          district: null,
          city: null,
          state: null,
          zipCode: null,
          latitude: null,
          longitude: null,
          avgPrepMinutes: 15,
          active: true,
          pausedAt: null,
          deliveryFeeCents: null,
          minOrderCents: null,
          deliveryRadiusKm: null,
          merchantDeliveryFeeCents: 700,
        }}
      />,
    );
    // herda por padrão → sem campo de taxa
    expect(screen.queryByLabelText("Taxa de entrega (R$)")).toBeNull();
    fireEvent.click(screen.getByLabelText(/Herdar a taxa de entrega da rede/));
    expect(screen.getByLabelText("Taxa de entrega (R$)")).toBeTruthy();
  });

  it("recusa taxa negativa (não chama onSubmit)", async () => {
    const onSubmit = vi.fn();
    render(<StoreForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Loja X" } });
    fireEvent.click(screen.getByLabelText(/Herdar a taxa de entrega da rede/));
    fireEvent.change(screen.getByLabelText("Taxa de entrega (R$)"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Taxa inválida");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("recusa raio negativo (não chama onSubmit)", async () => {
    const onSubmit = vi.fn();
    render(<StoreForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Loja X" } });
    fireEvent.change(screen.getByLabelText("Raio de entrega (km)"), { target: { value: "-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Raio inválido");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
