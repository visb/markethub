import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Catalog } from "./Catalog";

/**
 * Listagem do catálogo: busca, filtro por status e paginação.
 * A tela usa useState/useEffect + api.request direto (desvio sistêmico do admin,
 * sem camada React Query); o teste cobre o comportamento como está.
 */
let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

function makePage(over: Partial<{ items: unknown[]; total: number; page: number }> = {}) {
  return {
    items: [
      {
        id: "p1",
        name: "Arroz Branco",
        brand: "Tio",
        gtin: "789",
        enrichmentStatus: "enriched",
        completenessScore: 90,
        category: { name: "Grãos" },
        _count: { offers: 3 },
      },
      {
        id: "p2",
        name: "Feijão",
        brand: null,
        gtin: null,
        enrichmentStatus: "pending",
        completenessScore: 20,
        category: null,
        _count: { offers: 0 },
      },
    ],
    page: 1,
    pageSize: 20,
    total: 45,
    ...over,
  };
}

function renderCatalog() {
  return render(
    <MemoryRouter>
      <Catalog />
    </MemoryRouter>,
  );
}

describe("Catalog", () => {
  beforeEach(() => {
    request = vi.fn(() => Promise.resolve(makePage()));
  });

  it("lista produtos com link, marca/gtin com fallback e contagem de ofertas", async () => {
    renderCatalog();
    const arroz = await screen.findByRole("link", { name: "Arroz Branco" });
    expect(arroz).toHaveAttribute("href", "/catalog/p1");

    const rows = screen.getAllByRole("row");
    // header + 2 produtos
    expect(rows).toHaveLength(3);
    const feijaoRow = screen.getByText("Feijão").closest("tr")!;
    // brand e gtin nulos viram "—"
    expect(within(feijaoRow).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("busca atualiza a query string e reseta para a página 1", async () => {
    renderCatalog();
    await screen.findByRole("link", { name: "Arroz Branco" });

    fireEvent.change(screen.getByPlaceholderText("Buscar nome, marca, GTIN…"), {
      target: { value: "arroz" },
    });

    await waitFor(() => {
      const last = String(request.mock.calls.at(-1)![0]);
      expect(last).toContain("search=arroz");
      expect(last).toContain("page=1");
    });
  });

  it("filtro de status entra na query string", async () => {
    renderCatalog();
    await screen.findByRole("link", { name: "Arroz Branco" });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "needs_review" } });

    await waitFor(() => {
      const last = String(request.mock.calls.at(-1)![0]);
      expect(last).toContain("status=needs_review");
    });
  });

  it("paginação: avança/volta e desabilita nos limites", async () => {
    renderCatalog();
    await screen.findByRole("link", { name: "Arroz Branco" });

    const prev = screen.getByRole("button", { name: "← Anterior" });
    const next = screen.getByRole("button", { name: "Próxima →" });
    // total 45 / pageSize 20 = 3 páginas
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);
    await waitFor(() => {
      expect(String(request.mock.calls.at(-1)![0])).toContain("page=2");
    });
    expect(screen.getByRole("button", { name: "← Anterior" })).toBeEnabled();
  });
});
