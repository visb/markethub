import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Orders } from "./Orders";

/**
 * Pedidos (admin): tabela, chips de filtro por status com contadores e paginação.
 * ApiClient mockado, sem rede.
 */
let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const RESP = {
  items: [
    {
      id: "order123456",
      status: "paid",
      totalCents: 5000,
      createdAt: "2026-06-01T10:00:00Z",
      customer: "Cliente Um",
      paymentStatus: "paid",
      refundCents: 250,
      stores: ["Centro", "Sul"],
      fulfillments: ["delivery"],
    },
  ],
  total: 40,
  page: 1,
  pageSize: 20,
  statusCounts: { paid: 12, canceled: 3 },
};

describe("Orders", () => {
  beforeEach(() => {
    request = vi.fn(() => Promise.resolve(RESP));
  });

  it("renderiza a tabela e os contadores nos chips", async () => {
    render(<Orders />);
    await screen.findByText("Cliente Um");
    expect(screen.getByText("Centro, Sul")).toBeInTheDocument();
    expect(screen.getByText("R$ 2,50")).toBeInTheDocument(); // reembolso > 0
    expect(screen.getByText("paid (12)")).toBeInTheDocument();
    expect(screen.getByText("canceled (3)")).toBeInTheDocument();
  });

  it("filtra por status ao clicar no chip", async () => {
    render(<Orders />);
    await screen.findByText("Cliente Um");
    fireEvent.click(screen.getByText("paid (12)"));
    await waitFor(() => {
      expect(request.mock.calls.some((c) => String(c[0]).includes("status=paid"))).toBe(true);
    });
  });

  it("pagina quando total excede o pageSize", async () => {
    render(<Orders />);
    await screen.findByText("Cliente Um");
    fireEvent.click(screen.getByRole("button", { name: "próxima →" }));
    await waitFor(() => {
      expect(request.mock.calls.some((c) => String(c[0]).includes("page=2"))).toBe(true);
    });
  });
});
