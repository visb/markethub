import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type { MerchantStoreDetailDTO } from "@markethub/api-client";
import { useTogglePauseStore } from "@/api/hooks/useStores";

/**
 * Controle de pausa temporária da loja (story 57). Pausar bloqueia TODO pedido novo
 * (imediato e agendado) sem mexer no horário nem em `active`. Estado perigoso de
 * esquecer ligado → badge "Pausada desde HH:MM" bem visível + confirmação na ação.
 * Owner-only (backend reforça); a tela só mostra a quem pode editar a loja.
 */

/** ISO timestamp → "HH:MM" no fuso local. */
function pausedSinceLabel(pausedAt: string): string {
  const d = new Date(pausedAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function PauseStoreControl({ store }: { store: MerchantStoreDetailDTO }) {
  const toggle = useTogglePauseStore(store.id);
  const [error, setError] = useState<string | null>(null);
  const paused = store.pausedAt != null;

  const onToggle = () => {
    setError(null);
    const next = !paused;
    const confirmMsg = next
      ? "Pausar a loja? Nenhum pedido novo (nem agendado) será aceito até você retomar."
      : "Retomar a loja? Ela volta a receber pedidos normalmente.";
    if (!window.confirm(confirmMsg)) return;
    toggle.mutate(next, {
      onError: (e) =>
        setError(e instanceof ApiClientError ? e.body.message : "Falha ao atualizar a pausa da loja."),
    });
  };

  return (
    <section className="pause-section">
      <div className="pause-head">
        <div>
          <h3>Pausa temporária</h3>
          {paused ? (
            <span className="badge-paused" role="status">
              ⏸ Pausada desde {store.pausedAt ? pausedSinceLabel(store.pausedAt) : ""}
            </span>
          ) : (
            <p className="muted">A loja está recebendo pedidos normalmente.</p>
          )}
        </div>
        <button
          className={paused ? "btn-primary" : "btn-danger"}
          type="button"
          disabled={toggle.isPending}
          onClick={onToggle}
        >
          {toggle.isPending ? "Salvando…" : paused ? "Retomar loja" : "Pausar loja"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
