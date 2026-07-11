import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiClientError, type StoreHoursDTO } from "@markethub/api-client";
import { useSetStoreHours, useStoreHours } from "@/api/hooks/useStoreHours";
import {
  WEEKDAY_LABELS,
  hhmmToMinutes,
  hhmmToMinutesClosing,
  isValidHHMM,
  minutesToHHMM,
} from "@/lib/hoursMask";

/**
 * Editor semanal de horário (story 52) — react-hook-form + zod. Sete linhas
 * (dom..sáb); linha "aberta" habilita os campos HH:MM. Salvar envia só os dias
 * abertos como faixas em minutos (replace-all no backend).
 */

const dayRowSchema = z
  .object({
    enabled: z.boolean(),
    opensAt: z.string(),
    closesAt: z.string(),
  })
  .superRefine((row, ctx) => {
    if (!row.enabled) return;
    if (!isValidHHMM(row.opensAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["opensAt"], message: "Hora inválida" });
    }
    if (!isValidHHMM(row.closesAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["closesAt"], message: "Hora inválida" });
    }
    const open = hhmmToMinutes(row.opensAt);
    const close = hhmmToMinutesClosing(row.closesAt);
    if (open != null && close != null && close <= open) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closesAt"],
        message: "Fechamento deve ser após a abertura",
      });
    }
  });

const hoursFormSchema = z.object({ days: z.array(dayRowSchema).length(7) });
type HoursFormValues = z.infer<typeof hoursFormSchema>;

function toFormValues(rows: StoreHoursDTO[] | undefined): HoursFormValues {
  return {
    days: WEEKDAY_LABELS.map((_, dayOfWeek) => {
      const row = rows?.find((h) => h.dayOfWeek === dayOfWeek);
      return row
        ? { enabled: true, opensAt: minutesToHHMM(row.opensAt), closesAt: minutesToHHMM(row.closesAt) }
        : { enabled: false, opensAt: "08:00", closesAt: "18:00" };
    }),
  };
}

export function StoreHoursSection({ storeId }: { storeId: string }) {
  const { data: hours, isLoading } = useStoreHours(storeId);
  const mutation = useSetStoreHours(storeId);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<HoursFormValues>({
    resolver: zodResolver(hoursFormSchema),
    defaultValues: toFormValues(hours),
  });

  // Reseta o formulário quando os dados chegam/atualizam.
  useEffect(() => {
    if (hours) reset(toFormValues(hours));
  }, [hours, reset]);

  const onSubmit = (values: HoursFormValues) => {
    const entries = values.days
      .map((row, dayOfWeek) => ({ row, dayOfWeek }))
      .filter(({ row }) => row.enabled)
      .map(({ row, dayOfWeek }) => ({
        dayOfWeek,
        opensAt: hhmmToMinutes(row.opensAt)!,
        closesAt: hhmmToMinutesClosing(row.closesAt)!,
      }));
    mutation.mutate(entries);
  };

  if (isLoading) return <p className="muted">Carregando horários…</p>;

  return (
    <section className="hours-section">
      <h3>Horário de funcionamento</h3>
      <form onSubmit={handleSubmit(onSubmit)}>
        <ul className="hours-list">
          {WEEKDAY_LABELS.map((label, i) => {
            const enabled = watch(`days.${i}.enabled`);
            const dayErr = errors.days?.[i];
            return (
              <li key={label} className="hours-row">
                <label className="checkbox">
                  <input type="checkbox" {...register(`days.${i}.enabled`)} />
                  <span>{label}</span>
                </label>
                {enabled ? (
                  <div className="hours-inputs">
                    <Controller
                      control={control}
                      name={`days.${i}.opensAt`}
                      render={({ field }) => (
                        <input
                          className="input input-time"
                          placeholder="08:00"
                          aria-label={`${label} abre`}
                          {...field}
                        />
                      )}
                    />
                    <span>às</span>
                    <Controller
                      control={control}
                      name={`days.${i}.closesAt`}
                      render={({ field }) => (
                        <input
                          className="input input-time"
                          placeholder="18:00"
                          aria-label={`${label} fecha`}
                          {...field}
                        />
                      )}
                    />
                  </div>
                ) : (
                  <span className="muted">Fechado</span>
                )}
                {dayErr?.opensAt && <p className="error">{dayErr.opensAt.message}</p>}
                {dayErr?.closesAt && <p className="error">{dayErr.closesAt.message}</p>}
              </li>
            );
          })}
        </ul>

        {mutation.isError && (
          <p className="error">
            {mutation.error instanceof ApiClientError
              ? mutation.error.body.message
              : "Falha ao salvar o horário."}
          </p>
        )}
        {mutation.isSuccess && <p className="success">Horário salvo.</p>}

        <button className="btn-primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando…" : "Salvar horário"}
        </button>
      </form>
    </section>
  );
}
