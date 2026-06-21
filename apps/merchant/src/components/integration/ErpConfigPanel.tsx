import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiClientError } from "@markethub/api-client";
import { useErpConfig, usePutErpConfig } from "@/api/hooks/useIntegration";

/**
 * Form de config de ERP (story 09) dirigido pelo tipo de conector. MVP: csv →
 * campo `dir`. Segredos vêm mascarados do backend; reenviar o mascarado mantém o
 * valor atual (o backend faz o merge). rhf + zod (CLAUDE.md).
 */
const schema = z.object({
  connectorType: z.string().min(1, "Selecione o conector"),
  dir: z.string().trim(),
  baseUrl: z.string().trim(),
  apiKey: z.string().trim(),
});
type Values = z.infer<typeof schema>;

function errMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.body.message : "Falha ao salvar a configuração.";
}

export function ErpConfigPanel() {
  const { data, isLoading } = useErpConfig();
  const mutation = usePutErpConfig();

  const config = (data?.connectorConfig ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      connectorType: data?.connectorType ?? data?.availableTypes?.[0] ?? "",
      dir: str(config.dir),
      baseUrl: str(config.baseUrl),
      apiKey: str(config.apiKey),
    },
  });

  // limpa a mensagem de sucesso quando o tipo muda
  useEffect(() => {
    if (mutation.isSuccess) mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch("connectorType")]);

  if (isLoading) return <p className="muted">Carregando…</p>;

  const type = watch("connectorType");
  const onSubmit = (v: Values) => {
    const connectorConfig: Record<string, unknown> = {};
    if (type === "csv") {
      connectorConfig.dir = v.dir;
    } else {
      if (v.baseUrl) connectorConfig.baseUrl = v.baseUrl;
      if (v.apiKey) connectorConfig.apiKey = v.apiKey;
    }
    mutation.mutate({ connectorType: v.connectorType, connectorConfig });
  };

  return (
    <form className="store-form" onSubmit={handleSubmit(onSubmit)}>
      <label className="field">
        <span>Conector</span>
        <select className="input" {...register("connectorType")}>
          {(data?.availableTypes ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {errors.connectorType && <p className="error">{errors.connectorType.message}</p>}
      </label>

      {type === "csv" ? (
        <label className="field">
          <span>Diretório dos CSVs</span>
          <input className="input" {...register("dir")} />
        </label>
      ) : (
        <>
          <label className="field">
            <span>Base URL</span>
            <input className="input" {...register("baseUrl")} placeholder="https://erp.exemplo/api" />
          </label>
          <label className="field">
            <span>API key (do ERP)</span>
            <input className="input" {...register("apiKey")} placeholder="deixe como está p/ manter" />
          </label>
        </>
      )}

      {mutation.isError && <p className="error">{errMessage(mutation.error)}</p>}
      {mutation.isSuccess && <p className="muted">Configuração salva.</p>}

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando…" : "Salvar"}
        </button>
        <button
          className="btn-ghost"
          type="button"
          onClick={() => reset()}
          disabled={mutation.isPending}
        >
          Descartar
        </button>
      </div>
    </form>
  );
}
