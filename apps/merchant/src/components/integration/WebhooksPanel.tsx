import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiClientError } from "@markethub/api-client";
import type { WebhookCreatedDTO } from "@markethub/api-client";
import {
  useCreateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWebhooks,
} from "@/api/hooks/useIntegration";

/**
 * Painel de webhooks de saída assinados (story 09). Criação revela o secret de
 * assinatura UMA única vez. Lista mostra status da última entrega + ações testar/
 * remover. Eventos do MVP: order.created e order.status_changed.
 */
const EVENTS = ["order.created", "order.status_changed"] as const;

const schema = z.object({
  url: z.string().trim().url("URL inválida"),
  events: z.array(z.string()).min(1, "Selecione ao menos um evento"),
});
type Values = z.infer<typeof schema>;

function errMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.body.message : "Falha na operação.";
}

export function WebhooksPanel() {
  const { data: hooks, isLoading } = useWebhooks();
  const create = useCreateWebhook();
  const remove = useDeleteWebhook();
  const test = useTestWebhook();
  const [revealed, setRevealed] = useState<WebhookCreatedDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { url: "", events: [...EVENTS] },
  });

  const onCreate = (v: Values) => {
    setError(null);
    create.mutate(
      { url: v.url, events: v.events },
      {
        onSuccess: (res) => {
          setRevealed(res);
          reset();
        },
        onError: (e) => setError(errMessage(e)),
      },
    );
  };

  return (
    <div>
      {revealed && (
        <div className="reveal-modal" role="dialog" aria-label="Webhook criado">
          <p>
            <strong>Copie o secret agora.</strong> Ele assina os webhooks (HMAC) e não será
            exibido de novo.
          </p>
          <code className="reveal-secret">{revealed.secret}</code>
          <button className="btn-primary" type="button" onClick={() => setRevealed(null)}>
            Entendi, fechei
          </button>
        </div>
      )}

      <form className="store-form" onSubmit={handleSubmit(onCreate)}>
        <label className="field">
          <span>URL do webhook</span>
          <input className="input" placeholder="https://seu-erp/webhooks" {...register("url")} />
          {errors.url && <p className="error">{errors.url.message}</p>}
        </label>
        <fieldset className="field">
          <span>Eventos</span>
          {EVENTS.map((e) => (
            <label key={e} className="checkbox">
              <input type="checkbox" value={e} {...register("events")} />
              <span>{e}</span>
            </label>
          ))}
          {errors.events && <p className="error">{errors.events.message}</p>}
        </fieldset>
        <button className="btn-primary" type="submit" disabled={create.isPending}>
          {create.isPending ? "Criando…" : "Adicionar webhook"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {testMsg && <p className="muted">{testMsg}</p>}

      {isLoading && <p className="muted">Carregando…</p>}
      {hooks && hooks.length === 0 && <p className="muted">Nenhum webhook cadastrado.</p>}
      {hooks && hooks.length > 0 && (
        <ul className="list">
          {hooks.map((w) => (
            <li key={w.id} className="list-item">
              <div>
                <strong>{w.url}</strong>
                {!w.active && <span className="badge-muted"> inativo</span>}
                <div className="muted">
                  {w.events.join(", ")} · secret {w.secretMasked}
                  {w.lastDeliveryStatus
                    ? ` · última entrega: ${w.lastDeliveryStatus}`
                    : " · sem entregas"}
                </div>
              </div>
              <div className="row-actions">
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={test.isPending}
                  onClick={() => {
                    setTestMsg(null);
                    test.mutate(w.id, {
                      onSuccess: () => setTestMsg("Ping de teste enfileirado."),
                      onError: (e) => setTestMsg(errMessage(e)),
                    });
                  }}
                >
                  Testar
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(w.id)}
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
