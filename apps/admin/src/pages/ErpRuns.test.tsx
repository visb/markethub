import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErpRuns } from "./ErpRuns";

/** Execuções de sync ERP (admin): tabela de runs. ApiClient mockado, sem rede. */
let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const RUNS = [
  {
    id: "r1",
    storeId: "s1",
    type: "catalog",
    status: "success",
    startedAt: "2026-06-01T10:00:00Z",
    finishedAt: "2026-06-01T10:05:00Z",
    itemsProcessed: 100,
    itemsUpdated: 80,
    itemsFailed: 0,
    error: null,
  },
  {
    id: "r2",
    storeId: "s1",
    type: "price",
    status: "failed",
    startedAt: "2026-06-02T10:00:00Z",
    finishedAt: null,
    itemsProcessed: 0,
    itemsUpdated: 0,
    itemsFailed: 5,
    error: "timeout",
  },
];

describe("ErpRuns", () => {
  beforeEach(() => {
    request = vi.fn(() => Promise.resolve(RUNS));
  });

  it("renderiza a tabela de execuções com status, contadores e erro", async () => {
    render(<ErpRuns />);
    await screen.findByText("catalog");
    expect(screen.getByText("success")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("timeout")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });
});
