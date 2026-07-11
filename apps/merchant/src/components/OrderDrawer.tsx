import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiClientError, type MerchantOrderItemDTO } from "@markethub/api-client";
import { useMerchantContext } from "@/api/hooks/useMerchantContext";
import { useCancelOrderGroup, useMerchantOrderDetail } from "@/api/hooks/useMerchantOrderDetail";
import { can } from "@/auth/permissions";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Descrição da quantidade/peso do item (unit vs weight em gramas). */
function quantityLabel(item: MerchantOrderItemDTO): string {
  if (item.saleType === "weight") {
    return `${((item.weightGrams ?? 0) / 1000).toLocaleString("pt-BR")} kg`;
  }
  return `${item.quantity} un`;
}

const PICK_LABEL: Record<string, string> = {
  pending: "A separar",
  picked: "Separado",
  refused: "Recusado",
  substituted: "Substituído",
};

const cancelFormSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
type CancelFormValues = z.infer<typeof cancelFormSchema>;

/**
 * Drawer lateral de detalhe do sub-pedido (story 54): itens linha a linha
 * (+substituições), pagamento, cliente e timeline. Ação "Cancelar sub-pedido"
 * (confirm + motivo opcional) atrás da capability `orders.manage`; desabilitada
 * com tooltip quando a invariante bloqueia (`cancelable = false`). Orquestra
 * hooks + apresentação — sem fetch inline (CLAUDE.md).
 */
export function OrderDrawer({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { data: ctx } = useMerchantContext();
  const { data: detail, isLoading, isError } = useMerchantOrderDetail(groupId);
  const cancelMutation = useCancelOrderGroup(groupId);
  const [confirming, setConfirming] = useState(false);

  const { register, handleSubmit } = useForm<CancelFormValues>({
    resolver: zodResolver(cancelFormSchema),
  });

  const canManage = can(ctx?.role, "orders.manage");

  const onCancel = handleSubmit((values) => {
    cancelMutation.mutate(values.reason || undefined, { onSuccess: () => setConfirming(false) });
  });

  const cancelError =
    cancelMutation.error instanceof ApiClientError
      ? cancelMutation.error.body.message
      : cancelMutation.error
        ? "Não foi possível cancelar o sub-pedido."
        : null;

  return (
    <aside className="drawer" role="dialog" aria-label="Detalhe do sub-pedido">
      <div className="drawer-head">
        <h2>{detail ? `Pedido #${detail.orderId.slice(-6)}` : "Sub-pedido"}</h2>
        <button type="button" className="btn-icon" aria-label="Fechar" onClick={onClose}>
          ✕
        </button>
      </div>

      {isLoading && <p className="muted">Carregando…</p>}
      {isError && <p className="error">Não foi possível carregar o sub-pedido.</p>}

      {detail && (
        <div className="drawer-body">
          <section className="drawer-section">
            <div className="muted">
              {detail.storeName} · {detail.fulfillment === "pickup" ? "Retirada" : "Entrega"}
            </div>
            <div className="muted">Cliente: {detail.customer.name}</div>
            {detail.payment && (
              <div className="muted">
                Pagamento: {detail.payment.method.toUpperCase()} · {detail.payment.status}
              </div>
            )}
          </section>

          <section className="drawer-section">
            <h3>Itens</h3>
            <ul className="list">
              {detail.items.map((item) => (
                <li key={item.id} className="list-item">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="muted">
                      {quantityLabel(item)} · {formatBRL(item.lineTotalCents)}
                    </div>
                    {item.pickStatus && (
                      <span className="badge-muted">{PICK_LABEL[item.pickStatus] ?? item.pickStatus}</span>
                    )}
                    {item.substitution && (
                      <div className="muted">
                        → {item.substitution.name} ({item.substitution.approvalStatus})
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="drawer-total">Total: {formatBRL(detail.totalCents)}</div>
          </section>

          {canManage && (
            <section className="drawer-section">
              <h3>Ações</h3>
              {!confirming ? (
                <button
                  type="button"
                  className="btn-danger"
                  disabled={!detail.cancelable}
                  title={
                    detail.cancelable
                      ? undefined
                      : "A separação já começou — não é mais possível cancelar."
                  }
                  onClick={() => setConfirming(true)}
                >
                  Cancelar sub-pedido
                </button>
              ) : (
                <form onSubmit={onCancel} className="cancel-form">
                  <label>
                    Motivo (opcional)
                    <textarea rows={2} maxLength={500} {...register("reason")} />
                  </label>
                  {cancelError && <p className="error">{cancelError}</p>}
                  <div className="cancel-actions">
                    <button type="submit" className="btn-danger" disabled={cancelMutation.isPending}>
                      {cancelMutation.isPending ? "Cancelando…" : "Confirmar cancelamento"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setConfirming(false)}
                      disabled={cancelMutation.isPending}
                    >
                      Voltar
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
