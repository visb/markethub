import { useCallback, useEffect, useState } from "react";
import type { MerchantOffer, PickStore } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { StoreSelector } from "@/components/StoreSelector";

const reais = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

export function Offers() {
  const { api } = useAuth();
  const [stores, setStores] = useState<PickStore[]>([]);
  const [storeId, setStoreId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<MerchantOffer[]>([]);
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
      setRows(await api.merchantOffers({ storeId, search: search || undefined }));
    } catch {
      setError("Falha ao carregar ofertas");
    } finally {
      setLoading(false);
    }
  }, [api, storeId, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (id: string, body: Parameters<typeof api.merchantUpdateOffer>[1]) => {
    try {
      await api.merchantUpdateOffer(id, body);
      await load();
    } catch {
      setError("Falha ao salvar");
    }
  };

  const unlock = async (id: string, field: string) => {
    await api.merchantUnlockOffer(id, field);
    await load();
  };

  return (
    <div>
      <h1>Ofertas</h1>
      <div className="toolbar">
        <StoreSelector stores={stores} value={storeId} onChange={setStoreId} />
        <input
          className="input"
          placeholder="Buscar produto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p style={{ color: "#C0182A" }}>{error}</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Preço (R$)</th>
            <th>Promo (R$)</th>
            <th>Disponível</th>
            <th>Estoque</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>
                {o.product.name}
                <br />
                <span className="muted">{o.product.brand ?? ""}</span>
              </td>
              <td>
                <PriceCell
                  value={reais(o.priceCents)}
                  locked={o.lockedFields.includes("priceCents")}
                  onSave={(v) => void patch(o.id, { priceCents: toCents(v) })}
                  onUnlock={() => void unlock(o.id, "priceCents")}
                />
              </td>
              <td>
                <PriceCell
                  value={reais(o.promoPriceCents)}
                  locked={o.lockedFields.includes("promoPriceCents")}
                  onSave={(v) => void patch(o.id, { promoPriceCents: v ? toCents(v) : null })}
                  onUnlock={() => void unlock(o.id, "promoPriceCents")}
                />
              </td>
              <td>
                <label className="lockwrap">
                  <input
                    type="checkbox"
                    checked={o.available}
                    onChange={(e) => void patch(o.id, { available: e.target.checked })}
                  />
                  {o.lockedFields.includes("available") && (
                    <LockBtn onUnlock={() => void unlock(o.id, "available")} />
                  )}
                </label>
              </td>
              <td className="muted">
                {o.stock?.quantity ?? "—"} {o.stock && !o.stock.available ? "(off)" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <p className="muted">Carregando…</p>}
      {!loading && rows.length === 0 && <p className="muted">Nenhuma oferta.</p>}
    </div>
  );
}

function PriceCell({
  value,
  locked,
  onSave,
  onUnlock,
}: {
  value: string;
  locked: boolean;
  onSave: (v: string) => void;
  onUnlock: () => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <span className="lockwrap">
      <input
        className="input input-sm"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
      />
      {locked && <LockBtn onUnlock={onUnlock} />}
    </span>
  );
}

function LockBtn({ onUnlock }: { onUnlock: () => void }) {
  return (
    <button className="btn-ghost lock" title="Editado manual — clique p/ destravar (volta ao ERP)" onClick={onUnlock}>
      🔒
    </button>
  );
}
