import { useMemo, useState } from "react";
import type { MerchantOrderDTO, OrderGroupStatus } from "@markethub/api-client";
import { useMerchantContext } from "@/api/hooks/useMerchantContext";
import { useMerchantOrders } from "@/api/hooks/useMerchantOrders";

/** Colunas do board, na ordem do fluxo. Cancelados ficam por último. */
const COLUMNS: { status: OrderGroupStatus; label: string }[] = [
  { status: "created", label: "Recebido" },
  { status: "paid", label: "Pago" },
  { status: "preparing", label: "Preparando" },
  { status: "picking", label: "Separando" },
  { status: "ready_for_pickup", label: "Pronto" },
  { status: "on_the_way", label: "A caminho" },
  { status: "delivered", label: "Entregue" },
  { status: "canceled", label: "Cancelado" },
];

/** Agrupa os pedidos por status — base do board (testável isoladamente). */
export function groupByStatus(orders: MerchantOrderDTO[]): Record<string, MerchantOrderDTO[]> {
  const map: Record<string, MerchantOrderDTO[]> = {};
  for (const o of orders) {
    (map[o.status] ??= []).push(o);
  }
  return map;
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Pedidos e status em tempo real (story 12). Board por status: cada pedido é um
 * card; eventos do socket movem o card entre colunas. Visível p/ dono e gerente.
 * Só visualização — sem ações sobre o pedido nesta story.
 */
export function Orders() {
  const { data: ctx } = useMerchantContext();
  const stores = useMemo(() => ctx?.stores ?? [], [ctx]);
  const storeIds = useMemo(() => stores.map((s) => s.id), [stores]);
  const [storeId, setStoreId] = useState<string>("");

  const { orders, loading, connected } = useMerchantOrders({
    storeId: storeId || undefined,
    subscribeStoreIds: storeIds,
    enabled: storeIds.length > 0,
  });

  const grouped = useMemo(() => groupByStatus(orders), [orders]);

  return (
    <section>
      <div className="page-head">
        <h1>Pedidos</h1>
        <span className={connected ? "badge-live" : "badge-muted"}>
          {connected ? "Tempo real" : "Reconectando…"}
        </span>
      </div>

      {stores.length > 1 && (
        <div className="filters">
          <label>
            Loja
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Todas</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {loading && <p className="muted">Carregando…</p>}
      {!loading && orders.length === 0 && <p className="muted">Nenhum pedido ainda.</p>}

      {!loading && orders.length > 0 && (
        <div className="board">
          {COLUMNS.map((col) => {
            const cards = grouped[col.status] ?? [];
            if (cards.length === 0) return null;
            return (
              <div key={col.status} className="board-col">
                <h2 className="board-col-head">
                  {col.label} <span className="muted">({cards.length})</span>
                </h2>
                <ul className="list">
                  {cards.map((o) => (
                    <li key={o.id} className="list-item order-card">
                      <div>
                        <strong>#{o.orderId.slice(-6)}</strong>
                        <span className="badge-muted"> {o.fulfillment === "pickup" ? "Retirada" : "Entrega"}</span>
                        <div className="muted">{o.storeName}</div>
                        <div className="muted">
                          {o.itemCount} {o.itemCount === 1 ? "item" : "itens"} · {formatBRL(o.totalCents)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
