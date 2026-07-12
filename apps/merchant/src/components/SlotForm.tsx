import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

/**
 * Formulário de inclusão de um slot avulso (story 55) — react-hook-form + zod
 * (CLAUDE.md). Valida data + janela (fim > início) e capacidade ≥ 1. Devolve os
 * valores em relógio de parede; a tela converte para ISO ao criar.
 */
export const slotFormSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data"),
    start: z.string().regex(/^\d{2}:\d{2}$/, "Início inválido"),
    end: z.string().regex(/^\d{2}:\d{2}$/, "Fim inválido"),
    capacity: z.coerce.number().int().min(1, "Capacidade ≥ 1"),
  })
  .refine((v) => v.end > v.start, {
    message: "O fim deve ser após o início",
    path: ["end"],
  });
export type SlotFormValues = z.infer<typeof slotFormSchema>;

export function SlotForm({
  onSubmit,
  submitting,
  error,
}: {
  onSubmit: (values: SlotFormValues) => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SlotFormValues>({
    resolver: zodResolver(slotFormSchema),
    defaultValues: { date: "", start: "08:00", end: "09:00", capacity: 5 },
  });

  return (
    <form className="slot-form" onSubmit={handleSubmit(onSubmit)}>
      <h3>Adicionar slot</h3>

      <div className="field-row">
        <label className="field">
          <span>Data</span>
          <input className="input" type="date" {...register("date")} />
          {errors.date && <p className="error">{errors.date.message}</p>}
        </label>
        <label className="field">
          <span>Início</span>
          <input className="input" type="time" {...register("start")} />
          {errors.start && <p className="error">{errors.start.message}</p>}
        </label>
        <label className="field">
          <span>Fim</span>
          <input className="input" type="time" {...register("end")} />
          {errors.end && <p className="error">{errors.end.message}</p>}
        </label>
        <label className="field">
          <span>Capacidade</span>
          <input className="input" type="number" min={1} {...register("capacity")} />
          {errors.capacity && <p className="error">{errors.capacity.message}</p>}
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Adicionando…" : "Adicionar slot"}
      </button>
    </form>
  );
}
