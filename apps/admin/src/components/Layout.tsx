import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";

const NAV = [
  { to: "/", label: "Visão geral", end: true },
  { to: "/catalog", label: "Catálogo" },
  { to: "/orders", label: "Pedidos" },
  { to: "/erp", label: "Integração ERP" },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">MarketHub</div>
        <nav>
          {NAV.map((item) => (
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
