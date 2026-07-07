# Plan: Push notifications assíncronas — fila BullMQ atrás do `PushService`

## Context

Último item da rodada event-driven (stories 45/46/48). As notificações push (S5.6) são disparadas
**inline, com `await`, no caminho de fluxos quentes** do picking/entrega:

- `picking/handoff.service.ts` — `pushOwner(...)` (3 pontos) → `push.sendToUser`;
- `picking/substitution.service.ts` — idem;
- `driver/store-delivery.service.ts:85` — `push.sendToUser(driverId, ...)`.

`PushService.sendToUser` (`services/api/src/notifications/push.service.ts:36`) faz: busca
`deviceToken`s no banco → `provider.send(...)` (mock/FCM por env) → limpa tokens inválidos. Tudo
dentro do request do picker/entregador. Problemas:

1. **Latência do provider no caminho quente** — FCM lento/instável atrasa a resposta de handoff/
   substituição/entrega, fluxos operados em loja com pressa.
2. **Zero retry** — o `try/catch` engole qualquer falha (`logger.warn`) e o push some. Blip de rede
   = notificação perdida.

**Decisão de arquitetura (diferente das stories 45-48):** push é side-effect **não-crítico** —
perda ocasional é tolerável, não envolve dinheiro nem estado de pedido. Portanto **NÃO usa outbox**
(custo de TX/tabela não se justifica). Basta **fila BullMQ dedicada** (padrão já existente no repo:
`erp`, `enrichment`, `integration/webhook`): tira o provider do caminho do request e ganha retry
leve de graça.

### Decisões travadas

- **Fachada preservada:** `sendToUser(userId, message)` mantém a assinatura; por baixo passa a
  **enfileirar** em vez de chamar o provider. Call sites (handoff, substitution, store-delivery,
  notifications.controller) **não mudam**.
- **Sem outbox, sem `ProcessedEvent`:** push duplicado ou perdido em janela rara é aceitável;
  não sobre-engenheirar. Best-effort continua sendo o contrato (docstring atual já diz isso).
- **Retry leve com descarte:** poucas tentativas, backoff curto, e o job **morre** após esgotar —
  push atrasado demais (ex.: "pedido pronto" chegando 1h depois) é pior que não chegar. Valores
  (attempts/backoff) decididos na impl e documentados no código.
- BullMQ/Redis já disponíveis via `QueueModule` global (`queue/queue.module.ts`).

## Desenho

- **Fila nova `PUSH_QUEUE`** no módulo `notifications/`:
  - `push.queue.ts` — `PushQueueService` com `enqueue(userId, message)` (padrão dos queue services
    existentes: `erp.queue.ts`, `enrichment.queue.ts`, `webhook.queue.ts`);
  - `push.processor.ts` — `@Processor` que executa o envio real (lógica atual do `sendToUser`:
    busca tokens → `provider.send` → remove tokens inválidos). Falha do provider **propaga** para o
    BullMQ retentar; após esgotar attempts, job descartado (sem dead-letter — best-effort).
- **`PushService.sendToUser`** vira thin wrapper: valida/enfileira via `PushQueueService` e retorna.
  A lógica de envio move para o processor (ou método interno compartilhado chamado pelo processor —
  decidir na impl; sem duplicar código).
- **`registerToken`/`removeToken`** seguem síncronos (são CRUD de token no request de login/logout —
  corretos como estão).
- Registro da fila: `BullModule.registerQueue({ name: PUSH_QUEUE })` no `notifications.module.ts`;
  conexão herdada do `QueueModule` global.
- **Relação com stories 45-48:** ortogonal. Os handlers `notificar-*` daquelas stories chamam
  tracking/integration/orderEvents; quando algum passar a disparar push, já pega a fila de graça via
  a mesma fachada `sendToUser`. Nenhuma dependência entre as stories.

## Fora de escopo

- Outbox/idempotência para push — decisão explícita de não usar (não-crítico).
- Novos tipos de notificação ou mudança de conteúdo/copy das mensagens.
- Dead-letter queue / dashboard de pushes falhos — best-effort, futuro se precisar.
- Trocar o provider (mock/FCM continua atrás de `PUSH_PROVIDER` por env).

## Validação

Camada tocada: **backend `services/api`** (`notifications/` + specs dos call sites). Sem mudança de
schema, sem mudança de contrato HTTP.

1. **Unit — `pnpm --filter @markethub/api test`**, cobrindo:
   - **`sendToUser` (fachada):** enfileira job com `userId` + `message` corretos; **não** chama o
     provider direto; não lança se o enqueue falhar (best-effort preservado — logar e seguir).
   - **`push.processor`:** busca tokens do usuário; sem tokens → no-op sem chamar provider; envia
     via provider; remove tokens inválidos retornados; **falha do provider propaga** (job retenta);
     config de attempts/backoff/descarte declarada e testada (job options corretos no enqueue).
   - **Specs existentes do `push.service`** (`push.service.spec.ts`): casos atuais (sem token,
     tokens inválidos, erro do provider não quebra) migram para o processor/fachada conforme o
     código mover — **sem perder asserção**.
   - **Call sites:** specs de `handoff.service`, `substitution.service`, `store-delivery.service` e
     `notifications.controller` continuam verdes (mock do `PushService`/fila ajustado; o
     comportamento observável — "disparou push para o user X" — segue assertado).
2. **Regressão:** suíte completa da api verde; nenhum fluxo de picking/entrega muda de contrato.

> **Gate de cobertura (trava a story):** todo caminho novo ou alterado tem teste correspondente —
> fila, processor e fachada não entram sem teste. Rodar `pnpm --filter @markethub/api test:coverage`;
> **não reduzir** a cobertura dos módulos afetados (piso global 80% linhas; diff ≥ 90%). Sem
> `skip`/`only`/`xfail` sem justificativa no código (CLAUDE.md).

## Dependências

- **Nenhuma.** Independe das stories 45-48 (não usa outbox). Pode ser implementada em qualquer
  ordem — é a menor e mais isolada da rodada.
