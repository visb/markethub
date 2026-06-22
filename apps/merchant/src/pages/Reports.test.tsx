import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantContextDTO } from "@markethub/api-client";

let ctx: { data?: MerchantContextDTO };
const salesArgs: unknown[] = [];
const opsArgs: unknown[] = [];

let salesData: unknown;
let opsData: unknown;
let topData: unknown;
let reviewsData: unknown;

vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ctx,
}));
vi.mock("@/api/hooks/useReports", () => ({
  useSalesReport: (f: unknown) => {
    salesArgs.push(f);
    return { data: salesData, isLoading: false };
  },
  useOperationsReport: (f: unknown) => {
    opsArgs.push(f);
    return { data: opsData, isLoading: false };
  },
  useTopProductsReport: () => ({ data: topData, isLoading: false }),
  useReviewsReport: () => ({ data: reviewsData, isLoading: false }),
}));

import { Reports } from "./Reports";

const stores = [
  { id: "s1", name: "Loja A", merchantId: "m1" },
  { id: "s2", name: "Loja B", merchantId: "m1" },
];

describe("Reports page (story 13)", () => {
  beforeEach(() => {
    ctx = { data: { role: "owner", merchantId: "m1", stores } };
    salesArgs.length = 0;
    opsArgs.length = 0;
    salesData = {
      period: { from: "x", to: "y" },
      ordersPaid: 2,
      salesCents: 6000,
      platformFeeCents: 600,
      refundsCents: 0,
      ticketCents: 3000,
      estimatedPayoutCents: 5400,
    };
    opsData = {
      period: { from: "x", to: "y" },
      ordersByStatus: { delivered: 5 },
      picking: {},
      deliveries: {},
      pendingPickups: 1,
    };
    topData = {
      period: { from: "x", to: "y" },
      items: [{ productId: "p1", name: "Arroz", quantity: 4, revenueCents: 4000 }],
    };
    reviewsData = {
      period: { from: "x", to: "y" },
      axes: [{ axis: "merchant", average: 4.5, count: 3 }],
    };
  });

  it("renderiza os números das 4 seções", () => {
    render(<Reports />);
    expect(screen.getByText("Faturamento")).toBeInTheDocument();
    expect(screen.getByText("R$ 60,00")).toBeInTheDocument(); // salesCents
    expect(screen.getByText("Top produtos")).toBeInTheDocument();
    expect(screen.getByText("Arroz")).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument(); // eixo de avaliação
    expect(screen.getByText(/4.50/)).toBeInTheDocument();
  });

  it("trocar a loja altera os filtros passados aos hooks", () => {
    render(<Reports />);
    const before = salesArgs.length;
    fireEvent.change(screen.getByLabelText("Loja"), { target: { value: "s2" } });
    const last = salesArgs[salesArgs.length - 1] as { storeId?: string };
    expect(salesArgs.length).toBeGreaterThan(before);
    expect(last.storeId).toBe("s2");
  });

  it("período custom revela os campos de data e os repassa", () => {
    render(<Reports />);
    fireEvent.change(screen.getByLabelText("Período"), { target: { value: "custom" } });
    const fromInput = screen.getByLabelText("De");
    fireEvent.change(fromInput, { target: { value: "2026-06-01" } });
    const last = salesArgs[salesArgs.length - 1] as { from?: string };
    expect(last.from).toContain("2026-06-01");
  });

  it("gerente com uma só loja não vê o seletor de loja", () => {
    ctx = { data: { role: "manager", merchantId: "m1", stores: [stores[0]] } };
    render(<Reports />);
    expect(screen.queryByLabelText("Loja")).not.toBeInTheDocument();
  });

  it("top produtos vazio mostra estado vazio", () => {
    topData = { period: { from: "x", to: "y" }, items: [] };
    render(<Reports />);
    expect(screen.getByText("Sem vendas no período.")).toBeInTheDocument();
  });
});
