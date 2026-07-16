import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AdminDashboardSummary } from "@/api/dashboard";

/**
 * Dashboard real do admin (story 66): saudação + KPIs com delta, filas com link
 * e alertas por severidade. Hook mockado — a página só orquestra.
 */

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    user: { name: "Ana Admin", email: "ana@markethub.com", roles: ["admin"] },
  }),
}));

const useAdminDashboard = vi.fn();
vi.mock("@/api/hooks/useAdminDashboard", () => ({
  useAdminDashboard: () => useAdminDashboard() as unknown,
}));

import { Dashboard } from "./Dashboard";

const summary: AdminDashboardSummary = {
  kpis: {
    ordersPaidToday: 12,
    ordersPaidDeltaPct: 20,
    gmvTodayCents: 60000,
    gmvDeltaPct: -25,
    avgTicketCents: 5000,
    activeStores: 7,
    pausedStores: 2,
  },
  queues: {
    pickingQueuedOver15Min: 3,
    deliveriesUnassignedOver15Min: 2,
    pickupsAwaiting: 4,
    deliveriesFailedAwaitingDecision: 1,
  },
  alerts: [
    { severity: "critical", code: "OUTBOX_BACKLOG", message: "3 evento(s) parados", count: 3 },
    { severity: "warning", code: "ERP_SYNC_STALE", message: "1 rede com sync parado", count: 1 },
    { severity: "critical", code: "PAYMENTS_STUCK", message: "2 PIX vencidos", count: 2 },
  ],
};

function renderPage(state: Record<string, unknown>) {
  useAdminDashboard.mockReturnValue({ data: undefined, isPending: false, isError: false, ...state });
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard (story 66)", () => {
  it("renderiza saudação, KPIs com delta colorido e lojas ativas/pausadas", () => {
    renderPage({ data: summary });
    expect(screen.getByText("Olá, Ana Admin")).toBeInTheDocument();
    expect(screen.getByText("ana@markethub.com")).toBeInTheDocument();

    expect(screen.getByText("Pedidos pagos hoje")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("↑ 20% vs ontem")).toBeInTheDocument();

    expect(screen.getByText("GMV hoje")).toBeInTheDocument();
    expect(screen.getByText("R$ 600,00")).toBeInTheDocument();
    expect(screen.getByText("↓ 25% vs ontem")).toBeInTheDocument();

    expect(screen.getByText("Ticket médio")).toBeInTheDocument();
    expect(screen.getByText("R$ 50,00")).toBeInTheDocument();

    expect(screen.getByText("7 ativas")).toBeInTheDocument();
    expect(screen.getByText("2 pausada(s)")).toBeInTheDocument();
  });

  it("delta null (ontem zero) mostra '—'", () => {
    renderPage({
      data: {
        ...summary,
        kpis: { ...summary.kpis, ordersPaidDeltaPct: null, gmvDeltaPct: null },
      },
    });
    expect(screen.getAllByText("— vs ontem")).toHaveLength(2);
  });

  it("filas mostram contadores com link para Operations", () => {
    renderPage({ data: summary });
    expect(screen.getByText("Separação parada há +15 min")).toBeInTheDocument();
    expect(screen.getByText("Entregas sem entregador há +15 min")).toBeInTheDocument();
    expect(screen.getByText("Retiradas aguardando")).toBeInTheDocument();
    expect(screen.getByText("Entregas falhas (decisão pendente)")).toBeInTheDocument();

    const queueLinks = screen.getAllByRole("link", { name: "Ver fila" });
    expect(queueLinks).toHaveLength(4);
    for (const link of queueLinks) expect(link).toHaveAttribute("href", "/operations");
  });

  it("alertas renderizam por severidade com link para a página correspondente", () => {
    renderPage({ data: summary });
    expect(screen.getByText("3 evento(s) parados")).toBeInTheDocument();
    expect(screen.getByText("1 rede com sync parado")).toBeInTheDocument();
    expect(screen.getByText("2 PIX vencidos")).toBeInTheDocument();
    expect(screen.getAllByText("Crítico:")).toHaveLength(2);
    expect(screen.getAllByText("Atenção:")).toHaveLength(1);

    const hrefs = screen.getAllByRole("link", { name: "Ver" }).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/orders", "/erp", "/finance"]);
  });

  it("sem alertas mostra 'Tudo em ordem ✓'", () => {
    renderPage({ data: { ...summary, alerts: [] } });
    expect(screen.getByText("Tudo em ordem ✓")).toBeInTheDocument();
  });

  it("estados de carregamento e erro", () => {
    renderPage({ isPending: true });
    expect(screen.getByText("Carregando dashboard…")).toBeInTheDocument();

    renderPage({ isError: true });
    expect(screen.getByText("Erro ao carregar o dashboard.")).toBeInTheDocument();
  });
});
