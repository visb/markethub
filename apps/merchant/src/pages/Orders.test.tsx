import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantContextDTO, MerchantOrderDTO } from "@markethub/api-client";

let ctx: { data?: MerchantContextDTO };
let ordersResult: { orders: MerchantOrderDTO[]; loading: boolean; connected: boolean };
let lastOptions: { storeId?: string; subscribeStoreIds: string[]; enabled?: boolean } | undefined;

const toggleSound = vi.fn();
let soundEnabled = false;

vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ctx,
}));
vi.mock("@/api/hooks/useMerchantOrders", () => ({
  useMerchantOrders: (opts: { storeId?: string; subscribeStoreIds: string[]; enabled?: boolean }) => {
    lastOptions = opts;
    return ordersResult;
  },
}));
vi.mock("@/api/hooks/useNewOrderAlert", () => ({
  useNewOrderAlert: () => ({ soundEnabled, toggleSound, pendingCount: 0 }),
}));
vi.mock("@/components/OrderDrawer", () => ({
  OrderDrawer: ({ groupId, onClose }: { groupId: string; onClose: () => void }) => (
    <div data-testid="drawer">
      drawer:{groupId}
      <button onClick={onClose}>fechar</button>
    </div>
  ),
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
  delivery: null,
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
    toggleSound.mockReset();
    soundEnabled = false;
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

  it("clicar no card abre o drawer de detalhe do sub-pedido", () => {
    render(<Orders />);
    expect(screen.queryByTestId("drawer")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("#123456"));
    expect(screen.getByTestId("drawer")).toHaveTextContent("drawer:g1");
    // fecha
    fireEvent.click(screen.getByText("fechar"));
    expect(screen.queryByTestId("drawer")).not.toBeInTheDocument();
  });

  it("toggle 🔔 de som chama toggleSound", () => {
    render(<Orders />);
    fireEvent.click(screen.getByLabelText("Ligar som de novos pedidos"));
    expect(toggleSound).toHaveBeenCalled();
  });

  it("card com entrega failed exibe o badge 'Falha na entrega' (story 61)", () => {
    ordersResult = {
      orders: [
        order({
          status: "on_the_way",
          delivery: { id: "d1", status: "failed", failReason: "customer_absent", failedAt: null },
        }),
      ],
      loading: false,
      connected: true,
    };
    render(<Orders />);
    expect(screen.getByText("Falha na entrega")).toBeInTheDocument();
  });

  it("card sem falha não exibe o badge", () => {
    render(<Orders />);
    expect(screen.queryByText("Falha na entrega")).not.toBeInTheDocument();
  });
});
