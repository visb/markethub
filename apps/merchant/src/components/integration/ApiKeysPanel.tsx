import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiClientError } from "@markethub/api-client";
import type { ApiKeyCreatedDTO } from "@markethub/api-client";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/api/hooks/useIntegration";

/**
 * Painel de api-keys de entrada (story 09). Criação revela a chave UMA única vez
 * (modal "copie agora"); a lista nunca expõe o valor — só prefixo + metadados.
 */
const schema = z.object({ name: z.string().trim().min(1, "Informe um nome") });
type Values = z.infer<typeof schema>;

function errMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.body.message : "Falha na operação.";
}

export function ApiKeysPanel() {
  const { data: keys, isLoading } = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const [revealed, setRevealed] = useState<ApiKeyCreatedDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "" } });

  const onCreate = (v: Values) => {
    setError(null);
    create.mutate(v.name, {
      onSuccess: (res) => {
        setRevealed(res);
        reset();
      },
      onError: (e) => setError(errMessage(e)),
    });
  };

  return (
    <div>
      {revealed && (
        <div className="reveal-modal" role="dialog" aria-label="Api-key criada">
          <p>
            <strong>Copie agora.</strong> Esta chave não será exibida novamente.
          </p>
          <code className="reveal-secret">{revealed.key}</code>
          <button className="btn-primary" type="button" onClick={() => setRevealed(null)}>
            Entendi, fechei
          </button>
        </div>
      )}

      <form className="inline-form" onSubmit={handleSubmit(onCreate)}>
        <label className="field">
          <span>Nova api-key</span>
          <input className="input" placeholder="Ex.: ERP da loja" {...register("name")} />
          {errors.name && <p className="error">{errors.name.message}</p>}
        </label>
        <button className="btn-primary" type="submit" disabled={create.isPending}>
          {create.isPending ? "Gerando…" : "Gerar"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      {isLoading && <p className="muted">Carregando…</p>}
      {keys && keys.length === 0 && <p className="muted">Nenhuma api-key ainda.</p>}
      {keys && keys.length > 0 && (
        <ul className="list">
          {keys.map((k) => (
            <li key={k.id} className="list-item">
              <div>
                <strong>{k.name}</strong>
                {k.revokedAt && <span className="badge-muted"> revogada</span>}
                <div className="muted">
                  {k.prefix}… · criada {new Date(k.createdAt).toLocaleDateString("pt-BR")}
                </div>
              </div>
              {!k.revokedAt && (
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(k.id)}
                >
                  Revogar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
