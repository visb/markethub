import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";
import { useMerchantContext } from "@/api/hooks/useMerchantContext";
import { can, type Capability } from "@/auth/permissions";
import type { MerchantRole } from "@markethub/api-client";

/** Rótulo do nível efetivo do usuário no topo do painel (story 16). */
const ROLE_LABEL: Record<MerchantRole, string> = {
  owner: "Dono",
  admin: "Administrador",
  manager: "Gerente",
};

interface NavItem {
  to: string;
  label: string;
  capability: Capability;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Lojas", capability: "stores.view", end: true },
  { to: "/integration", label: "Integração", capability: "integration.manage" },
  { to: "/staff", label: "Colaboradores", capability: "staff.manage" },
  { to: "/vehicles", label: "Veículos", capability: "vehicles.manage" },
  { to: "/coupons", label: "Cupons", capability: "coupons.manage" },
  { to: "/catalog", label: "Catálogo", capability: "catalog.manage" },
  { to: "/orders", label: "Pedidos", capability: "orders.view" },
  { to: "/slots", label: "Agendamento", capability: "slots.manage" },
  { to: "/reports", label: "Relatórios", capability: "reports.view" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { data: context } = useMerchantContext();
  const role = context?.role ?? null;
  const items = NAV.filter((item) => can(role, item.capability));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">MarketHub</div>
        <nav>
          {items.map((item) => (
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
          <span className="topbar-title">
            Painel do mercado{role ? ` · ${ROLE_LABEL[role]}` : ""}
          </span>
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
