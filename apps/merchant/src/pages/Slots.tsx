import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type { SlotDTO } from "@markethub/api-client";
import { useMerchantContext } from "@/api/hooks/useMerchantContext";
import { useCreateSlot, useDeleteSlot, useStoreSlots } from "@/api/hooks/useSlots";
import { SlotForm, type SlotFormValues } from "@/components/SlotForm";
import {
  SlotBatchForm,
  type SlotBatchFormValues,
} from "@/components/SlotBatchForm";
import { expandSlotBatch, runSlotBatch, type SlotBatchResult } from "@/lib/slotBatch";

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

/** ISO → "HH:MM" no fuso local. */
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Chave de dia (YYYY-MM-DD local) p/ agrupar. */
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

/** Cabeçalho amigável do dia (ex. "seg, 01/07"). */
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

/** Agrupa os slots por dia (já ordenados por start pelo backend). */
function groupByDay(slots: SlotDTO[]): { key: string; label: string; slots: SlotDTO[] }[] {
  const groups: { key: string; label: string; slots: SlotDTO[] }[] = [];
  for (const slot of slots) {
    const key = dayKey(slot.start);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: dayLabel(slot.start), slots: [] };
      groups.push(group);
    }
    group.slots.push(slot);
  }
  return groups;
}

/**
 * Gestão de slots de agendamento (story 55). Seletor de loja + lista agrupada por
 * dia (capacidade + reserved/capacity), inclusão avulsa e geração em lote. Guarda
 * de rota `slots.manage`; o backend reforça o escopo. Orquestra hooks — sem fetch
 * inline.
 */
export function Slots() {
  const { data: ctx } = useMerchantContext();
  const stores = ctx?.stores ?? [];
  const [selected, setSelected] = useState<string>("");
  const storeId = selected || stores[0]?.id || "";

  const { data: slots, isLoading } = useStoreSlots(storeId, { enabled: Boolean(storeId) });
  const groups = groupByDay(slots ?? []);

  return (
    <section>
      <div className="page-head">
        <h1>Agendamento</h1>
      </div>

      {stores.length === 0 && <p className="muted">Nenhuma loja no seu escopo.</p>}

      {stores.length > 1 && (
        <label className="field">
          <span>Loja</span>
          <select className="input" value={storeId} onChange={(e) => setSelected(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {storeId && (
        <>
          <CreateSlot storeId={storeId} />
          <GenerateWeek storeId={storeId} />

          <h2>Slots cadastrados</h2>
          {isLoading && <p className="muted">Carregando…</p>}
          {slots && slots.length === 0 && <p className="muted">Nenhum slot cadastrado.</p>}
          {groups.map((group) => (
            <div key={group.key} className="slot-day">
              <h3>{group.label}</h3>
              <ul className="list">
                {group.slots.map((slot) => (
                  <SlotRow key={slot.id} storeId={storeId} slot={slot} />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function CreateSlot({ storeId }: { storeId: string }) {
  const create = useCreateSlot(storeId);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (values: SlotFormValues) => {
    setError(null);
    const start = new Date(`${values.date}T${values.start}:00`).toISOString();
    const end = new Date(`${values.date}T${values.end}:00`).toISOString();
    create.mutate(
      { storeId, start, end, capacity: values.capacity },
      { onError: (e) => setError(errMessage(e, "Falha ao adicionar o slot.")) },
    );
  };

  return <SlotForm onSubmit={onSubmit} submitting={create.isPending} error={error} />;
}

function GenerateWeek({ storeId }: { storeId: string }) {
  const create = useCreateSlot(storeId);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SlotBatchResult | null>(null);
  const [running, setRunning] = useState(false);

  const onSubmit = async (values: SlotBatchFormValues) => {
    setError(null);
    setResult(null);
    setRunning(true);
    const windows = expandSlotBatch(values);
    try {
      const out = await runSlotBatch(
        (w) => create.mutateAsync({ storeId, start: w.start, end: w.end, capacity: values.capacity }),
        windows,
      );
      setResult(out);
    } catch (e) {
      setError(errMessage(e, "Falha ao gerar os slots."));
    } finally {
      setRunning(false);
    }
  };

  return <SlotBatchForm onSubmit={onSubmit} submitting={running} error={error} result={result} />;
}

function SlotRow({ storeId, slot }: { storeId: string; slot: SlotDTO }) {
  const remove = useDeleteSlot(storeId);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pct = slot.capacity > 0 ? Math.min(100, Math.round((slot.reserved / slot.capacity) * 100)) : 0;

  const onConfirm = () => {
    setError(null);
    remove.mutate(slot.id, {
      onSuccess: () => setConfirming(false),
      onError: (e) => setError(errMessage(e, "Falha ao remover o slot.")),
    });
  };

  return (
    <li className="list-item slot-row">
      <div className="slot-info">
        <strong>
          {timeLabel(slot.start)}–{timeLabel(slot.end)}
        </strong>
        <span className="muted">
          {" "}
          · capacidade {slot.capacity} · {slot.reserved}/{slot.capacity} reservado(s)
        </span>
        <div className="slot-bar" aria-hidden="true">
          <div className="slot-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="row-actions">
        {confirming ? (
          <>
            <span className="muted">
              Remover slot? {slot.reserved} reserva(s)
            </span>
            <button className="btn-ghost" type="button" onClick={onConfirm} disabled={remove.isPending}>
              Confirmar
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={remove.isPending}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button className="btn-ghost" type="button" onClick={() => setConfirming(true)}>
            Remover
          </button>
        )}
      </div>
    </li>
  );
}
