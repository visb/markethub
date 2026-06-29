import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Users } from "./Users";

/**
 * Usuários/permissões (admin): listagem com filtro de papel + busca, paginação,
 * ativar/desativar e criação de funcionário com atribuição de papel/loja (RBAC).
 * ApiClient mockado, sem rede.
 */
let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const PAGE = {
  items: [
    {
      id: "u1",
      name: "Maria",
      email: "maria@x.com",
      active: true,
      roles: ["picker"],
      staff: [{ staffRole: "picker", store: "Centro", merchant: "Boa Compra" }],
    },
    {
      id: "u2",
      name: "Inativo",
      email: "off@x.com",
      active: false,
      roles: ["customer"],
      staff: [],
    },
  ],
  page: 1,
  pageSize: 20,
  total: 45,
};

const STORES = [
  { id: "s1", name: "Centro", merchant: "Boa Compra" },
  { id: "s2", name: "Sul", merchant: "Boa Compra" },
];

function routeFor(path: string): unknown {
  if (path.startsWith("/admin/users?")) return PAGE;
  if (path === "/admin/stores") return STORES;
  return {};
}

describe("Users", () => {
  beforeEach(() => {
    request = vi.fn((path: string) => Promise.resolve(routeFor(path)));
  });

  it("renderiza a lista com papéis, vínculo e badges de ativo/inativo", async () => {
    render(<Users />);
    await screen.findByText("Maria");
    expect(screen.getByText("picker@Boa Compra")).toBeInTheDocument();
    expect(screen.getByText("ativo")).toBeInTheDocument();
    expect(screen.getByText("inativo")).toBeInTheDocument();
    expect(screen.getByText(/Página 1 de 3 · 45 usuários/)).toBeInTheDocument();
  });

  it("filtra por papel e por busca refazendo o request", async () => {
    render(<Users />);
    await screen.findByText("Maria");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "picker" } });
    await waitFor(() => {
      expect(request.mock.calls.some((c) => String(c[0]).includes("role=picker"))).toBe(true);
    });
    fireEvent.change(screen.getByPlaceholderText("Buscar nome/email…"), {
      target: { value: "maria" },
    });
    await waitFor(() => {
      expect(request.mock.calls.some((c) => String(c[0]).includes("search=maria"))).toBe(true);
    });
  });

  it("ativar/desativar usuário chama POST /active", async () => {
    render(<Users />);
    await screen.findByText("Maria");
    fireEvent.click(screen.getByRole("button", { name: "ativo" }));
    await waitFor(() => {
      const post = request.mock.calls.find(
        (c) => c[1]?.method === "POST" && String(c[0]).includes("/admin/users/u1/active"),
      );
      expect(post![1].body).toEqual({ active: false });
    });
  });

  it("paginação avança e volta a página", async () => {
    render(<Users />);
    await screen.findByText("Maria");
    fireEvent.click(screen.getByRole("button", { name: "Próxima →" }));
    await waitFor(() => {
      expect(request.mock.calls.some((c) => String(c[0]).includes("page=2"))).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "← Anterior" }));
    await waitFor(() => {
      expect(
        request.mock.calls.filter((c) => String(c[0]).includes("page=1")).length,
      ).toBeGreaterThan(0);
    });
  });

  it("cria funcionário escolhendo papel e loja", async () => {
    render(<Users />);
    await screen.findByText("Maria");
    fireEvent.click(screen.getByRole("button", { name: "+ Novo funcionário" }));
    fireEvent.change(screen.getByPlaceholderText("Nome"), { target: { value: "Novo" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "novo@x.com" } });
    fireEvent.change(screen.getByPlaceholderText("Senha (mín. 8)"), {
      target: { value: "12345678" },
    });
    // o StaffForm é renderizado ANTES do filtro de papel → ordem dos selects:
    // [0] staffRole, [1] storeId (form) e [2] filtro de papel.
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "manager" } }); // staffRole
    fireEvent.change(selects[1], { target: { value: "s2" } }); // storeId
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => {
      const post = request.mock.calls.find(
        (c) => c[1]?.method === "POST" && String(c[0]) === "/admin/users",
      );
      expect(post![1].body).toMatchObject({
        name: "Novo",
        email: "novo@x.com",
        staffRole: "manager",
        storeId: "s2",
      });
    });
    await screen.findByText("Funcionário criado.");
  });

  it("mostra erro quando a criação falha", async () => {
    request = vi.fn((path: string, opts?: { method?: string }) => {
      if (opts?.method === "POST" && path === "/admin/users") {
        return Promise.reject(new Error("Email já existe"));
      }
      return Promise.resolve(routeFor(path));
    });
    render(<Users />);
    await screen.findByText("Maria");
    fireEvent.click(screen.getByRole("button", { name: "+ Novo funcionário" }));
    fireEvent.change(screen.getByPlaceholderText("Nome"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await screen.findByText("Email já existe");
  });
});
