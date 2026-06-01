import { useCallback, useEffect, useState } from "react";
import type { MerchantStock, PickStore } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { StoreSelector } from "@/components/StoreSelector";

export function Stock() {
  const { api } = useAuth();
  const [stores, setStores] = useState<PickStore[]>([]);
  const [storeId, setStoreId] = useState<string | undefined>();
  const [rows, setRows] = useState<MerchantStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.merchantStores().then((s) => {
      setStores(s);
      setStoreId((cur) => cur ?? s[0]?.id);
    });
  }, [api]);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await api.merchantStocks(storeId));
    } catch {
      setError("Falha ao carregar estoque");
    } finally {
      setLoading(false);
    }
  }, [api, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (id: string, body: Parameters<typeof api.merchantUpdateStock>[1]) => {
    try {
      await api.merchantUpdateStock(id, body);
      await load();
    } catch {
      setError("Falha ao salvar");
    }
  };

  return (
    <div>
      <h1>Estoque</h1>
      <div className="toolbar">
        <StoreSelector stores={stores} value={storeId} onChange={setStoreId} />
      </div>
      {error && <p style={{ color: "#C0182A" }}>{error}</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Quantidade</th>
            <th>Disponível</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <QtyRow
              key={s.id}
              row={s}
              onSaveQty={(q) => void patch(s.id, { quantity: q })}
              onToggle={(a) => void patch(s.id, { available: a })}
              onUnlock={(f) => void api.merchantUnlockStock(s.id, f).then(load)}
            />
          ))}
        </tbody>
      </table>
      {loading && <p className="muted">Carregando…</p>}
      {!loading && rows.length === 0 && <p className="muted">Nenhum item.</p>}
    </div>
  );
}

function QtyRow({
  row,
  onSaveQty,
  onToggle,
  onUnlock,
}: {
  row: MerchantStock;
  onSaveQty: (q: number | null) => void;
  onToggle: (a: boolean) => void;
  onUnlock: (field: string) => void;
}) {
  const [q, setQ] = useState(row.quantity == null ? "" : String(row.quantity));
  useEffect(() => setQ(row.quantity == null ? "" : String(row.quantity)), [row.quantity]);
  return (
    <tr>
      <td>
        {row.product.name}
        <br />
        <span className="muted">{row.product.brand ?? ""}</span>
      </td>
      <td>
        <span className="lockwrap">
          <input
            className="input input-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => {
              const next = q === "" ? null : Number(q);
              if (String(row.quantity ?? "") !== q) onSaveQty(next);
            }}
          />
          {row.lockedFields.includes("quantity") && (
            <button className="btn-ghost lock" title="Destravar (volta ao ERP)" onClick={() => onUnlock("quantity")}>
              🔒
            </button>
          )}
        </span>
      </td>
      <td>
        <label className="lockwrap">
          <input type="checkbox" checked={row.available} onChange={(e) => onToggle(e.target.checked)} />
          {row.lockedFields.includes("available") && (
            <button className="btn-ghost lock" title="Destravar (volta ao ERP)" onClick={() => onUnlock("available")}>
              🔒
            </button>
          )}
        </label>
      </td>
    </tr>
  );
}
