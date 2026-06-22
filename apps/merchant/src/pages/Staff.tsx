import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type { MerchantStaffDTO, MerchantStoreDTO } from "@markethub/api-client";
import { useMerchantContext } from "@/api/hooks/useMerchantContext";
import {
  useCreateStaff,
  useRemoveStaff,
  useStaff,
  useUpdateStaff,
} from "@/api/hooks/useStaff";
import { ROLE_LABEL, StaffForm, type StaffFormValues } from "@/components/StaffForm";

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

/**
 * Tela de colaboradores (story 10). Dono e gerente gerenciam a equipe das lojas
 * no escopo (backend reforça). O gerente não cadastra/edita outro gerente — a UI
 * esconde o papel "Gerente" e as ações sobre gerentes; o backend é a fonte da
 * verdade. Orquestra hooks + componentes; sem fetch inline.
 */
export function Staff() {
  const { data: ctx } = useMerchantContext();
  const isOwner = ctx?.role === "owner";
  const stores = ctx?.stores ?? [];

  const [storeFilter, setStoreFilter] = useState<string>("");
  const { data: staff, isLoading } = useStaff(storeFilter || undefined);
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <CreateStaff
        stores={stores}
        allowManager={isOwner}
        onDone={() => setCreating(false)}
      />
    );
  }

  return (
    <section>
      <div className="page-head">
        <h1>Colaboradores</h1>
        {stores.length > 0 && (
          <button className="btn-primary" type="button" onClick={() => setCreating(true)}>
            Novo colaborador
          </button>
        )}
      </div>

      {stores.length > 1 && (
        <label className="field">
          <span>Filtrar por loja</span>
          <select
            className="input"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
          >
            <option value="">Todas as lojas</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {isLoading && <p className="muted">Carregando…</p>}
      {staff && staff.length === 0 && <p className="muted">Nenhum colaborador ainda.</p>}
      {staff && staff.length > 0 && (
        <ul className="list">
          {staff.map((s) => (
            <StaffRow key={s.id} staff={s} isOwner={isOwner} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateStaff({
  stores,
  allowManager,
  onDone,
}: {
  stores: MerchantStoreDTO[];
  allowManager: boolean;
  onDone: () => void;
}) {
  const mutation = useCreateStaff();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (values: StaffFormValues) => {
    setError(null);
    mutation.mutate(values, {
      onSuccess: onDone,
      onError: (e) => setError(errMessage(e, "Falha ao cadastrar colaborador.")),
    });
  };

  return (
    <StaffForm
      stores={stores}
      allowManager={allowManager}
      onSubmit={onSubmit}
      onCancel={onDone}
      submitting={mutation.isPending}
      error={error}
    />
  );
}

function StaffRow({ staff, isOwner }: { staff: MerchantStaffDTO; isOwner: boolean }) {
  const update = useUpdateStaff();
  const remove = useRemoveStaff();
  const [error, setError] = useState<string | null>(null);

  // Gerente não pode gerenciar outro gerente (a UI esconde; o backend reforça).
  const canManage = isOwner || staff.staffRole !== "manager";

  const toggleActive = () => {
    setError(null);
    update.mutate(
      { id: staff.id, patch: { active: !staff.active } },
      { onError: (e) => setError(errMessage(e, "Falha ao atualizar.")) },
    );
  };

  const onRemove = () => {
    setError(null);
    // owner deleta o vínculo de fato; sem owner, desativa.
    remove.mutate(
      { id: staff.id, hard: isOwner },
      { onError: (e) => setError(errMessage(e, "Falha ao remover.")) },
    );
  };

  const busy = update.isPending || remove.isPending;

  return (
    <li className="list-item store-row">
      <div>
        <strong>{staff.user.name}</strong>
        {!staff.active && <span className="badge-muted"> inativo</span>}
        <div className="muted">
          {ROLE_LABEL[staff.staffRole]} · {staff.store.name} · {staff.user.email}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      {canManage && (
        <div className="row-actions">
          <button className="btn-ghost" type="button" onClick={toggleActive} disabled={busy}>
            {staff.active ? "Desativar" : "Reativar"}
          </button>
          <button className="btn-ghost" type="button" onClick={onRemove} disabled={busy}>
            {isOwner ? "Excluir" : "Remover"}
          </button>
        </div>
      )}
    </li>
  );
}
