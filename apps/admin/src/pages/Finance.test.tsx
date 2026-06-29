import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Finance } from "./Finance";

/**
 * Financeiro (admin): cards de agregados + gorjetas por entregador, filtro de
 * período (de/até). Agregações já cobertas no backend (story 28); aqui é a view.
 */
let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const FIN = {
  ordersPaid: 10,
  salesCents: 100000,
  platformFeeCents: 10000,
  refundsCents: 2000,
  tipsCents: 1500,
  tipsCount: 4,
  estimatedMerchantPayoutCents: 88000,
};
const TIPS = [{ driverId: "d1", driverName: "Zé", totalCents: 1500, count: 4 }];

function routeFor(path: string): unknown {
  if (path.includes("/admin/dashboard/finance")) return FIN;
  if (path.includes("/admin/dashboard/driver-tips")) return TIPS;
  return {};
}

describe("Finance", () => {
  beforeEach(() => {
    request = vi.fn((path: string) => Promise.resolve(routeFor(path)));
  });

  it("renderiza cards de agregados e gorjetas por entregador", async () => {
    render(<Finance />);
    await screen.findByText("R$ 1000,00"); // vendas
    expect(screen.getByText("10 pedidos")).toBeInTheDocument();
    expect(screen.getByText("Repasse estimado merchant")).toBeInTheDocument();
    expect(screen.getByText("Zé")).toBeInTheDocument();
  });

  it("aplicar filtro de período refaz os requests com from/to ISO", async () => {
    render(<Finance />);
    await screen.findByText("Zé");
    const inputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(inputs[0], { target: { value: "2026-06-01" } });
    fireEvent.change(inputs[1], { target: { value: "2026-06-30" } });
    await waitFor(() => {
      const hit = request.mock.calls.find(
        (c) => String(c[0]).includes("from=") && String(c[0]).includes("to="),
      );
      expect(hit).toBeTruthy();
    });
  });

  it("mostra 'Sem gorjetas no período.' quando a lista é vazia", async () => {
    request = vi.fn((path: string) => {
      if (path.includes("driver-tips")) return Promise.resolve([]);
      return Promise.resolve(FIN);
    });
    render(<Finance />);
    await screen.findByText("Sem gorjetas no período.");
  });
});
