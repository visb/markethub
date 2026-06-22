import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { VehicleType } from "@markethub/api-client";

/**
 * Formulário de veículo da frota (story 14) — react-hook-form + zod (CLAUDE.md).
 * Valida placa (formato Mercosul/antigo) e tipo obrigatório. Usado para criar e
 * editar; `defaultValues` permite reaproveitar na edição.
 */
const TYPE_LABEL: Record<VehicleType, string> = {
  motorcycle: "Moto",
  car: "Carro",
  van: "Van",
};

// Placa Mercosul (ABC1D23) ou antiga (ABC1234) — 7 alfanuméricos.
const PLATE_RE = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;

const vehicleSchema = z.object({
  plate: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[\s-]/g, ""))
    .refine((v) => PLATE_RE.test(v), "Placa inválida"),
  type: z.enum(["motorcycle", "car", "van"]),
  description: z.string().trim().max(200).optional(),
});
export type VehicleFormValues = z.infer<typeof vehicleSchema>;

const TYPE_OPTIONS: VehicleType[] = ["motorcycle", "car", "van"];

export function VehicleForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
  error,
  submitLabel = "Cadastrar",
  title = "Novo veículo",
}: {
  defaultValues?: Partial<VehicleFormValues>;
  onSubmit: (values: VehicleFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
  submitLabel?: string;
  title?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      plate: defaultValues?.plate ?? "",
      type: defaultValues?.type ?? "motorcycle",
      description: defaultValues?.description ?? "",
    },
  });

  return (
    <form className="store-form" onSubmit={handleSubmit(onSubmit)}>
      <h2>{title}</h2>

      <label className="field">
        <span>Placa</span>
        <input className="input" {...register("plate")} />
        {errors.plate && <p className="error">{errors.plate.message}</p>}
      </label>

      <label className="field">
        <span>Tipo</span>
        <select className="input" {...register("type")}>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        {errors.type && <p className="error">{errors.type.message}</p>}
      </label>

      <label className="field">
        <span>Descrição</span>
        <input className="input" {...register("description")} />
        {errors.description && <p className="error">{errors.description.message}</p>}
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : submitLabel}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export { TYPE_LABEL };
