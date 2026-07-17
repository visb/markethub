import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantContextDTO, MerchantOrderDetailDTO } from "@markethub/api-client";

let ctx: { data?: MerchantContextDTO };
let detailResult: { data?: MerchantOrderDetailDTO; isLoading: boolean; isError: boolean };
const mutate = vi.fn();
const retryMutate = vi.fn();
let mutationState: { mutate: typeof mutate; isPending: boolean; error: unknown };
let retryState: { mutate: typeof retryMutate; isPending: boolean; error: unknown };

vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ctx,
}));
vi.mock("@/api/hooks/useMerchantOrderDetail", () => ({
  useMerchantOrderDetail: () => detailResult,
  useCancelOrderGroup: () => mutationState,
  useRetryDelivery: () => retryState,
}));

import { OrderDrawer } from "./OrderDrawer";

const detail = (over: Partial<MerchantOrderDetailDTO> = {}): MerchantOrderDetailDTO => ({
  id: "g1",
  orderId: "order123456",
  storeId: "s1",
  storeName: "Loja A",
  status: "paid",
  fulfillment: "delivery",
  createdAt: "2026-06-22T10:00:00.000Z",
  subtotalCents: 1000,
  deliveryCents: 500,
  prepCents: 0,
  platformFeeCents: 100,
  totalCents: 1600,
  pickupCode: "AB12",
  scheduledFrom: null,
  scheduledTo: null,
  payment: { status: "paid", method: "pix" },
  customer: { name: "Cliente Um", phone: null },
  items: [
    {
      id: "i1",
      name: "Arroz",
      saleType: "unit",
      quantity: 2,
      weightGrams: null,
      unitPriceCents: 500,
      lineTotalCents: 1000,
      pickStatus: "substituted",
      quantityPicked: null,
      weightGramsPicked: null,
      substitution: { name: "Arroz B", unitPriceCents: 520, priceDiffCents: 20, approvalStatus: "pending" },
    },
  ],
  timeline: {
    createdAt: "2026-06-22T10:00:00.000Z",
    paidAt: "2026-06-22T10:05:00.000Z",
    pickingStartedAt: null,
    packedAt: null,
    readyAt: null,
    pickedUpAt: null,
    deliveredAt: null,
  },
  delivery: null,
  cancelable: true,
  ...over,
});

describe("OrderDrawer", () => {
  beforeEach(() => {
    ctx = { data: { role: "owner", merchantId: "m1", stores: [], merchantSuspended: false } };
    detailResult = { data: detail(), isLoading: false, isError: false };
    mutate.mockReset();
    retryMutate.mockReset();
    mutationState = { mutate, isPending: false, error: null };
    retryState = { mutate: retryMutate, isPending: false, error: null };
  });

  it("renderiza itens, substituição, cliente e total", () => {
    render(<OrderDrawer groupId="g1" onClose={() => {}} />);
    expect(screen.getByText("Arroz")).toBeInTheDocument();
    expect(screen.getByText(/Arroz B/)).toBeInTheDocument();
    expect(screen.getByText("Substituído")).toBeInTheDocument();
    expect(screen.getByText(/Cliente Um/)).toBeInTheDocument();
    expect(screen.getByText(/Total:/)).toBeInTheDocument();
  });

  it("cancelar → confirm com motivo → dispara a mutation", async () => {
    render(<OrderDrawer groupId="g1" onClose={() => {}} />);
    fireEvent.click(screen.getByText("Cancelar sub-pedido"));
    // agora aparece o formulário de confirmação
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "sem estoque" } });
    fireEvent.click(screen.getByText("Confirmar cancelamento"));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("sem estoque", expect.anything()));
  });

  it("botão desabilitado com tooltip quando a invariante bloqueia (cancelable=false)", () => {
    detailResult = { data: detail({ cancelable: false }), isLoading: false, isError: false };
    render(<OrderDrawer groupId="g1" onClose={() => {}} />);
    const btn = screen.getByText("Cancelar sub-pedido");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", expect.stringContaining("separação já começou"));
  });

  it("sem capability orders.manage: ação de cancelar não aparece", () => {
    ctx = { data: undefined };
    render(<OrderDrawer groupId="g1" onClose={() => {}} />);
    expect(screen.queryByText("Cancelar sub-pedido")).not.toBeInTheDocument();
  });

  it("fecha pelo botão ✕", () => {
    const onClose = vi.fn();
    render(<OrderDrawer groupId="g1" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Fechar"));
    expect(onClose).toHaveBeenCalled();
  });

  // ── Falha na entrega (story 61) ──

  it("entrega failed: mostra o motivo/hora e o botão Reenviar dispara o retry", () => {
    detailResult = {
      data: detail({
        status: "on_the_way",
        delivery: {
          id: "d1",
          status: "failed",
          failReason: "customer_absent",
          failedAt: "2026-06-22T11:00:00.000Z",
        },
      }),
      isLoading: false,
      isError: false,
    };
    render(<OrderDrawer groupId="g1" onClose={() => {}} />);
    expect(screen.getByText("Falha na entrega")).toBeInTheDocument();
    expect(screen.getByText(/Cliente ausente/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Reenviar entrega"));
    expect(retryMutate).toHaveBeenCalledWith("d1");
  });

  it("sem falha: não mostra a seção de falha nem o Reenviar", () => {
    render(<OrderDrawer groupId="g1" onClose={() => {}} />);
    expect(screen.queryByText("Falha na entrega")).not.toBeInTheDocument();
    expect(screen.queryByText("Reenviar entrega")).not.toBeInTheDocument();
  });

  it("entrega failed sem capability: mostra o motivo mas não o Reenviar", () => {
    ctx = { data: undefined };
    detailResult = {
      data: detail({
        delivery: { id: "d1", status: "failed", failReason: "other", failedAt: null },
      }),
      isLoading: false,
      isError: false,
    };
    render(<OrderDrawer groupId="g1" onClose={() => {}} />);
    expect(screen.getByText("Falha na entrega")).toBeInTheDocument();
    expect(screen.queryByText("Reenviar entrega")).not.toBeInTheDocument();
  });
});
