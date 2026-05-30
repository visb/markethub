import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";

/** Substitui o middleware de auth: redireciona não autenticados para /login. */
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
