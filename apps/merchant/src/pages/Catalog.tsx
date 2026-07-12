import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type { MerchantOffer, MerchantStock } from "@markethub/api-client";
import type { CreateProductInput, OfferPatch } from "@/api/catalog";
import { useMerchantContext } from "@/api/hooks/useMerchantContext";
import {
  useCreateProduct,
  useOffers,
  useProductUploadUrl,
  useStocks,
  useToggleOfferAvailable,
  useUnlockOfferField,
  useUnlockStockField,
  useUpdateOffer,
  useUpdateStock,
} from "@/api/hooks/useCatalog";
import { OfferForm } from "@/components/OfferForm";
import { ProductForm } from "@/components/ProductForm";

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

const LOCK_LABEL: Record<string, string> = {
  priceCents: "preço",
  promoPriceCents: "promoção",
  available: "disponibilidade",
  quantity: "estoque",
};

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Tela de catálogo (story 11). Dono e gerente veem e editam ofertas, estoque e
 * cadastram produtos das suas lojas (backend reforça o escopo). Seletor de loja +
 * busca + filtro de disponibilidade. Edição salva só o diff; campos travados
 * (lockedFields) ganham badge + ação "destravar". Orquestra hooks — sem fetch
 * inline.
 */
export function Catalog() {
  const { data: ctx } = useMerchantContext();
  const stores = ctx?.stores ?? [];

  const [tab, setTab] = useState<"offers" | "stocks">("offers");
  const [storeId, setStoreId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [available, setAvailable] = useState<"" | "true" | "false">("");
  const [creating, setCreating] = useState(false);

  const filters = {
    storeId: storeId || undefined,
    search: search.trim() || undefined,
    available: available === "" ? undefined : available === "true",
  };
  const offersQuery = useOffers(filters, { enabled: tab === "offers" });
  const stocksQuery = useStocks(storeId || undefined, { enabled: tab === "stocks" });

  if (creating) {
    return <CreateProduct stores={stores} onDone={() => setCreating(false)} />;
  }

  return (
    <section>
      <div className="page-head">
        <h1>Catálogo</h1>
        {stores.length > 0 && (
          <button className="btn-primary" type="button" onClick={() => setCreating(true)}>
            Novo produto
          </button>
        )}
      </div>

      <div className="tabs">
        <button
          type="button"
          className={tab === "offers" ? "tab active" : "tab"}
          onClick={() => setTab("offers")}
        >
          Ofertas
        </button>
        <button
          type="button"
          className={tab === "stocks" ? "tab active" : "tab"}
          onClick={() => setTab("stocks")}
        >
          Estoque
        </button>
      </div>

      <div className="filters">
        {stores.length > 1 && (
          <label className="field">
            <span>Loja</span>
            <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Todas as lojas</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {tab === "offers" && (
          <>
            <label className="field">
              <span>Buscar</span>
              <input
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome do produto"
              />
            </label>
            <label className="field">
              <span>Disponibilidade</span>
              <select
                className="input"
                value={available}
                onChange={(e) => setAvailable(e.target.value as "" | "true" | "false")}
              >
                <option value="">Todas</option>
                <option value="true">Disponíveis</option>
                <option value="false">Indisponíveis</option>
              </select>
            </label>
          </>
        )}
      </div>

      {tab === "offers" && (
        <>
          {offersQuery.isLoading && <p className="muted">Carregando…</p>}
          {offersQuery.data && offersQuery.data.length === 0 && (
            <p className="muted">Nenhuma oferta encontrada.</p>
          )}
          {offersQuery.data && offersQuery.data.length > 0 && (
            <ul className="list">
              {offersQuery.data.map((o) => (
                <OfferRow key={o.id} offer={o} showStore={!storeId} />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "stocks" && (
        <>
          {stocksQuery.isLoading && <p className="muted">Carregando…</p>}
          {stocksQuery.data && stocksQuery.data.length === 0 && (
            <p className="muted">Nenhum estoque encontrado.</p>
          )}
          {stocksQuery.data && stocksQuery.data.length > 0 && (
            <ul className="list">
              {stocksQuery.data.map((s) => (
                <StockRow key={s.id} stock={s} showStore={!storeId} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function CreateProduct({ stores, onDone }: { stores: { id: string; name: string; merchantId: string }[]; onDone: () => void }) {
  const create = useCreateProduct();
  const upload = useProductUploadUrl();
  const [error, setError] = useState<string | null>(null);

  const onUploadImage = async (file: File): Promise<string> => {
    const presigned = await upload.mutateAsync({ filename: file.name, contentType: file.type || "application/octet-stream" });
    await fetch(presigned.uploadUrl, { method: "PUT", headers: presigned.headers, body: file });
    return presigned.publicUrl;
  };

  const onSubmit = (input: CreateProductInput) => {
    setError(null);
    create.mutate(input, {
      onSuccess: onDone,
      onError: (e) => setError(errMessage(e, "Falha ao cadastrar produto.")),
    });
  };

  return (
    <ProductForm
      stores={stores}
      onSubmit={onSubmit}
      onCancel={onDone}
      onUploadImage={onUploadImage}
      submitting={create.isPending}
      error={error}
    />
  );
}

function OfferRow({ offer, showStore }: { offer: MerchantOffer; showStore: boolean }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateOffer();
  const unlockOffer = useUnlockOfferField();
  const toggleAvailable = useToggleOfferAvailable();
  const [error, setError] = useState<string | null>(null);

  // Switch inline de disponibilidade (story 57): update otimista no hook; em erro
  // o snapshot é restaurado e a mensagem aparece na linha.
  const onToggleAvailable = () => {
    setError(null);
    toggleAvailable.mutate(
      { id: offer.id, available: !offer.available },
      { onError: (e) => setError(errMessage(e, "Falha ao atualizar disponibilidade.")) },
    );
  };

  const onSubmit = (patch: OfferPatch) => {
    setError(null);
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    update.mutate(
      { id: offer.id, patch },
      {
        onSuccess: () => setEditing(false),
        onError: (e) => setError(errMessage(e, "Falha ao salvar oferta.")),
      },
    );
  };

  const onUnlockOffer = (field: string) => {
    setError(null);
    unlockOffer.mutate({ id: offer.id, field }, { onError: (e) => setError(errMessage(e, "Falha ao destravar.")) });
  };

  if (editing) {
    return (
      <li className="list-item">
        <OfferForm
          offer={offer}
          onSubmit={onSubmit}
          onCancel={() => setEditing(false)}
          submitting={update.isPending}
          error={error}
        />
      </li>
    );
  }

  return (
    <li className="list-item store-row">
      <div>
        <strong>{offer.product.name}</strong>
        {offer.product.brand && <span className="muted"> · {offer.product.brand}</span>}
        <div className="muted">
          {formatPrice(offer.priceCents)}
          {offer.promoPriceCents != null && <> · promo {formatPrice(offer.promoPriceCents)}</>}
          {showStore && <> · {offer.storeName}</>}
          {offer.stock && <> · estoque: {offer.stock.quantity ?? "—"}</>}
        </div>
        {offer.lockedFields.length > 0 && (
          <div className="locks">
            {offer.lockedFields.map((f) => (
              <span key={f} className="badge-lock">
                🔒 {LOCK_LABEL[f] ?? f}
                <button
                  className="btn-link"
                  type="button"
                  onClick={() => onUnlockOffer(f)}
                  disabled={unlockOffer.isPending}
                >
                  destravar
                </button>
              </span>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
      <div className="row-actions">
        <label className="switch" title={offer.available ? "Disponível" : "Indisponível"}>
          <input
            type="checkbox"
            role="switch"
            aria-label={`Disponível: ${offer.product.name}`}
            checked={offer.available}
            disabled={toggleAvailable.isPending}
            onChange={onToggleAvailable}
          />
          <span className="switch-label">{offer.available ? "Disponível" : "Indisponível"}</span>
        </label>
        <button className="btn-ghost" type="button" onClick={() => setEditing(true)}>
          Editar
        </button>
      </div>
    </li>
  );
}

function StockRow({ stock, showStore }: { stock: MerchantStock; showStore: boolean }) {
  const [draft, setDraft] = useState<string>(stock.quantity == null ? "" : String(stock.quantity));
  const update = useUpdateStock();
  const unlock = useUnlockStockField();
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    const quantity = draft.trim() === "" ? null : Number(draft);
    if (quantity != null && (!Number.isInteger(quantity) || quantity < 0)) {
      setError("Quantidade inválida.");
      return;
    }
    if (quantity === stock.quantity) return; // só o diff
    update.mutate(
      { id: stock.id, patch: { quantity } },
      { onError: (e) => setError(errMessage(e, "Falha ao salvar estoque.")) },
    );
  };

  const toggleAvailable = () => {
    setError(null);
    update.mutate(
      { id: stock.id, patch: { available: !stock.available } },
      { onError: (e) => setError(errMessage(e, "Falha ao atualizar.")) },
    );
  };

  const onUnlock = (field: string) => {
    setError(null);
    unlock.mutate({ id: stock.id, field }, { onError: (e) => setError(errMessage(e, "Falha ao destravar.")) });
  };

  return (
    <li className="list-item store-row">
      <div>
        <strong>{stock.product.name}</strong>
        {!stock.available && <span className="badge-muted"> indisponível</span>}
        <div className="muted">
          {stock.product.saleType === "weight" ? "por peso (g)" : "por unidade"}
          {showStore && <> · {stock.storeName}</>}
        </div>
        {stock.lockedFields.length > 0 && (
          <div className="locks">
            {stock.lockedFields.map((f) => (
              <span key={f} className="badge-lock">
                🔒 {LOCK_LABEL[f] ?? f}
                <button
                  className="btn-link"
                  type="button"
                  onClick={() => onUnlock(f)}
                  disabled={unlock.isPending}
                >
                  destravar
                </button>
              </span>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
      <div className="row-actions">
        <input
          className="input input-sm"
          type="number"
          aria-label={`Estoque de ${stock.product.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn-ghost" type="button" onClick={save} disabled={update.isPending}>
          Salvar
        </button>
        <button className="btn-ghost" type="button" onClick={toggleAvailable} disabled={update.isPending}>
          {stock.available ? "Marcar indisponível" : "Marcar disponível"}
        </button>
      </div>
    </li>
  );
}
