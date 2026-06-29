import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketplaceCategories } from "./MarketplaceCategories";

/**
 * Categorias do marketplace (curadas): criação, alternar visibilidade, editor de
 * preparo (S6.6), remoção (com confirm) e mapeamento de categoria crua → curada.
 * Mock do ApiClient, sem rede.
 */
let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const CURATED = [
  {
    id: "c1",
    name: "Congelados",
    slug: "congelados",
    displayOrder: 1,
    visible: true,
    prepOptions: null,
    _count: { rawCategories: 2 },
  },
  {
    id: "c2",
    name: "Açougue",
    slug: "acougue",
    displayOrder: 2,
    visible: false,
    prepOptions: { label: "Como prefere o corte?", options: ["Inteiro", "Moído"] },
    _count: { rawCategories: 1 },
  },
];
const RAW = [
  { id: "r1", name: "Carnes ERP", slug: "carnes-erp", marketplaceCategoryId: "c2", _count: { products: 12 } },
  { id: "r2", name: "Sorvetes ERP", slug: "sorvetes-erp", marketplaceCategoryId: null, _count: { products: 5 } },
];

function routeFor(path: string) {
  if (path === "/admin/marketplace-categories") return Promise.resolve(CURATED);
  if (path.endsWith("/raw")) return Promise.resolve(RAW);
  return Promise.resolve({});
}

describe("MarketplaceCategories", () => {
  beforeEach(() => {
    request = vi.fn((path: string) => routeFor(path));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lista curadas e o mapeamento de cruas", async () => {
    render(<MarketplaceCategories />);
    // "Carnes ERP" é nome de categoria crua (aparece só uma vez); os nomes curados
    // aparecem também como <option> no mapeamento, então não servem de âncora única.
    await screen.findByText("Carnes ERP");
    // prepOptions já definido aparece como "label (n)"
    expect(screen.getByRole("button", { name: "Como prefere o corte? (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "definir" })).toBeInTheDocument();
  });

  it("criar categoria envia POST com nome e ordem e limpa o form", async () => {
    render(<MarketplaceCategories />);
    await screen.findByText("Carnes ERP");

    fireEvent.change(screen.getByPlaceholderText("Nome (ex.: Congelados)"), {
      target: { value: "Padaria" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => {
      const post = request.mock.calls.find(
        (c) => c[0] === "/admin/marketplace-categories" && c[1]?.method === "POST",
      );
      expect(post![1].body).toEqual({ name: "Padaria", displayOrder: 0 });
    });
  });

  it("não cria com nome em branco", async () => {
    render(<MarketplaceCategories />);
    await screen.findByText("Carnes ERP");

    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    expect(
      request.mock.calls.some((c) => c[0] === "/admin/marketplace-categories" && c[1]?.method === "POST"),
    ).toBe(false);
  });

  it("alternar visibilidade faz PATCH com visible invertido", async () => {
    render(<MarketplaceCategories />);
    await screen.findByText("Carnes ERP");

    // Congelados está visível → clicar deve enviar visible:false
    fireEvent.click(screen.getByRole("button", { name: "visível" }));

    await waitFor(() => {
      const patch = request.mock.calls.find(
        (c) => c[0] === "/admin/marketplace-categories/c1" && c[1]?.method === "PATCH",
      );
      expect(patch![1].body).toEqual({ visible: false });
    });
  });

  it("editor de preparo: abrir, salvar opções como array e PATCH", async () => {
    render(<MarketplaceCategories />);
    await screen.findByText("Carnes ERP");

    // abrir editor do Congelados (sem prepOptions → botão "definir")
    fireEvent.click(screen.getByRole("button", { name: "definir" }));

    fireEvent.change(screen.getByPlaceholderText("Rótulo (ex.: Como prefere o corte?)"), {
      target: { value: "Tamanho?" },
    });
    fireEvent.change(screen.getByPlaceholderText("Opções (ex.: Inteiro, Em pedaços, Moído)"), {
      target: { value: "P, M, G" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const patch = request.mock.calls.find(
        (c) => c[0] === "/admin/marketplace-categories/c1" && c[1]?.method === "PATCH",
      );
      expect(patch![1].body).toEqual({ prepOptions: { label: "Tamanho?", options: ["P", "M", "G"] } });
    });
  });

  it("remover confirma e dispara DELETE", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MarketplaceCategories />);
    await screen.findByText("Carnes ERP");

    // linha do Congelados (c1) ancorada pelo botão de visibilidade único "visível"
    const row = screen.getByRole("button", { name: "visível" }).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "remover" }));

    await waitFor(() => {
      const del = request.mock.calls.find(
        (c) => c[0] === "/admin/marketplace-categories/c1" && c[1]?.method === "DELETE",
      );
      expect(del).toBeTruthy();
    });
  });

  it("remover cancelado (confirm=false) não dispara DELETE", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MarketplaceCategories />);
    await screen.findByText("Carnes ERP");

    const row = screen.getByRole("button", { name: "visível" }).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "remover" }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(
      request.mock.calls.some((c) => c[1]?.method === "DELETE"),
    ).toBe(false);
  });

  it("mapeamento: vincular categoria crua faz POST assign com o id curado", async () => {
    render(<MarketplaceCategories />);
    await screen.findByText("Sorvetes ERP");

    const row = screen.getByText("Sorvetes ERP").closest("tr")!;
    fireEvent.change(within(row).getByRole("combobox"), { target: { value: "c1" } });

    await waitFor(() => {
      const post = request.mock.calls.find(
        (c) => String(c[0]).endsWith("/raw/r2/assign") && c[1]?.method === "POST",
      );
      expect(post![1].body).toEqual({ marketplaceCategoryId: "c1" });
    });
  });

  it("mapeamento: desvincular envia marketplaceCategoryId null", async () => {
    render(<MarketplaceCategories />);
    await screen.findByText("Carnes ERP");

    const row = screen.getByText("Carnes ERP").closest("tr")!;
    fireEvent.change(within(row).getByRole("combobox"), { target: { value: "" } });

    await waitFor(() => {
      const post = request.mock.calls.find(
        (c) => String(c[0]).endsWith("/raw/r1/assign") && c[1]?.method === "POST",
      );
      expect(post![1].body).toEqual({ marketplaceCategoryId: null });
    });
  });
});
