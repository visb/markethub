# Plan: Eventos de domínio — transactional outbox + relay por poll + migração do `order.paid`

## Context

O backend orquestra side-effects de pedido de forma **imperativa e acoplada**. O caso mais gritante
é `OrdersService.markPaid()` (`services/api/src/marketplace/orders.service.ts:216`): disparado pelo
webhook de pagamento, executa em sequência, num método só, tudo síncrono:

1. `status = preparing` (order + orderGroups);
2. `erp.pushOrderGroup(g.id)` em loop por grupo;
3. `picking.generateForOrder(orderId)`;
4. `tracking.emit(orderId)` (Socket.IO realtime);
5. `integration.emit(...)` / `orderEvents.statusChanged(...)` (webhook outbound + socket store room).

Problemas: um passo que falha derruba os seguintes; retry é all-or-nothing; o `void emit` pós-commit
já usado no `checkout()` é fire-and-forget (se o processo morre entre `COMMIT` e o enqueue, o
side-effect some → pedido pago sem picking = **pedido órfão**).

**Objetivo:** desacoplar side-effects críticos via **eventos de domínio duráveis**. Esta é a
**story 1 de 2** — entrega a infraestrutura e migra o primeiro fluxo (`order.paid`). A story 2
(follow-up) migra `checkout → order.created → gerar cobrança PIX` e `picking.done → iniciar entrega`
reusando esta infra.

### Decisões travadas com o usuário (não re-discutir)

- **Barramento = transactional outbox + BullMQ.** Redis + BullMQ já existem (`queue/`, e filas em
  `erp/`, `enrichment/`, `integration/`). **NÃO** usar `@nestjs/event-emitter`: decisão explícita —
  dois barramentos com garantias diferentes (in-process não-durável vs fila durável) é footgun
  ("por que o handler não rodou depois do crash? estava no emitter, não na fila"). Outbox + BullMQ
  **já é** a camada de intenção; um barramento, uma garantia.
- **Emissão via publisher tipado.** `OutboxPublisher.publish({ type, payload, aggregateId })` grava
  uma row `OutboxEvent` **dentro da mesma transação Prisma** do agregado → atômico, zero pedido
  órfão. Emitir fora da TX é proibido para eventos críticos.
- **Relay por POLL** (decisão do usuário; **não** `LISTEN/NOTIFY`). Repeatable job BullMQ varre
  `OutboxEvent` não-publicados em intervalo curto.
- **Fan-out por subscriber, não por evento.** O relay, para cada evento lido, enfileira **1 job por
  handler inscrito** naquele tipo — não um job único do evento. Assim cada side-effect tem retry
  isolado: se `push-erp` deu certo mas `gerar-picking` falhou, só `gerar-picking` retenta.
- **Idempotência at-least-once.** BullMQ entrega ao menos uma vez → todo handler é idempotente.
  Dedupe key = `eventId + handlerName`, materializado na tabela `ProcessedEvent` (unique
  constraint). `markPaid` já é idempotente hoje (guard `status created/paid`) — preservar.
- **Custo do outbox aceito** pelo usuário (tabela + worker) em troca da garantia real.

## Desenho

### Schema (migration Prisma nova — nunca editar aplicada)

- `OutboxEvent`: `id` (cuid), `type` (string, ex. `order.paid`), `payload` (Json), `aggregateId`
  (string — indexável, ex. orderId), `createdAt`, `publishedAt` (nullable — `null` = pendente).
  Índice em `(publishedAt)` para o poll varrer pendentes; índice/consulta por `aggregateId` p/ debug.
- `ProcessedEvent`: `eventId` (fk lógica p/ OutboxEvent.id), `handler` (string), `processedAt`.
  **Unique `(eventId, handler)`** — a trava de idempotência.

> Rodar `pnpm --filter @markethub/api prisma:generate` após alterar o schema, antes do typecheck.

### Componentes (módulo novo `services/api/src/events/`)

- **`OutboxPublisher`** — `publish(tx, { type, payload, aggregateId })`: cria row `OutboxEvent`
  usando o **client transacional** recebido, para participar da TX do agregado. Sobrecarga/uso fora
  de TX só onde o agregado não abre TX própria (documentar o porquê no código).
- **Registro de subscribers** — mapa `eventType → handlerName[]`. Fonte única que o relay consulta
  para o fan-out. Pode ser um provider com decorator/coleção explícita; manter simples e tipado.
- **Relay worker** — repeatable job BullMQ (poll a cada N s, N configurável via env, default curto).
  Passo: (a) buscar lote de `OutboxEvent` com `publishedAt = null` (ordenado por `createdAt`, com
  `take` limitado); (b) para cada evento, para cada handler inscrito no `type`, enfileirar job na
  fila do handler com `jobId` determinístico derivado de `eventId+handler` (dedupe de enfileiramento
  no BullMQ) e payload `{ eventId, type, payload }`; (c) marcar `publishedAt = now()`. Idempotente:
  reprocessar um evento já publicado não deve duplicar efeito (o `jobId` determinístico + o
  `ProcessedEvent` no handler cobrem).
- **Base de handler idempotente** — helper/base que, ao processar um job, tenta inserir
  `ProcessedEvent(eventId, handler)`; se violar o unique, **short-circuit** (já processado, ack sem
  efeito); senão roda o efeito. Cada handler é um `@Processor` BullMQ com sua própria fila
  (retry/backoff próprios).

### Migração do `order.paid`

- `markPaid()` deixa de orquestrar. Passa a: aplicar a transição de status `created/paid → preparing`
  (order + groups) e **emitir `order.paid`** via `OutboxPublisher` na **mesma TX** da transição.
  Preservar o guard de idempotência atual.
- Os passos hoje inline viram **handlers independentes** de `order.paid`, cada um idempotente:
  - `push-erp` — `erp.pushOrderGroup` para cada grupo do pedido;
  - `gerar-picking` — `picking.generateForOrder(orderId)`;
  - `notificar` — `tracking.emit` + `integration.emit` / `orderEvents.statusChanged` por grupo.
- Payload do `order.paid` carrega o mínimo p/ os handlers resolverem o resto por `orderId`
  (evitar payload gordo/obsoleto; handler relê estado atual).
- Comportamento observável preservado: após pagar, o pedido chega a `preparing`, tarefas de picking
  são geradas, ERP recebe push e os canais de notificação disparam — agora com retry isolado.

### Fora de escopo (desta story)

- `checkout → order.created → gerar cobrança PIX` e `picking.done → iniciar entrega` — **story 2**.
- Substituir `@nestjs/event-emitter` (não é usado; decisão de não adotar).
- Trocar os `orderEvents`/`tracking.emit` de Socket.IO por outra coisa — seguem como estão, apenas
  passam a ser chamados de dentro do handler `notificar`.
- UI/observabilidade de fila (dashboard de outbox) — futuro, não bloqueia.

## Validação

Camada tocada: **backend `services/api`** (schema Prisma, módulo `events/`, `marketplace`,
`picking`, `erp`, `integration`). Sem mudança de frontend/contratos.

1. **Schema/client:** `pnpm --filter @markethub/api prisma:generate` antes do typecheck; migration
   nova aplicável (`prisma migrate` dev / `migrate deploy` no CI). Confirmar unique
   `(eventId, handler)` na migration.
2. **Unit — `pnpm --filter @markethub/api test`**, cobrindo:
   - **OutboxPublisher:** grava `OutboxEvent` com `type/payload/aggregateId` corretos usando o
     client transacional recebido (participa da TX); não publica fora da TX quando não deveria.
   - **Relay:** lê só `publishedAt = null`; faz fan-out de **1 job por handler inscrito** (não 1 por
     evento); marca `publishedAt`; `jobId` determinístico; reprocessar evento já publicado não
     duplica; respeita o limite de lote.
   - **Base idempotente:** primeira execução insere `ProcessedEvent` e roda o efeito; segunda
     execução (mesmo `eventId+handler`) faz short-circuit sem repetir o efeito (violação do unique).
   - **`markPaid` migrado:** transição `created/paid → preparing` aplicada; **emite `order.paid`
     dentro da TX**; idempotência preservada (segundo `markPaid` não reemite/não retransiciona);
     status inválido (`≠ created/paid`) não emite.
   - **Handlers `order.paid`:** `push-erp` chama `pushOrderGroup` por grupo; `gerar-picking` chama
     `generateForOrder`; `notificar` dispara tracking + integration/orderEvents por grupo. Cada um
     idempotente sob reentrega. Falha de um handler não afeta os outros (retry isolado).
3. **Regressão:** os specs existentes de `orders.service` (`markPaid`, cancelamento) continuam
   verdes; ajustar expectativas que assumiam orquestração inline (agora via evento) sem perder a
   asserção do comportamento final.

> **Gate de cobertura (trava a story):** todo caminho novo ou alterado tem teste correspondente —
> nenhum código novo (publisher, relay, base idempotente, handlers, `markPaid` migrado) entra sem
> teste. Rodar `pnpm --filter @markethub/api test:coverage`; **não reduzir** a cobertura dos módulos
> afetados (piso global 80% linhas; diff ≥ 90%). Sem `skip`/`only`/`xfail` sem justificativa no
> código (CLAUDE.md).

## Follow-up

- **Story 2 (`46`):** migrar `checkout → order.created → gerar-cobranca-pix` e
  `picking.done → iniciar-entrega` sobre a infra desta story (publisher/relay/idempotência já
  prontos — a story 2 só adiciona eventos e handlers).
