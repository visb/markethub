import { useAuth } from "@/auth/auth-context";

/**
 * Tela bloqueante de rede suspensa (story 69). Substitui o layout inteiro do
 * painel quando o context devolve `merchantSuspended: true`: o staff loga, mas
 * não opera nada — só o logout fica disponível. Pedidos em andamento seguem
 * nos apps picker/driver até concluir (decisão travada da story).
 */
export function SuspendedNotice() {
  const { logout } = useAuth();
  return (
    <div className="login-wrap">
      <div className="login-card" role="alert">
        <div className="login-brand">MarketHub</div>
        <h1>Rede suspensa</h1>
        <p className="muted">
          O acesso ao painel foi bloqueado porque a rede está suspensa pela
          plataforma. Entre em contato com o suporte do MarketHub para
          regularizar a situação.
        </p>
        <p className="muted">Pedidos em andamento continuam até a conclusão.</p>
        <button className="btn-primary" onClick={() => void logout()}>
          Sair
        </button>
      </div>
    </div>
  );
}
