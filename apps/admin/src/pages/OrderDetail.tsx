import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiClientError } from "@markethub/api-client";
import {
  useAdminOrder,
  useAdminOrderTimeline,
  useCancelAdminOrder,
  useManualRefund,
} from "@/api/hooks/useAdminOrders";
import type { AdminOrderDetail, AdminOrderGroup, AdminOrderTimelineItem } from "@/api/orders";
import { CancelOrderForm } from "@/components/CancelOrderForm";
import { ManualRefundForm } from "@/components/ManualRefundForm";

/**
 * Detalhe profundo do pedido p/ suporte (story 67): cabeçalho (cliente, totais,
 * pagamento, reembolso acumulado), grupos com itens/substituições, timeline
 * vertical e painel de ações (cancelar / reembolso manual). A rota só orquestra
 * hooks + componentes (CLAUDE.md).
 */

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR");

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

/** Teto restante do reembolso manual: pago − já reembolsado (refund failed não conta). */
export function remainingRefundCents(order: AdminOrderDetail): number {
  if (!order.payment || order.payment.status !== "paid") return 0;
  const refunded =
    order.refund && order.refund.status !== "failed" ? order.refund.amountCents : 0;
  return Math.max(0, order.payment.amountCents - refunded);
}

export function OrderDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: order, isPending, isError } = useAdminOrder(id);
  const { data: timeline } = useAdminOrderTimeline(id);

  if (isPending) return <p className="muted">Carregando…</p>;
  if (isError || !order) return <p className="error">Pedido não encontrado.</p>;

  return (
    <div>
      <div className="detail-head">
        <h1>
          Pedido #{order.id.slice(0, 6)}{" "}
          <span className={`badge badge-${order.status}`}>{order.status}</span>
        </h1>
        <Link className="btn-ghost" to="/orders">
          ← voltar
        </Link>
      </div>

      <OrderHeader order={order} />
      <ActionsPanel order={order} />

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "start" }}>
        <div>
          {order.groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
        <Timeline items={timeline ?? []} />
      </div>
    </div>
  );
}

function OrderHeader({ order }: { order: AdminOrderDetail }) {
  const refundCents =
    order.refund && order.refund.status !== "failed" ? order.refund.amountCents : 0;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div>
          <h3>Cliente</h3>
          <p>{order.user.name}</p>
          <p className="muted">{order.user.email}</p>
          <p className="muted">Criado em {when(order.createdAt)}</p>
        </div>
        <div>
          <h3>Totais</h3>
          <p>Itens: {brl(order.itemsCents)}</p>
          <p>Entrega: {brl(order.deliveryCents)}</p>
          {order.discountCents > 0 && (
            <p>
              Desconto: −{brl(order.discountCents)}
              {order.couponCode ? ` (${order.couponCode})` : ""}
            </p>
          )}
          <p>
            <strong>Total: {brl(order.totalCents)}</strong>
          </p>
        </div>
        <div>
          <h3>Pagamento</h3>
          {order.payment ? (
            <>
              <p>
                <span className={`badge badge-${order.payment.status}`}>{order.payment.status}</span>{" "}
                {brl(order.payment.amountCents)}
              </p>
              <p className="muted">
                {order.payment.provider}
                {order.payment.paidAt ? ` — pago em ${when(order.payment.paidAt)}` : ""}
              </p>
            </>
          ) : (
            <p className="muted">—</p>
          )}
        </div>
        <div>
          <h3>Reembolso</h3>
          {order.refund ? (
            <>
              <p>
                <span className={`badge badge-${order.refund.status}`}>{order.refund.status}</span>{" "}
                {brl(refundCents)} acumulado
              </p>
              <p className="muted">{order.refund.components.length} componente(s)</p>
            </>
          ) : (
            <p className="muted">Nenhum reembolso.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionsPanel({ order }: { order: AdminOrderDetail }) {
  const [action, setAction] = useState<"cancel" | "refund" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelMutation = useCancelAdminOrder(order.id);
  const refundMutation = useManualRefund(order.id);

  const terminal = order.status === "delivered" || order.status === "canceled";
  const remaining = remainingRefundCents(order);

  const openCancel = () => {
    setError(null);
    setAction("cancel");
  };
  const openRefund = () => {
    setError(null);
    setAction("refund");
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Ações do suporte</h3>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-primary" onClick={openCancel} disabled={terminal}>
          Cancelar pedido
        </button>
        <button className="btn-primary" onClick={openRefund} disabled={remaining <= 0}>
          Reembolso manual
        </button>
      </div>
      {terminal && <p className="muted">Pedido em status terminal não pode ser cancelado.</p>}
      {remaining <= 0 && <p className="muted">Sem valor restante para reembolso manual.</p>}

      {action === "cancel" && (
        <CancelOrderForm
          submitting={cancelMutation.isPending}
          error={error}
          onCancel={() => setAction(null)}
          onSubmit={(input) => {
            setError(null);
            cancelMutation.mutate(input, {
              onSuccess: () => setAction(null),
              onError: (e) => setError(errMessage(e, "Falha ao cancelar o pedido.")),
            });
          }}
        />
      )}

      {action === "refund" && (
        <ManualRefundForm
          groups={order.groups.map((g) => ({ id: g.id, label: `${g.store.name} (${g.status})` }))}
          remainingCents={remaining}
          submitting={refundMutation.isPending}
          error={error}
          onCancel={() => setAction(null)}
          onSubmit={(input) => {
            setError(null);
            refundMutation.mutate(input, {
              onSuccess: () => setAction(null),
              onError: (e) => setError(errMessage(e, "Falha ao solicitar o reembolso.")),
            });
          }}
        />
      )}
    </div>
  );
}

function GroupCard({ group }: { group: AdminOrderGroup }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="detail-head">
        <h3>
          {group.store.name} <span className="muted">({group.merchant.name})</span>
        </h3>
        <span className={`badge badge-${group.status}`}>{group.status}</span>
      </div>
      <p className="muted">
        {group.fulfillment === "pickup" ? "Retirada na loja" : "Entrega"}
        {group.delivery?.driver ? ` — entregador: ${group.delivery.driver.name}` : ""}
        {group.delivery ? ` — entrega: ${group.delivery.status}` : ""}
        {group.pickTask ? ` — separação: ${group.pickTask.status}` : ""}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qtd/Peso</th>
            <th>Separado</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {group.items.map((i) => (
            <tr key={i.id}>
              <td>
                {i.nameSnapshot}
                {i.pickItem?.substitution && (
                  <div className="muted">
                    ↳ substituído por {i.pickItem.substitution.nameSnapshot} (
                    {brl(i.pickItem.substitution.unitPriceCents)} —{" "}
                    {i.pickItem.substitution.approvalStatus})
                  </div>
                )}
              </td>
              <td>{i.saleType === "weight" ? `${i.weightGrams ?? 0} g` : `${i.quantity}×`}</td>
              <td className="muted">
                {i.pickItem
                  ? i.saleType === "weight"
                    ? i.pickItem.weightGramsPicked != null
                      ? `${i.pickItem.weightGramsPicked} g`
                      : i.pickItem.status
                    : i.pickItem.quantityPicked != null
                      ? `${i.pickItem.quantityPicked}×`
                      : i.pickItem.status
                  : "—"}
              </td>
              <td>{brl(i.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Subtotal {brl(group.subtotalCents)} · entrega {brl(group.deliveryCents)}</p>
    </div>
  );
}

function Timeline({ items }: { items: AdminOrderTimelineItem[] }) {
  return (
    <div className="card">
      <h3>Timeline</h3>
      {items.length === 0 && <p className="muted">Sem eventos.</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item, idx) => (
          <li
            key={`${item.at}-${item.kind}-${idx}`}
            style={{ borderLeft: "2px solid #ccc", paddingLeft: 12, paddingBottom: 12 }}
          >
            <div>
              <strong>{item.label}</strong>
            </div>
            <div className="muted">{when(item.at)}</div>
            {typeof item.meta?.note === "string" && item.meta.note && (
              <div className="muted">nota: {item.meta.note}</div>
            )}
            {typeof item.meta?.reason === "string" && item.meta.reason && (
              <div className="muted">motivo: {item.meta.reason}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
