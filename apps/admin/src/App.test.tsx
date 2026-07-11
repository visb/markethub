import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

/**
 * Story 37 — router/shell: a árvore de rotas resolve a tela conforme o papel.
 * RoleHome e AdminOnly mandam o manager p/ a área da loja; o admin acessa as
 * telas globais. Páginas reais são stubadas (escopo das stories 38/39).
 */

const authState = {
  user: { name: "Fulano", roles: ["admin"] } as { name: string; roles: string[] } | null,
  loading: false,
  logout: vi.fn(),
};
vi.mock("@/auth/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => authState,
}));

vi.mock("@/pages/Login", () => ({ Login: () => <div>PAGE:Login</div> }));
vi.mock("@/pages/Dashboard", () => ({ Dashboard: () => <div>PAGE:Dashboard</div> }));
vi.mock("@/pages/Orders", () => ({ Orders: () => <div>PAGE:Orders</div> }));
vi.mock("@/pages/Operations", () => ({ Operations: () => <div>PAGE:Operations</div> }));
vi.mock("@/pages/Finance", () => ({ Finance: () => <div>PAGE:Finance</div> }));
vi.mock("@/pages/CatalogQuality", () => ({ CatalogQuality: () => <div>PAGE:CatalogQuality</div> }));
vi.mock("@/pages/Catalog", () => ({ Catalog: () => <div>PAGE:Catalog</div> }));
vi.mock("@/pages/ProductDetail", () => ({ ProductDetail: () => <div>PAGE:ProductDetail</div> }));
vi.mock("@/pages/ErpRuns", () => ({ ErpRuns: () => <div>PAGE:ErpRuns</div> }));
vi.mock("@/pages/Users", () => ({ Users: () => <div>PAGE:Users</div> }));
vi.mock("@/pages/MarketplaceCategories", () => ({
  MarketplaceCategories: () => <div>PAGE:Categories</div>,
}));
vi.mock("@/pages/merchant/Offers", () => ({ Offers: () => <div>PAGE:Offers</div> }));
vi.mock("@/pages/merchant/Stock", () => ({ Stock: () => <div>PAGE:Stock</div> }));
vi.mock("@/pages/merchant/Products", () => ({ Products: () => <div>PAGE:Products</div> }));
vi.mock("@/pages/merchants/MerchantsList", () => ({
  MerchantsList: () => <div>PAGE:MerchantsList</div>,
}));
vi.mock("@/pages/merchants/MerchantDetail", () => ({
  MerchantDetail: () => <div>PAGE:MerchantDetail</div>,
}));
vi.mock("@/pages/merchants/StoreDetail", () => ({
  StoreDetail: () => <div>PAGE:StoreDetail</div>,
}));
vi.mock("@/pages/Coupons", () => ({ Coupons: () => <div>PAGE:Coupons</div> }));

function renderAppAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("App router", () => {
  beforeEach(() => {
    authState.user = { name: "Fulano", roles: ["admin"] };
    authState.loading = false;
  });

  it("renderiza a tela de login em /login", () => {
    authState.user = null;
    renderAppAt("/login");
    expect(screen.getByText("PAGE:Login")).toBeInTheDocument();
  });

  it("admin na raiz vê o dashboard", () => {
    renderAppAt("/");
    expect(screen.getByText("PAGE:Dashboard")).toBeInTheDocument();
  });

  it("manager na raiz é redirecionado para a área da loja", () => {
    authState.user = { name: "Gerente", roles: ["merchant"] };
    renderAppAt("/");
    expect(screen.getByText("PAGE:Offers")).toBeInTheDocument();
    expect(screen.queryByText("PAGE:Dashboard")).not.toBeInTheDocument();
  });

  it("admin acessa uma tela global (AdminOnly)", () => {
    renderAppAt("/merchants");
    expect(screen.getByText("PAGE:MerchantsList")).toBeInTheDocument();
  });

  it("manager é barrado nas telas globais e cai na área da loja", () => {
    authState.user = { name: "Gerente", roles: ["merchant"] };
    renderAppAt("/users");
    expect(screen.getByText("PAGE:Offers")).toBeInTheDocument();
    expect(screen.queryByText("PAGE:Users")).not.toBeInTheDocument();
  });

  it("rota desconhecida cai na raiz", () => {
    renderAppAt("/rota-inexistente");
    expect(screen.getByText("PAGE:Dashboard")).toBeInTheDocument();
  });
});
