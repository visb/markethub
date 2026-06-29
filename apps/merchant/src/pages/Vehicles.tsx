import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type { VehicleDTO } from "@markethub/api-client";
import {
  useCreateVehicle,
  useDeleteVehicle,
  useUpdateVehicle,
  useVehicles,
} from "@/api/hooks/useVehicles";
import { TYPE_LABEL, VehicleForm, type VehicleFormValues } from "@/components/VehicleForm";

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

/**
 * Tela da frota de veículos (story 14). Dono e gerente gerenciam os veículos das
 * redes no escopo (backend reforça). Orquestra hooks + componentes; sem fetch inline.
 */
export function Vehicles() {
  const { data: vehicles, isLoading } = useVehicles();
  const [creating, setCreating] = useState(false);

  if (creating) {
    return <CreateVehicle onDone={() => setCreating(false)} />;
  }

  return (
    <section>
      <div className="page-head">
        <h1>Veículos</h1>
        <button className="btn-primary" type="button" onClick={() => setCreating(true)}>
          Novo veículo
        </button>
      </div>

      {isLoading && <p className="muted">Carregando…</p>}
      {vehicles && vehicles.length === 0 && <p className="muted">Nenhum veículo ainda.</p>}
      {vehicles && vehicles.length > 0 && (
        <ul className="list">
          {vehicles.map((v) => (
            <VehicleRow key={v.id} vehicle={v} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateVehicle({ onDone }: { onDone: () => void }) {
  const mutation = useCreateVehicle();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (values: VehicleFormValues) => {
    setError(null);
    mutation.mutate(
      { plate: values.plate, type: values.type, description: values.description || null },
      {
        onSuccess: onDone,
        onError: (e) => setError(errMessage(e, "Falha ao cadastrar veículo.")),
      },
    );
  };

  return (
    <VehicleForm
      onSubmit={onSubmit}
      onCancel={onDone}
      submitting={mutation.isPending}
      error={error}
    />
  );
}

function VehicleRow({ vehicle }: { vehicle: VehicleDTO }) {
  const update = useUpdateVehicle();
  const remove = useDeleteVehicle();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = (values: VehicleFormValues) => {
    setError(null);
    update.mutate(
      { id: vehicle.id, patch: { plate: values.plate, type: values.type, description: values.description || null } },
      {
        onSuccess: () => setEditing(false),
        onError: (e) => setError(errMessage(e, "Falha ao salvar.")),
      },
    );
  };

  const toggleActive = () => {
    setError(null);
    update.mutate(
      { id: vehicle.id, patch: { active: !vehicle.active } },
      { onError: (e) => setError(errMessage(e, "Falha ao atualizar.")) },
    );
  };

  const onRemove = () => {
    setError(null);
    remove.mutate(
      { id: vehicle.id, hard: true },
      { onError: (e) => setError(errMessage(e, "Falha ao excluir.")) },
    );
  };

  const busy = update.isPending || remove.isPending;

  if (editing) {
    return (
      <li className="list-item">
        <VehicleForm
          title="Editar veículo"
          submitLabel="Salvar"
          defaultValues={{
            plate: vehicle.plate,
            type: vehicle.type,
            description: vehicle.description ?? "",
          }}
          onSubmit={onSave}
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
        <strong>{vehicle.plate}</strong>
        {!vehicle.active && <span className="badge-muted"> inativo</span>}
        <div className="muted">
          {TYPE_LABEL[vehicle.type]}
          {vehicle.description ? ` · ${vehicle.description}` : ""}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="row-actions">
        <button className="btn-ghost" type="button" onClick={() => setEditing(true)} disabled={busy}>
          Editar
        </button>
        <button className="btn-ghost" type="button" onClick={toggleActive} disabled={busy}>
          {vehicle.active ? "Desativar" : "Reativar"}
        </button>
        <button className="btn-ghost" type="button" onClick={onRemove} disabled={busy}>
          Excluir
        </button>
      </div>
    </li>
  );
}
