import { useState } from "react";
import { ApiClientError } from "@markethub/api-client";
import type { CouponDTO } from "@markethub/api-client";
import {
  useCoupons,
  useCreateCoupon,
  useDeleteCoupon,
  useUpdateCoupon,
} from "@/api/hooks/useCoupons";
import { buildCouponPayload, CouponForm, type CouponFormValues } from "@/components/CouponForm";

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

/** Resumo do valor conforme o tipo (para a coluna tipo/valor). */
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
 * Tela de cupons da rede (story 53). Owner/administrador gerenciam os cupons das
 * redes no escopo (backend reforça a capability). Orquestra hooks + componentes;
 * sem fetch inline.
 */
export function Coupons() {
  const { data: coupons, isLoading } = useCoupons();
  const [creating, setCreating] = useState(false);

  if (creating) {
    return <CreateCoupon onDone={() => setCreating(false)} />;
  }

  return (
    <section>
      <div className="page-head">
        <h1>Cupons</h1>
        <button className="btn-primary" type="button" onClick={() => setCreating(true)}>
          Novo cupom
        </button>
      </div>

      {isLoading && <p className="muted">Carregando…</p>}
      {coupons && coupons.length === 0 && <p className="muted">Nenhum cupom ainda.</p>}
      {coupons && coupons.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo/valor</th>
              <th>Validade</th>
              <th>Usos</th>
              <th>Ativo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <CouponRow key={c.id} coupon={c} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CreateCoupon({ onDone }: { onDone: () => void }) {
  const mutation = useCreateCoupon();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (values: CouponFormValues) => {
    setError(null);
    mutation.mutate(buildCouponPayload(values), {
      onSuccess: onDone,
      onError: (e) => setError(errMessage(e, "Falha ao cadastrar cupom.")),
    });
  };

  return (
    <CouponForm onSubmit={onSubmit} onCancel={onDone} submitting={mutation.isPending} error={error} />
  );
}

function CouponRow({ coupon }: { coupon: CouponDTO }) {
  const update = useUpdateCoupon();
  const remove = useDeleteCoupon();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = (values: CouponFormValues) => {
    setError(null);
    const payload = buildCouponPayload(values);
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
        <td colSpan={6}>
          <CouponForm
            title="Editar cupom"
            submitLabel="Salvar"
            codeLocked
            defaultValues={{
              code: coupon.code,
              type: coupon.type,
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
