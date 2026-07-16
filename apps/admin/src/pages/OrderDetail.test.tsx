import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOrderDetail, AdminOrderTimelineItem } from "@/api/orders";

/**
 * Detalhe do pedido p/ suporte (story 67): cabeçalho, grupos com substituições,
 * timeline vertical e ações (cancelar / reembolso manual com teto no client).
 * Hooks mockados — a página só orquestra.
 */

const useAdminOrder = vi.fn();
const useAdminOrderTimeline = vi.fn();
const cancelMutate = vi.fn();
const refundMutate = vi.fn();
vi.mock("@/api/hooks/useAdminOrders", () => ({
  useAdminOrder: (id: string) => useAdminOrder(id) as unknown,
  useAdminOrderTimeline: (id: string) => useAdminOrderTimeline(id) as unknown,
  useCancelAdminOrder: () => ({ mutate: cancelMutate, isPending: false }),
  useManualRefund: () => ({ mutate: refundMutate, isPending: false }),
}));

import { OrderDetail, remainingRefundCents } from "./OrderDetail";

const ORDER: AdminOrderDetail = {
  id: "order123456",
  status: "on_the_way",
  createdAt: "2026-07-01T10:00:00Z",
  itemsCents: 9000,
  deliveryCents: 800,
  prepCents: 100,
  platformFeeCents: 100,
  discountCents: 500,
  totalCents: 9500,
  couponCode: "PROMO5",
  user: { name: "Ana Cliente", email: "ana@ex.com" },
  payment: { status: "paid", amountCents: 10000, provider: "mock", paidAt: "2026-07-01T10:05:00Z" },
  refund: {
    status: "processed",
    amountCents: 2000,
    components: [
      { id: "c1", orderGroupId: "g1", amountCents: 2000, reason: "manual", createdById: "adm1" },
    ],
  },
  groups: [
    {
      id: "g1",
      status: "on_the_way",
      fulfillment: "delivery",
      subtotalCents: 9000,
      deliveryCents: 800,
      prepCents: 100,
      platformFeeCents: 100,
      merchant: { name: "Rede X" },
      store: { name: "Loja Centro" },
      items: [
        {
          id: "i1",
          nameSnapshot: "Arroz 5kg",
          saleType: "unit",
          unitPriceCents: 3000,
          quantity: 2,
          weightGrams: null,
          lineTotalCents: 6000,
          pickItem: {
            status: "substituted",
            quantityPicked: null,
            weightGramsPicked: null,
            substitution: {
              nameSnapshot: "Arroz Premium 5kg",
              unitPriceCents: 3200,
              approvalStatus: "approved",
            },
          },
        },
      ],
      pickTask: { id: "t1", status: "ready_for_pickup", pickerId: "p1" },
      delivery: { id: "d1", status: "picked_up", driver: { name: "Carlos" } },
    },
  ],
};

const TIMELINE: AdminOrderTimelineItem[] = [
  { at: "2026-07-01T10:00:00.000Z", kind: "milestone.created", label: "Pedido criado", meta: null },
  {
    at: "2026-07-01T10:05:00.000Z",
    kind: "event.order.paid",
    label: "Pagamento confirmado",
    meta: { orderId: "order123456" },
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/orders/order123456"]}>
      <Routes>
        <Route path="orders/:id" element={<OrderDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockData(order: AdminOrderDetail | undefined, state: Record<string, unknown> = {}) {
  useAdminOrder.mockReturnValue({ data: order, isPending: false, isError: !order, ...state });
  useAdminOrderTimeline.mockReturnValue({ data: TIMELINE });
}

describe("OrderDetail (story 67)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData(ORDER);
  });

  it("renderiza cabeçalho (cliente, totais, pagamento, reembolso), grupo com substituição e timeline", () => {
    renderPage();
    expect(screen.getByText("Ana Cliente")).toBeInTheDocument();
    expect(screen.getByText("ana@ex.com")).toBeInTheDocument();
    expect(screen.getByText("Total: R$ 95,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 20,00 acumulado")).toBeInTheDocument();
    // grupo + item + substituição
    expect(screen.getByText(/Loja Centro/)).toBeInTheDocument();
    expect(screen.getByText("Arroz 5kg")).toBeInTheDocument();
    expect(screen.getByText(/substituído por Arroz Premium 5kg/)).toBeInTheDocument();
    // timeline vertical
    expect(screen.getByText("Pedido criado")).toBeInTheDocument();
    expect(screen.getByText("Pagamento confirmado")).toBeInTheDocument();
    // hooks recebem o id da rota
    expect(useAdminOrder).toHaveBeenCalledWith("order123456");
    expect(useAdminOrderTimeline).toHaveBeenCalledWith("order123456");
  });

  it("cancelar: confirma com motivo e dispara a mutation", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    fireEvent.change(screen.getByPlaceholderText("Ex.: cliente solicitou"), {
      target: { value: "cliente pediu" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
    await waitFor(() => {
      expect(cancelMutate).toHaveBeenCalledWith(
        { reason: "cliente pediu" },
        expect.anything(),
      );
    });
  });

  it("reembolso manual: valida o teto no client (não chama a mutation acima do teto)", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Reembolso manual" }));
    // teto restante = 10000 − 2000 = 8000
    expect(screen.getByText("Teto restante: R$ 80,00")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "999,99" } });
    fireEvent.click(screen.getByRole("button", { name: "Reembolsar" }));
    await screen.findByText(/excede o teto reembolsável/);
    expect(refundMutate).not.toHaveBeenCalled();
  });

  it("reembolso manual válido: converte R$ → centavos e dispara a mutation com grupo e nota", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Reembolso manual" }));
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "50,00" } });
    fireEvent.change(screen.getByPlaceholderText("Motivo do reembolso"), {
      target: { value: "produto avariado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reembolsar" }));
    await waitFor(() => {
      expect(refundMutate).toHaveBeenCalledWith(
        { orderGroupId: "g1", amountCents: 5000, note: "produto avariado" },
        expect.anything(),
      );
    });
  });

  it("valor inválido não passa da validação do form", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Reembolso manual" }));
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Reembolsar" }));
    await screen.findByText("Valor inválido — use o formato 12,34");
    expect(refundMutate).not.toHaveBeenCalled();
  });

  it("status terminal desabilita cancelar; teto zerado desabilita reembolso", () => {
    mockData({
      ...ORDER,
      status: "canceled",
      refund: { status: "processed", amountCents: 10000, components: [] },
    });
    renderPage();
    expect(screen.getByRole("button", { name: "Cancelar pedido" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reembolso manual" })).toBeDisabled();
    expect(screen.getByText("Pedido em status terminal não pode ser cancelado.")).toBeInTheDocument();
    expect(screen.getByText("Sem valor restante para reembolso manual.")).toBeInTheDocument();
  });

  it("pedido não encontrado", () => {
    mockData(undefined);
    renderPage();
    expect(screen.getByText("Pedido não encontrado.")).toBeInTheDocument();
  });
});

describe("remainingRefundCents", () => {
  it("pago − reembolsado (não-failed)", () => {
    expect(remainingRefundCents(ORDER)).toBe(8000);
  });

  it("refund failed não conta (nada saiu do gateway)", () => {
    expect(
      remainingRefundCents({
        ...ORDER,
        refund: { status: "failed", amountCents: 9000, components: [] },
      }),
    ).toBe(10000);
  });

  it("pedido não pago → 0", () => {
    expect(
      remainingRefundCents({
        ...ORDER,
        payment: { status: "pending", amountCents: 10000, provider: "mock", paidAt: null },
      }),
    ).toBe(0);
    expect(remainingRefundCents({ ...ORDER, payment: null })).toBe(0);
  });
});
