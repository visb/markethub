import { useAuth } from "@/auth/auth-context";

export function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1>Olá, {user?.name}</h1>
      <p className="muted">{user?.email}</p>

      <div className="cards">
        <div className="card">
          <span className="card-label">Papéis</span>
          <span className="card-value">{user?.roles.join(", ")}</span>
        </div>
        <div className="card">
          <span className="card-label">Catálogo</span>
          <span className="card-value">—</span>
          <span className="muted">Fase 1</span>
        </div>
        <div className="card">
          <span className="card-label">Pedidos</span>
          <span className="card-value">—</span>
          <span className="muted">Fase 2</span>
        </div>
      </div>
    </div>
  );
}
