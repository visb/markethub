import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantContextDTO, MerchantOrderDTO } from "@markethub/api-client";

let ctx: { data?: MerchantContextDTO };
let ordersResult: { orders: MerchantOrderDTO[]; loading: boolean; connected: boolean };
let lastOptions: { storeId?: string; subscribeStoreIds: string[]; enabled?: boolean } | undefined;

vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ctx,
}));
vi.mock("@/api/hooks/useMerchantOrders", () => ({
  useMerchantOrders: (opts: { storeId?: string; subscribeStoreIds: string[]; enabled?: boolean }) => {
    lastOptions = opts;
    return ordersResult;
  },
}));

import { Orders, groupByStatus } from "./Orders";

const stores = [
  { id: "s1", name: "Loja A", merchantId: "m1" },
  { id: "s2", name: "Loja B", merchantId: "m1" },
];

const order = (over: Partial<MerchantOrderDTO> = {}): MerchantOrderDTO => ({
  id: "g1",
  orderId: "order123456",
  storeId: "s1",
  storeName: "Loja A",
  status: "preparing",
  fulfillment: "delivery",
  itemCount: 2,
  totalCents: 1500,
  pickupCode: null,
  createdAt: "2026-06-22T10:00:00.000Z",
  ...over,
});

describe("groupByStatus", () => {
  it("agrupa os pedidos por status", () => {
    const grouped = groupByStatus([
      order({ id: "a", status: "preparing" }),
      order({ id: "b", status: "preparing" }),
      order({ id: "c", status: "delivered" }),
    ]);
    expect(grouped.preparing).toHaveLength(2);
    expect(grouped.delivered).toHaveLength(1);
  });
});

describe("Orders page", () => {
  beforeEach(() => {
    ctx = { data: { role: "owner", merchantId: "m1", stores } };
    ordersResult = { orders: [order()], loading: false, connected: true };
    lastOptions = undefined;
  });

  it("passa as lojas do contexto p/ subscribe e renderiza o card no board", () => {
    render(<Orders />);
    expect(lastOptions?.subscribeStoreIds).toEqual(["s1", "s2"]);
    expect(lastOptions?.enabled).toBe(true);
    // card resumido: nº (sufixo), loja, itens, total
    expect(screen.getByText("#123456")).toBeInTheDocument();
    // "Loja A" aparece no card e como opção do filtro → usa getAllByText
    expect(screen.getAllByText("Loja A").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 itens/)).toBeInTheDocument();
    // coluna por status
    expect(screen.getByText(/Preparando/)).toBeInTheDocument();
    // indicador de tempo real
    expect(screen.getByText("Tempo real")).toBeInTheDocument();
  });

  it("filtro por loja repassa storeId ao hook", () => {
    render(<Orders />);
    fireEvent.change(screen.getByLabelText("Loja"), { target: { value: "s2" } });
    expect(lastOptions?.storeId).toBe("s2");
  });

  it("estado vazio quando não há pedidos", () => {
    ordersResult = { orders: [], loading: false, connected: true };
    render(<Orders />);
    expect(screen.getByText("Nenhum pedido ainda.")).toBeInTheDocument();
  });

  it("desconectado mostra 'Reconectando…'", () => {
    ordersResult = { orders: [order()], loading: false, connected: false };
    render(<Orders />);
    expect(screen.getByText("Reconectando…")).toBeInTheDocument();
  });
});
