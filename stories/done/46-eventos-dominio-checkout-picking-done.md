# Plan: Eventos de domínio (parte 2) — `checkout → order.created → cobrança PIX` e `picking.done → iniciar entrega`

## Context

**Story 2 de 2** do trabalho de arquitetura event-driven no backend. A **story 45** entregou a
infraestrutura: `OutboxPublisher` tipado (grava `OutboxEvent` na mesma TX do agregado), relay por
poll com fan-out por subscriber, base de handler idempotente (`ProcessedEvent`, unique
`eventId+handler`), e migrou o fluxo `order.paid`. Esta story **reusa essa infra** — não cria
barramento novo, só adiciona eventos e handlers.

Dois fluxos ainda acoplados/frágeis:

1. **Checkout → pagamento.** Hoje `OrdersService.checkout()`
   (`services/api/src/marketplace/orders.service.ts`) cria order + groups numa TX, limpa o carrinho
   e dispara `void this.integration.emit(...)` + `orderEvents.created(...)` **fora da TX**
   (fire-and-forget). A geração da cobrança PIX é passo separado (o webhook Pagar.me depois chama
   `markPaid`). Queremos que a **cobrança PIX seja disparada por evento** `order.created` emitido na
   TX do checkout — não por fire-and-forget nem por chamada acoplada.
2. **Picking concluído → entrega.** A transição que hoje encadeia o início da entrega/handoff a
   partir da conclusão do picking (`services/api/src/picking/`) vira evento `picking.done`, com o
   início da entrega como handler idempotente independente.

### Decisões travadas (herdadas da story 45 — não re-discutir)

- Barramento = outbox + BullMQ (infra da story 45). **NÃO** `@nestjs/event-emitter`.
- Emissão via `OutboxPublisher.publish` **dentro da TX** do agregado (atômico).
- Relay por **poll** + **fan-out por subscriber**; retry isolado por handler.
- Handlers **idempotentes** (at-least-once; dedupe `eventId+handler`).

## Desenho

> Pré-requisito: story 45 mergeada (publisher, relay, base idempotente, tabelas). Esta story **não**
> altera o schema de eventos; se algum evento exigir novo índice em `OutboxEvent.aggregateId`,
> adicionar via migration nova.

### Fluxo A — `order.created → gerar-cobranca-pix`

- No `checkout()`, **dentro da TX** que cria order + groups, emitir `order.created` via
  `OutboxPublisher` (substituindo/complementando o `void integration.emit` pós-commit — o webhook
  outbound ao merchant e o socket store room passam a ser handlers de `order.created`, não chamadas
  inline fire-and-forget). Payload mínimo (orderId + o necessário; handler relê estado).
- Handler **`gerar-cobranca-pix`**: cria a cobrança PIX via a camada de pagamento existente
  (`payment/`, provider atrás de interface + mock — não chamar SDK cru). Idempotente: se já existe
  cobrança para o pedido, short-circuit (além do guard `ProcessedEvent`).
- Handlers de notificação (`notificar-created`): `integration.emit(order.created)` +
  `orderEvents.created(...)` por grupo — o que hoje é fire-and-forget vira handler durável.
- **Preservar contrato do endpoint:** `checkout()` continua retornando `detail(...)` ao cliente
  imediatamente; a cobrança/notiticação passam a ser assíncronas (o cliente já busca o PIX/estado
  via fluxo existente). Confirmar na implementação que nenhum consumidor do checkout dependia da
  cobrança existir de forma síncrona na resposta; se dependia, ajustar o contrato explicitamente.

### Fluxo B — `picking.done → iniciar-entrega`

- Na transição que marca o picking do pedido como concluído (`services/api/src/picking/`), emitir
  `picking.done` via `OutboxPublisher` **na mesma TX** da transição de status.
- Handler **`iniciar-entrega`**: dispara o início da entrega/handoff (own-store — o próprio mercado
  entrega ou cliente retira; `driver`/`store-delivery`). Idempotente: reentrega não reabre entrega já
  iniciada.
- Preservar os efeitos de notificação/tracking associados (via handler, não inline).

### Fora de escopo

- Qualquer mudança na infra da story 45 (publisher/relay/base idempotente/tabelas) — só consumo.
- Adotar `@nestjs/event-emitter`.
- Migrar outros fluxos além dos dois acima (ex.: cancelamento/estorno) — futuro, se surgir.
- Mudança de UX no app cliente para o PIX assíncrono além do necessário para preservar o fluxo atual.

## Validação

Camada tocada: **backend `services/api`** (`marketplace`, `payment`, `picking`, `driver`, `events`).
Sem mudança de contrato de tipos esperada; se houver, `pnpm typecheck` + `pnpm build` + (se schema)
`pnpm --filter @markethub/api prisma:generate`.

1. **Unit — `pnpm --filter @markethub/api test`**, cobrindo:
   - **`checkout` migrado:** emite `order.created` **dentro da TX** de criação do pedido; continua
     limpando o carrinho e retornando `detail`; não faz mais o side-effect de notificação inline
     fire-and-forget (agora via handler).
   - **Handler `gerar-cobranca-pix`:** cria cobrança via a camada de pagamento (provider mock);
     idempotente — segunda entrega do mesmo evento não cria segunda cobrança (guard
     `ProcessedEvent` + guard "já existe cobrança").
   - **Handler `notificar-created`:** dispara `integration.emit` + `orderEvents.created` por grupo;
     idempotente sob reentrega.
   - **`picking.done`:** transição de conclusão emite o evento na TX; guard de idempotência da
     transição preservado.
   - **Handler `iniciar-entrega`:** inicia a entrega/handoff; reentrega não reabre entrega já
     iniciada; falha isolada não afeta outros handlers.
   - **Retry isolado:** falha de `gerar-cobranca-pix` não impede `notificar-created` (e vice-versa).
2. **E2E (se houver fluxo HTTP afetado):** `pnpm --filter @markethub/api test:e2e` do checkout —
   `POST /checkout` cria o pedido e retorna `detail`; o efeito assíncrono (cobrança) é exercitado
   processando o outbox/relay no teste (ou verificando o `OutboxEvent order.created` gravado).
3. **Regressão:** specs existentes de `orders.service` (checkout, markPaid da story 45),
   `payment.service` e picking continuam verdes; ajustar expectativas que assumiam notificação/
   cobrança inline.

> **Gate de cobertura (trava a story):** todo caminho novo ou alterado tem teste correspondente —
> nenhum handler/emissão novo entra sem teste. Rodar `pnpm --filter @markethub/api test:coverage`;
> **não reduzir** a cobertura dos módulos afetados (piso global 80% linhas; diff ≥ 90%). Sem
> `skip`/`only`/`xfail` sem justificativa no código (CLAUDE.md).

## Dependência

- **Bloqueada pela story 45** (`45-eventos-dominio-outbox-order-paid.md`): precisa de
  `OutboxPublisher`, relay e base de handler idempotente já mergeados. Implementar após a 45 fechar.
