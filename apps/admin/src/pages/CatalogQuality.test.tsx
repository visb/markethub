import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogQuality } from "./CatalogQuality";

/**
 * Qualidade do catálogo: resumo (score/status/distribuição), lista de incompletos
 * priorizados e reenfileiramento (geral e por produto). Mock do ApiClient, sem rede.
 */
let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const SUMMARY = {
  total: 120,
  avgScore: 67,
  byStatus: { enriched: 80, pending: 30, needs_review: 10 },
  distribution: [
    { label: "0-20", count: 5 },
    { label: "21-40", count: 10 },
    { label: "41-60", count: 25 },
  ],
};
const INCOMPLETE = [
  {
    id: "p1",
    name: "Leite",
    brand: "Boa Vaca",
    gtin: null,
    hasImage: false,
    completenessScore: 30,
    enrichmentStatus: "pending",
    category: "Laticínios",
    missing: ["imagem", "gtin"],
  },
  {
    id: "p2",
    name: "Sal",
    brand: null,
    gtin: "111",
    hasImage: true,
    completenessScore: 40,
    enrichmentStatus: "needs_review",
    category: null,
    missing: [],
  },
];

function routeFor(path: string) {
  if (path.startsWith("/catalog-quality/summary")) return Promise.resolve(SUMMARY);
  if (path.startsWith("/catalog-quality/incomplete")) return Promise.resolve(INCOMPLETE);
  return Promise.resolve({});
}

describe("CatalogQuality", () => {
  beforeEach(() => {
    request = vi.fn((path: string) => routeFor(path));
  });

  it("renderiza o resumo, distribuição e a lista de incompletos", async () => {
    render(<CatalogQuality />);
    await screen.findByText("67/100");
    expect(screen.getByText("120 produtos")).toBeInTheDocument();
    expect(screen.getByText("0-20")).toBeInTheDocument();
    // produto com marca exibe "nome · marca"; faltando lista os campos
    expect(screen.getByText("Leite · Boa Vaca")).toBeInTheDocument();
    expect(screen.getByText("imagem, gtin")).toBeInTheDocument();
    // sem categoria e sem faltando viram "—"
    expect(screen.getByText("Sal")).toBeInTheDocument();
  });

  it("reenfileirar pendentes chama POST sem productId", async () => {
    render(<CatalogQuality />);
    await screen.findByText("67/100");

    fireEvent.click(screen.getByRole("button", { name: "Reenriquecer pendentes" }));

    await waitFor(() => {
      const post = request.mock.calls.find(
        (c) => c[1]?.method === "POST" && String(c[0]).includes("/requeue"),
      );
      expect(post).toBeTruthy();
      expect(post![1].body).toEqual({});
    });
  });

  it("reenfileirar por produto envia o productId", async () => {
    render(<CatalogQuality />);
    await screen.findByText("Leite · Boa Vaca");

    const leiteRow = screen.getByText("Leite · Boa Vaca").closest("tr")!;
    fireEvent.click(
      leiteRow.querySelector("button")!,
    );

    await waitFor(() => {
      const post = request.mock.calls.find(
        (c) => c[1]?.method === "POST" && c[1]?.body?.productId,
      );
      expect(post![1].body).toEqual({ productId: "p1" });
    });
  });
});
