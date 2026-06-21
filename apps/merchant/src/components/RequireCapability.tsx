import { Navigate, Outlet } from "react-router-dom";
import { useMerchantContext } from "@/api/hooks/useMerchantContext";
import { can, type Capability } from "@/auth/permissions";

/**
 * Guard de rota por capacidade. Espera o contexto carregar; se o papel não tem a
 * capacidade, redireciona para a home. (Backend SEMPRE reforça — isto é UX.)
 */
export function RequireCapability({ capability }: { capability: Capability }) {
  const { data, isLoading } = useMerchantContext();

  if (isLoading) {
    return <div className="centered">Carregando…</div>;
  }
  if (!can(data?.role, capability)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
