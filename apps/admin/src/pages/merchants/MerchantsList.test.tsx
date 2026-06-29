import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MerchantsList } from "./MerchantsList";

/**
 * Listagem de mercados/redes: tabela, busca, formulário de criação.
 * Mock do ApiClient (api.request), sem rede.
 */
let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const MERCHANTS = [
  {
    id: "m1",
    name: "Rede Boa Compra",
    slug: "boa-compra",
    active: true,
    deliveryFeeCents: 700,
    platformFeeBps: 1000,
    storeCount: 3,
  },
  {
    id: "m2",
    name: "Mercado Fechado",
    slug: "fechado",
    active: false,
    deliveryFeeCents: 0,
    platformFeeBps: 500,
    storeCount: 0,
  },
];

function renderList() {
  return render(
    <MemoryRouter>
      <MerchantsList />
    </MemoryRouter>,
  );
}

describe("MerchantsList", () => {
  beforeEach(() => {
    request = vi.fn(() => Promise.resolve(MERCHANTS));
  });

  it("renderiza a tabela com formatação de taxas e badges de ativo/inativo", async () => {
    renderList();
    await screen.findByText("Rede Boa Compra");
    expect(screen.getByText("R$ 7,00")).toBeInTheDocument();
    expect(screen.getByText("10.0%")).toBeInTheDocument();
    expect(screen.getByText("ativo")).toBeInTheDocument();
    expect(screen.getByText("inativo")).toBeInTheDocument();
    // primeira carga sem search
    expect(request.mock.calls[0][0]).toContain("/admin/merchants?");
  });

  it("digitar na busca refaz o request com o termo", async () => {
    renderList();
    await screen.findByText("Rede Boa Compra");
    fireEvent.change(screen.getByPlaceholderText("Buscar nome/slug…"), {
      target: { value: "boa" },
    });
    await waitFor(() => {
      const last = String(request.mock.calls.at(-1)![0]);
      expect(last).toContain("search=boa");
    });
  });

  it("mostra 'Nenhum mercado.' quando a lista é vazia", async () => {
    request = vi.fn(() => Promise.resolve([]));
    renderList();
    await screen.findByText("Nenhum mercado.");
  });

  it("abre o formulário e cria um novo mercado", async () => {
    renderList();
    await screen.findByText("Rede Boa Compra");
    fireEvent.click(screen.getByRole("button", { name: "+ Novo mercado" }));

    fireEvent.change(screen.getByPlaceholderText("Nome"), { target: { value: "Nova Rede" } });
    fireEvent.change(screen.getByPlaceholderText("Slug (opcional)"), {
      target: { value: "nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => {
      const post = request.mock.calls.find((c) => c[1]?.method === "POST");
      expect(post).toBeTruthy();
      expect(post![1].body).toMatchObject({ name: "Nova Rede", slug: "nova" });
    });
  });

  it("exibe a mensagem de erro quando o POST falha", async () => {
    request = vi.fn((_path: string, opts?: { method?: string }) => {
      if (opts?.method === "POST") return Promise.reject(new Error("Slug duplicado"));
      return Promise.resolve(MERCHANTS);
    });
    renderList();
    await screen.findByText("Rede Boa Compra");
    fireEvent.click(screen.getByRole("button", { name: "+ Novo mercado" }));
    fireEvent.change(screen.getByPlaceholderText("Nome"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await screen.findByText("Slug duplicado");
  });
});
