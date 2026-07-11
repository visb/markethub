import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type { CouponDTO } from "@markethub/api-client";
import {
  useCoupons,
  useCreateCoupon,
  useDeleteCoupon,
  useUpdateCoupon,
} from "@/api/hooks/useCoupons";
import { useMerchantOptions } from "@/api/hooks/useMerchantOptions";
import {
  buildAdminCouponPayload,
  CouponForm,
  type CouponFormValues,
} from "@/components/CouponForm";

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

function couponValue(c: CouponDTO): string {
  if (c.type === "free_shipping") return "Frete grátis";
  if (c.type === "percent") return `${c.value}%`;
  return brl(c.value);
}

function couponWindow(c: CouponDTO): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
  if (!c.validFrom && !c.validTo) return "Sem prazo";
  return `${c.validFrom ? fmt(c.validFrom) : "…"} – ${c.validTo ? fmt(c.validTo) : "…"}`;
}

/**
 * Gestão de cupons no admin (story 53): vê TODOS (globais + por rede) com filtro,
 * coluna de rede e criação de cupons globais/atrelados. Orquestra hooks +
 * componentes; sem fetch inline (CLAUDE.md). React Query + react-hook-form/zod.
 */
export function Coupons() {
  const [filter, setFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const { data: coupons, isLoading } = useCoupons(filter || undefined);
  const { data: merchants } = useMerchantOptions();
  const merchantOptions = merchants ?? [];

  return (
    <div>
      <div className="detail-head">
        <h1>Cupons</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fechar" : "+ Novo cupom"}
        </button>
      </div>

      {showForm && (
        <CreateCoupon merchants={merchantOptions} onDone={() => setShowForm(false)} />
      )}

      <div className="toolbar">
        <select
          className="input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filtrar por rede"
        >
          <option value="">Todos</option>
          <option value="global">Somente globais</option>
          {merchantOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Rede</th>
            <th>Tipo/valor</th>
            <th>Validade</th>
            <th>Usos</th>
            <th>Ativo</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(coupons ?? []).map((c) => (
            <CouponRow key={c.id} coupon={c} merchants={merchantOptions} />
          ))}
        </tbody>
      </table>
      {isLoading && <p className="muted">Carregando…</p>}
      {!isLoading && coupons && coupons.length === 0 && <p className="muted">Nenhum cupom.</p>}
    </div>
  );
}

function CreateCoupon({
  merchants,
  onDone,
}: {
  merchants: { id: string; name: string }[];
  onDone: () => void;
}) {
  const mutation = useCreateCoupon();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (values: CouponFormValues) => {
    setError(null);
    mutation.mutate(buildAdminCouponPayload(values), {
      onSuccess: onDone,
      onError: (e) => setError(errMessage(e, "Falha ao cadastrar cupom.")),
    });
  };

  return (
    <CouponForm
      merchants={merchants}
      onSubmit={onSubmit}
      onCancel={onDone}
      submitting={mutation.isPending}
      error={error}
    />
  );
}

function CouponRow({
  coupon,
  merchants,
}: {
  coupon: CouponDTO;
  merchants: { id: string; name: string }[];
}) {
  const update = useUpdateCoupon();
  const remove = useDeleteCoupon();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = (values: CouponFormValues) => {
    setError(null);
    const payload = buildAdminCouponPayload(values);
    update.mutate(
      {
        id: coupon.id,
        patch: {
          type: payload.type,
          value: payload.value,
          minOrderCents: payload.minOrderCents,
          validFrom: payload.validFrom,
          validTo: payload.validTo,
          maxUses: payload.maxUses,
        },
      },
      {
        onSuccess: () => setEditing(false),
        onError: (e) => setError(errMessage(e, "Falha ao salvar.")),
      },
    );
  };

  const toggleActive = () => {
    setError(null);
    update.mutate(
      { id: coupon.id, patch: { active: !coupon.active } },
      { onError: (e) => setError(errMessage(e, "Falha ao atualizar.")) },
    );
  };

  const onRemove = () => {
    setError(null);
    remove.mutate(coupon.id, {
      onError: (e) =>
        setError(errMessage(e, "Falha ao excluir. Cupom já usado só pode ser desativado.")),
    });
  };

  const busy = update.isPending || remove.isPending;

  if (editing) {
    return (
      <tr>
        <td colSpan={7}>
          <CouponForm
            title="Editar cupom"
            submitLabel="Salvar"
            codeLocked
            merchantLocked
            merchants={merchants}
            defaultValues={{
              code: coupon.code,
              type: coupon.type,
              merchantId: coupon.merchantId ?? "",
              value: coupon.type === "free_shipping" ? "" : String(coupon.value),
              minOrderCents: coupon.minOrderCents != null ? String(coupon.minOrderCents) : "",
              maxUses: coupon.maxUses != null ? String(coupon.maxUses) : "",
              validFrom: "",
              validTo: "",
            }}
            onSubmit={onSave}
            onCancel={() => setEditing(false)}
            submitting={update.isPending}
            error={error}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <strong>{coupon.code}</strong>
      </td>
      <td>{coupon.merchantName ?? <span className="badge">Global</span>}</td>
      <td>{couponValue(coupon)}</td>
      <td className="muted">{couponWindow(coupon)}</td>
      <td>{coupon.maxUses != null ? `${coupon.usedCount}/${coupon.maxUses}` : String(coupon.usedCount)}</td>
      <td>
        <span className={coupon.active ? "badge badge-enriched" : "badge badge-failed"}>
          {coupon.active ? "ativo" : "inativo"}
        </span>
      </td>
      <td>
        <div className="row-actions">
          <button className="btn-ghost" type="button" onClick={() => setEditing(true)} disabled={busy}>
            Editar
          </button>
          <button className="btn-ghost" type="button" onClick={toggleActive} disabled={busy}>
            {coupon.active ? "Desativar" : "Reativar"}
          </button>
          <button className="btn-ghost" type="button" onClick={onRemove} disabled={busy}>
            Excluir
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
}

export { couponValue };
