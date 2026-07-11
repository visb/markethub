import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiClientError } from "@markethub/api-client";
import {
  useAddStoreClosure,
  useRemoveStoreClosure,
  useStoreClosures,
} from "@/api/hooks/useStoreHours";

/**
 * Fechamentos excepcionais (feriados/eventos — story 52). Lista os fechamentos +
 * formulário de inclusão (data + motivo) e remoção. react-hook-form + zod; a data
 * é validada como futura (não faz sentido fechar no passado).
 */

const todayISO = () => new Date().toISOString().slice(0, 10);

const closureFormSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data")
    .refine((d) => d >= todayISO(), "Escolha uma data futura"),
  reason: z.string().trim().max(120).optional(),
});
type ClosureFormValues = z.infer<typeof closureFormSchema>;

/** "2026-12-25" → "25/12/2026" para exibição. */
function formatBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function StoreClosuresSection({ storeId }: { storeId: string }) {
  const { data: closures, isLoading } = useStoreClosures(storeId);
  const addMutation = useAddStoreClosure(storeId);
  const removeMutation = useRemoveStoreClosure(storeId);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClosureFormValues>({
    resolver: zodResolver(closureFormSchema),
    defaultValues: { date: "", reason: "" },
  });

  const onSubmit = (values: ClosureFormValues) => {
    addMutation.mutate(
      { date: values.date, reason: values.reason?.trim() ? values.reason.trim() : null },
      { onSuccess: () => reset({ date: "", reason: "" }) },
    );
  };

  return (
    <section className="closures-section">
      <h3>Fechamentos excepcionais</h3>
      <p className="muted">Feriados ou dias em que a loja não abre, independentemente do horário.</p>

      {isLoading ? (
        <p className="muted">Carregando…</p>
      ) : closures && closures.length > 0 ? (
        <ul className="list">
          {closures.map((c) => (
            <li key={c.id} className="list-item closure-row">
              <div>
                <strong>{formatBR(c.date)}</strong>
                {c.reason && <span className="muted"> — {c.reason}</span>}
              </div>
              <button
                className="btn-ghost"
                type="button"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(c.id)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nenhum fechamento cadastrado.</p>
      )}

      <form className="closure-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="field-row">
          <label className="field">
            <span>Data</span>
            <Controller
              control={control}
              name="date"
              render={({ field }) => <input className="input" type="date" {...field} />}
            />
            {errors.date && <p className="error">{errors.date.message}</p>}
          </label>
          <label className="field">
            <span>Motivo (opcional)</span>
            <input className="input" placeholder="Feriado" {...register("reason")} />
          </label>
        </div>

        {addMutation.isError && (
          <p className="error">
            {addMutation.error instanceof ApiClientError
              ? addMutation.error.body.message
              : "Falha ao adicionar o fechamento."}
          </p>
        )}

        <button className="btn-primary" type="submit" disabled={addMutation.isPending}>
          {addMutation.isPending ? "Adicionando…" : "Adicionar fechamento"}
        </button>
      </form>
    </section>
  );
}
