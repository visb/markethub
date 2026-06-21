import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { MerchantStoreDetailDTO } from "@markethub/api-client";

/**
 * Formulário de loja (story 08) — react-hook-form + zod (CLAUDE.md). Lat/lng não
 * são editados aqui: o backend geocodifica o endereço (override manual fora de escopo).
 */
const storeSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da loja"),
  externalId: z.string().trim(),
  street: z.string().trim(),
  number: z.string().trim(),
  district: z.string().trim(),
  city: z.string().trim(),
  state: z.string().trim(),
  zipCode: z.string().trim(),
  avgPrepMinutes: z.coerce.number().int().min(0, "Tempo inválido"),
  active: z.boolean(),
});
export type StoreFormValues = z.infer<typeof storeSchema>;

/** Payload limpo para a API: strings vazias viram null (campos opcionais). */
export function toStorePayload(v: StoreFormValues) {
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    name: v.name.trim(),
    externalId: orNull(v.externalId),
    street: orNull(v.street),
    number: orNull(v.number),
    district: orNull(v.district),
    city: orNull(v.city),
    state: orNull(v.state),
    zipCode: orNull(v.zipCode),
    avgPrepMinutes: v.avgPrepMinutes,
    active: v.active,
  };
}

function defaults(store?: MerchantStoreDetailDTO): StoreFormValues {
  return {
    name: store?.name ?? "",
    externalId: store?.externalId ?? "",
    street: store?.street ?? "",
    number: store?.number ?? "",
    district: store?.district ?? "",
    city: store?.city ?? "",
    state: store?.state ?? "",
    zipCode: store?.zipCode ?? "",
    avgPrepMinutes: store?.avgPrepMinutes ?? 15,
    active: store?.active ?? true,
  };
}

export function StoreForm({
  store,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  store?: MerchantStoreDetailDTO;
  onSubmit: (values: StoreFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: defaults(store),
  });

  return (
    <form className="store-form" onSubmit={handleSubmit(onSubmit)}>
      <h2>{store ? "Editar loja" : "Nova loja"}</h2>

      <label className="field">
        <span>Nome</span>
        <input className="input" {...register("name")} />
        {errors.name && <p className="error">{errors.name.message}</p>}
      </label>

      <label className="field">
        <span>Rua</span>
        <input className="input" {...register("street")} />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Número</span>
          <input className="input" {...register("number")} />
        </label>
        <label className="field">
          <span>Bairro</span>
          <input className="input" {...register("district")} />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Cidade</span>
          <input className="input" {...register("city")} />
        </label>
        <label className="field">
          <span>UF</span>
          <input className="input" {...register("state")} />
        </label>
        <label className="field">
          <span>CEP</span>
          <input className="input" {...register("zipCode")} />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Tempo de preparo (min)</span>
          <input className="input" type="number" {...register("avgPrepMinutes")} />
          {errors.avgPrepMinutes && <p className="error">{errors.avgPrepMinutes.message}</p>}
        </label>
        <label className="field">
          <span>ID no ERP</span>
          <input className="input" {...register("externalId")} />
        </label>
      </div>

      <label className="checkbox">
        <input type="checkbox" {...register("active")} />
        <span>Loja ativa</span>
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar"}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
