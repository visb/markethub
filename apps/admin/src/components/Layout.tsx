import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { to: "/", label: "Visão geral", end: true },
  { to: "/merchants", label: "Mercados" },
  { to: "/orders", label: "Pedidos" },
  { to: "/operations", label: "Operação" },
  { to: "/finance", label: "Financeiro" },
  { to: "/catalog", label: "Catálogo" },
  { to: "/catalog-quality", label: "Qualidade" },
  { to: "/categories", label: "Categorias" },
  { to: "/users", label: "Usuários" },
  { to: "/erp", label: "Integração ERP" },
];

const MERCHANT_NAV: NavItem[] = [
  { to: "/merchant/offers", label: "Ofertas" },
  { to: "/merchant/stock", label: "Estoque" },
  { to: "/merchant/products", label: "Produtos" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.roles.includes("admin");
  const nav = isAdmin ? ADMIN_NAV : MERCHANT_NAV;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">MarketHub</div>
        <nav>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="topbar-title">Painel administrativo</span>
          <div className="topbar-user">
            <span>{user?.name}</span>
            <button className="btn-ghost" onClick={() => void logout()}>
              Sair
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
