import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pedidos (admin, story 67): migrado a React Query; tabela, chips de filtro por
 * status, paginação, busca do suporte com debounce e link p/ o detalhe.
 * ApiClient mockado, sem rede.
 */
const request = vi.fn();
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: { request } }),
}));

import { Orders } from "./Orders";

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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Orders />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Orders (story 67 — React Query + busca)", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation(() => Promise.resolve(RESP));
  });

  it("renderiza a tabela, contadores nos chips e link p/ o detalhe", async () => {
    renderPage();
    await screen.findByText("Cliente Um");
    expect(screen.getByText("Centro, Sul")).toBeInTheDocument();
    expect(screen.getByText("R$ 2,50")).toBeInTheDocument(); // reembolso > 0
    expect(screen.getByText("paid (12)")).toBeInTheDocument();
    expect(screen.getByText("canceled (3)")).toBeInTheDocument();
    // link do id p/ o detalhe profundo
    expect(screen.getByRole("link", { name: "#order1" })).toHaveAttribute(
      "href",
      "/orders/order123456",
    );
  });

  it("filtra por status ao clicar no chip", async () => {
    renderPage();
    await screen.findByText("Cliente Um");
    fireEvent.click(screen.getByText("paid (12)"));
    await waitFor(() => {
      expect(request.mock.calls.some((c) => String(c[0]).includes("status=paid"))).toBe(true);
    });
  });

  it("pagina quando total excede o pageSize", async () => {
    renderPage();
    await screen.findByText("Cliente Um");
    fireEvent.click(screen.getByRole("button", { name: "próxima →" }));
    await waitFor(() => {
      expect(request.mock.calls.some((c) => String(c[0]).includes("page=2"))).toBe(true);
    });
  });

  it("busca com debounce: não dispara por tecla, só depois da pausa", async () => {
    renderPage();
    await screen.findByText("Cliente Um");
    const initialCalls = request.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Buscar pedidos"), {
      target: { value: "ana@ex.com" },
    });
    // imediatamente após digitar, nada de nova request (debounce segurando)
    expect(request.mock.calls.length).toBe(initialCalls);

    await waitFor(
      () => {
        expect(
          request.mock.calls.some((c) => String(c[0]).includes("q=ana%40ex.com")),
        ).toBe(true);
      },
      { timeout: 2000 },
    );
  });
});
