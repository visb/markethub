import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { expandSlotBatch, type SlotBatchSpec } from "@/lib/slotBatch";

/**
 * Formulário "gerar semana" (story 55) — react-hook-form + zod. Período + dias da
 * semana + janela diária + duração + capacidade. Mostra o total previsto (bate
 * com os POSTs disparados) antes de confirmar; a expansão de janelas é pura
 * (`expandSlotBatch`) e a tela dispara os POSTs sequenciais.
 */
export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^\d{2}:\d{2}$/;

export const slotBatchFormSchema = z
  .object({
    dateFrom: z.string().regex(dateRe, "Informe a data inicial"),
    dateTo: z.string().regex(dateRe, "Informe a data final"),
    weekdays: z.array(z.number()).min(1, "Escolha ao menos um dia"),
    windowStart: z.string().regex(timeRe, "Início inválido"),
    windowEnd: z.string().regex(timeRe, "Fim inválido"),
    durationMin: z.coerce.number().int().min(5, "Mínimo 5 minutos"),
    capacity: z.coerce.number().int().min(1, "Capacidade ≥ 1"),
  })
  .refine((v) => v.dateTo >= v.dateFrom, { message: "Fim antes do início", path: ["dateTo"] })
  .refine((v) => v.windowEnd > v.windowStart, { message: "Janela inválida", path: ["windowEnd"] });
export type SlotBatchFormValues = z.infer<typeof slotBatchFormSchema>;

/** Total previsto a partir dos valores correntes do form (0 se inconsistente). */
export function previewCount(values: Partial<SlotBatchFormValues>): number {
  const spec: SlotBatchSpec = {
    dateFrom: values.dateFrom ?? "",
    dateTo: values.dateTo ?? "",
    weekdays: values.weekdays ?? [],
    windowStart: values.windowStart ?? "",
    windowEnd: values.windowEnd ?? "",
    durationMin: Number(values.durationMin) || 0,
  };
  return expandSlotBatch(spec).length;
}

export function SlotBatchForm({
  onSubmit,
  submitting,
  error,
  result,
}: {
  onSubmit: (values: SlotBatchFormValues) => void;
  submitting?: boolean;
  error?: string | null;
  result?: { created: number; skipped: number } | null;
}) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SlotBatchFormValues>({
    resolver: zodResolver(slotBatchFormSchema),
    defaultValues: {
      dateFrom: "",
      dateTo: "",
      weekdays: [1, 2, 3, 4, 5],
      windowStart: "08:00",
      windowEnd: "20:00",
      durationMin: 60,
      capacity: 5,
    },
  });

  const total = previewCount(watch());

  return (
    <form className="slot-batch-form" onSubmit={handleSubmit(onSubmit)}>
      <h3>Gerar semana</h3>

      <div className="field-row">
        <label className="field">
          <span>De</span>
          <input className="input" type="date" {...register("dateFrom")} />
          {errors.dateFrom && <p className="error">{errors.dateFrom.message}</p>}
        </label>
        <label className="field">
          <span>Até</span>
          <input className="input" type="date" {...register("dateTo")} />
          {errors.dateTo && <p className="error">{errors.dateTo.message}</p>}
        </label>
      </div>

      <fieldset className="field weekdays">
        <legend>Dias da semana</legend>
        <Controller
          control={control}
          name="weekdays"
          render={({ field }) => (
            <div className="weekday-options">
              {WEEKDAY_LABELS.map((label, day) => {
                const checked = field.value.includes(day);
                return (
                  <label key={day} className="weekday-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      aria-label={label}
                      onChange={(e) => {
                        field.onChange(
                          e.target.checked
                            ? [...field.value, day].sort((a, b) => a - b)
                            : field.value.filter((d) => d !== day),
                        );
                      }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          )}
        />
        {errors.weekdays && <p className="error">{errors.weekdays.message}</p>}
      </fieldset>

      <div className="field-row">
        <label className="field">
          <span>Início da janela</span>
          <input className="input" type="time" {...register("windowStart")} />
          {errors.windowStart && <p className="error">{errors.windowStart.message}</p>}
        </label>
        <label className="field">
          <span>Fim da janela</span>
          <input className="input" type="time" {...register("windowEnd")} />
          {errors.windowEnd && <p className="error">{errors.windowEnd.message}</p>}
        </label>
        <label className="field">
          <span>Duração (min)</span>
          <input className="input" type="number" min={5} step={5} {...register("durationMin")} />
          {errors.durationMin && <p className="error">{errors.durationMin.message}</p>}
        </label>
        <label className="field">
          <span>Capacidade</span>
          <input className="input" type="number" min={1} {...register("capacity")} />
          {errors.capacity && <p className="error">{errors.capacity.message}</p>}
        </label>
      </div>

      <p className="muted preview">
        {total > 0 ? `${total} slot(s) serão gerados` : "Nenhum slot para os parâmetros atuais"}
      </p>

      {error && <p className="error">{error}</p>}
      {result && (
        <p className="muted result">
          {result.created} criado(s){result.skipped > 0 ? ` · ${result.skipped} pulado(s)` : ""}
        </p>
      )}

      <button className="btn-primary" type="submit" disabled={submitting || total === 0}>
        {submitting ? "Gerando…" : "Gerar slots"}
      </button>
    </form>
  );
}
