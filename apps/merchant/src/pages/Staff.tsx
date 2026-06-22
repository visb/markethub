import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type {
  MerchantRole,
  MerchantStaffDTO,
  MerchantStoreDTO,
  StaffRoleName,
} from "@markethub/api-client";
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
 * Papéis que cada nível pode cadastrar/gerenciar (RBAC story 16). owner: tudo;
 * admin: manager|picker|driver; manager: picker|driver. Backend é a fonte da
 * verdade — isto é só UX.
 */
const ROLES_BY_LEVEL: Record<MerchantRole, StaffRoleName[]> = {
  owner: ["admin", "manager", "picker", "driver"],
  admin: ["manager", "picker", "driver"],
  manager: ["picker", "driver"],
};

/**
 * Tela de colaboradores (story 10 + RBAC story 16). Dono, admin e gerente
 * gerenciam a equipe das lojas no escopo (backend reforça). Cada nível só cria/
 * edita papéis abaixo do seu — a UI esconde papéis e ações fora do alcance; o
 * backend é a fonte da verdade. Orquestra hooks + componentes; sem fetch inline.
 */
export function Staff() {
  const { data: ctx } = useMerchantContext();
  const level = ctx?.role ?? null;
  const isOwner = level === "owner";
  const manageableRoles = level ? ROLES_BY_LEVEL[level] : [];
  const stores = ctx?.stores ?? [];

  const [storeFilter, setStoreFilter] = useState<string>("");
  const { data: staff, isLoading } = useStaff(storeFilter || undefined);
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <CreateStaff
        stores={stores}
        allowedRoles={manageableRoles}
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
            <StaffRow
              key={s.id}
              staff={s}
              isOwner={isOwner}
              manageableRoles={manageableRoles}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateStaff({
  stores,
  allowedRoles,
  onDone,
}: {
  stores: MerchantStoreDTO[];
  allowedRoles: StaffRoleName[];
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
      allowedRoles={allowedRoles}
      onSubmit={onSubmit}
      onCancel={onDone}
      submitting={mutation.isPending}
      error={error}
    />
  );
}

function StaffRow({
  staff,
  isOwner,
  manageableRoles,
}: {
  staff: MerchantStaffDTO;
  isOwner: boolean;
  manageableRoles: StaffRoleName[];
}) {
  const update = useUpdateStaff();
  const remove = useRemoveStaff();
  const [error, setError] = useState<string | null>(null);

  // Só age sobre vínculos cujo papel o ator pode gerenciar (UI esconde; backend reforça).
  const canManage = manageableRoles.includes(staff.staffRole);

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
