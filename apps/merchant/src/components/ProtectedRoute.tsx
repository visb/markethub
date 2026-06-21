import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";

/** Redireciona não autenticados para /login (substitui middleware de auth). */
export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="centered">Carregando…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
