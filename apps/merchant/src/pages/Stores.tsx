import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type { MerchantStoreDetailDTO } from "@markethub/api-client";
import { useMerchantContext } from "@/api/hooks/useMerchantContext";
import { useCreateStore, useStores, useUpdateStore } from "@/api/hooks/useStores";
import { can } from "@/auth/permissions";
import { StoreForm, type StoreFormValues, toStorePayload } from "@/components/StoreForm";

type View = { mode: "list" } | { mode: "create" } | { mode: "edit"; store: MerchantStoreDetailDTO };

/** Tela de CRUD de lojas (story 08). Orquestra hooks + componentes; sem fetch inline. */
export function Stores() {
  const { data: ctx } = useMerchantContext();
  const { data: stores, isLoading } = useStores();
  const canManage = can(ctx?.role, "stores.create");
  const [view, setView] = useState<View>({ mode: "list" });

  if (view.mode === "create") {
    return <CreateStore onDone={() => setView({ mode: "list" })} />;
  }
  if (view.mode === "edit") {
    return <EditStore store={view.store} onDone={() => setView({ mode: "list" })} />;
  }

  return (
    <section>
      <div className="page-head">
        <h1>Lojas</h1>
        {canManage && (
          <button className="btn-primary" type="button" onClick={() => setView({ mode: "create" })}>
            Nova loja
          </button>
        )}
      </div>

      {isLoading && <p className="muted">Carregando…</p>}
      {stores && stores.length === 0 && <p className="muted">Nenhuma loja cadastrada ainda.</p>}
      {stores && stores.length > 0 && (
        <ul className="list">
          {stores.map((s) => (
            <li key={s.id} className="list-item store-row">
              <div>
                <strong>{s.name}</strong>
                {!s.active && <span className="badge-muted"> inativa</span>}
                <div className="muted">
                  {[s.street, s.number, s.city, s.state].filter(Boolean).join(", ") || "Sem endereço"}
                </div>
              </div>
              {canManage && (
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => setView({ mode: "edit", store: s })}
                >
                  Editar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function errMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.body.message : "Falha ao salvar a loja.";
}

function CreateStore({ onDone }: { onDone: () => void }) {
  const mutation = useCreateStore();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (values: StoreFormValues) => {
    setError(null);
    mutation.mutate(toStorePayload(values), {
      onSuccess: onDone,
      onError: (e) => setError(errMessage(e)),
    });
  };

  return (
    <StoreForm
      onSubmit={onSubmit}
      onCancel={onDone}
      submitting={mutation.isPending}
      error={error}
    />
  );
}

function EditStore({ store, onDone }: { store: MerchantStoreDetailDTO; onDone: () => void }) {
  const mutation = useUpdateStore(store.id);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (values: StoreFormValues) => {
    setError(null);
    mutation.mutate(toStorePayload(values), {
      onSuccess: onDone,
      onError: (e) => setError(errMessage(e)),
    });
  };

  return (
    <StoreForm
      store={store}
      onSubmit={onSubmit}
      onCancel={onDone}
      submitting={mutation.isPending}
      error={error}
    />
  );
}
