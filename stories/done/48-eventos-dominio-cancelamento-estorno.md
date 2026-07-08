# Plan: Eventos de domínio (parte 3) — `order.canceled` + estorno durável com retry

## Context

Continuação do trabalho event-driven (stories 45/46). A infra (outbox + relay + handler idempotente)
vem da **45**; a 46 cria `order.created` e `picking.done`. Esta story ataca o fluxo de
**cancelamento/estorno** — o candidato mais grave que restou, porque envolve **dinheiro do cliente**
e hoje não tem garantia nem retry.

### Problemas concretos (hoje)

1. **`OrdersService.cancel()`** (`services/api/src/marketplace/orders.service.ts:261-311`) — mesmo
   padrão gordo do antigo `markPaid`: após a TX que cancela order + groups + pickTasks, roda
   sequencial no request do cliente:
   - `scheduling.release(deliverySlotId)` — libera vaga do slot;
   - `refund.issueCancelRefund(id)` — **chamada ao provider Pagar.me dentro do request**;
   - `tracking.emit` + `void integration.emit`/`orderEvents` (fire-and-forget).

   **Crash entre a TX e o refund** = pedido cancelado, estorno nunca emitido — cliente pagou,
   cancelou, dinheiro não volta. Mesma classe do "pedido órfão" da 45, porém pior (dinheiro).

2. **Refund falho morre em log** (`services/api/src/payment/refund.service.ts:62-65`): o `catch` da
   chamada ao provider marca `Refund.status = "failed"` e loga. **Sem retry.** Provider fora do ar
   por 30s = estorno perdido, só descoberto em auditoria manual.

3. **Estorno de shortfall** (`refund.service.ts:68` `maybeIssueRefundForOrder`, chamado sincrono em
   `picking-session.service.ts:179` ao concluir a sessão de picking): reembolso parcial de itens em
   falta. Mesmo padrão — provider no caminho, falha sem retry.

### Decisões travadas (herdadas das stories 45/46 — não re-discutir)

- Barramento = outbox + BullMQ. NÃO `@nestjs/event-emitter`.
- Emissão via `OutboxPublisher.publish` **dentro da TX** do agregado.
- Relay por poll + fan-out por subscriber; retry isolado por handler.
- Handlers idempotentes (at-least-once; dedupe `eventId+handler`).
- Idempotência de refund já existe no domínio: `unique(orderId)` em `Refund` — preservar e usar.

## Desenho

> Pré-requisito: story 45 mergeada (publisher/relay/base). Ideal após a 46 (reusa `picking.done`).

### Evento novo: `order.canceled`

- `cancel()` passa a: validar cancelabilidade (inalterado), executar a TX de cancelamento
  (pickTasks + groups + order) e **emitir `order.canceled` na mesma TX**. Payload mínimo
  (`orderId`, `deliverySlotId` se houver; handler relê estado).
- Side-effects viram handlers independentes idempotentes:
  - **`liberar-slot`** — `scheduling.release(deliverySlotId)` quando o pedido tinha slot; re-entrega
    não libera duas vezes (guard `ProcessedEvent` + release idempotente — conferir/ajustar
    `scheduling.release` p/ tolerar chamada repetida).
  - **`emitir-estorno`** — `issueCancelRefund(orderId)`; idempotente via `unique(orderId)` existente.
  - **`notificar-canceled`** — `tracking.emit` + `integration.emit`/`orderEvents.statusChanged`
    por grupo (hoje inline/fire-and-forget).
- Resposta HTTP do `cancel()` preserva contrato: continua retornando o pedido cancelado
  imediatamente; estorno/notificação ficam assíncronos. **Nota de UX/API:** o estado do refund já é
  exposto via `detail()` (`refund { status }`) — o app pode exibir "estorno em processamento".

### Retry de estorno (o ganho central)

- Handler `emitir-estorno` roda em fila BullMQ própria com **retry/backoff** (config explícita:
  attempts + backoff exponencial; valores decididos na impl e documentados no código).
- Ajuste no `RefundService`: falha do provider deve **propagar erro** (job falha → BullMQ retenta)
  em vez de engolir no `catch` e cravar `failed`. Manter a marcação `failed` apenas no
  **esgotamento** dos retries (listener de job failed definitivo ou última tentativa), para o estado
  do domínio continuar auditável. A corrida "refund já existe" (unique) continua short-circuit
  silencioso — é o caminho idempotente, não erro.

### Shortfall pega carona no `picking.done` (story 46)

- Adicionar handler **`verificar-shortfall-refund`** inscrito em `picking.done`: chama
  `maybeIssueRefundForOrder(orderId)` (já idempotente: `order.refund` existente → return; gatilho
  "todas as separações concluídas" já embutido).
- Remover a chamada síncrona de `picking-session.service.ts:179` — o fluxo passa pelo evento.
- Mesmo tratamento de retry do provider (fila com backoff; erro propaga).

### Fora de escopo

- Push notifications assíncronas (`pushOwner` inline em handoff/substitution) — backlog, sem story.
- Ack-fast do webhook inbound Pagar.me — desnecessário após a 45 (markPaid fica leve).
- Refund parcial novo/regras de negócio de estorno — nada muda no cálculo, só no transporte.
- Dashboard/observabilidade de refunds falhos — futuro.

## Validação

Camada tocada: **backend `services/api`** (`marketplace`, `payment`, `picking`, `scheduling`,
`events`). Sem mudança de schema esperada (eventos usam a infra da 45); se precisar de índice novo,
migration nova + `pnpm --filter @markethub/api prisma:generate`.

1. **Unit — `pnpm --filter @markethub/api test`**, cobrindo:
   - **`cancel()` migrado:** TX cancela e **emite `order.canceled` dentro da TX**; guards de
     cancelabilidade preservados (status inválido / separação iniciada → `CANNOT_CANCEL`, sem
     evento); resposta imediata preservada; não chama mais refund/scheduling/notificação inline.
   - **`liberar-slot`:** libera quando há slot; sem slot → no-op; re-entrega não libera duas vezes.
   - **`emitir-estorno`:** pedido pago → `issueCancelRefund`; pedido não-pago → no-op (guard já
     existente); re-entrega não cria segundo refund (`unique(orderId)`); **falha do provider
     propaga erro** (job retenta) e só marca `failed` no esgotamento; corrida do unique →
     short-circuit sem erro.
   - **`notificar-canceled`:** tracking + integration/orderEvents por grupo; idempotente.
   - **`verificar-shortfall-refund`:** inscrito em `picking.done`; chama
     `maybeIssueRefundForOrder`; casos já cobertos no spec do refund (sem shortfall → no-op; refund
     existente → no-op) continuam valendo via evento; chamada síncrona removida do
     `picking-session` (spec ajustado).
   - **Retry isolado:** falha de `emitir-estorno` não bloqueia `liberar-slot`/`notificar-canceled`.
2. **Regressão:** specs existentes de `orders.service.cancel`, `refund.service` (ambos os fluxos) e
   `picking-session.service` continuam verdes, com expectativas ajustadas de inline → evento **sem
   perder asserção** do comportamento final (slot liberado, estorno emitido, notificação disparada).

> **Gate de cobertura (trava a story):** todo caminho novo ou alterado tem teste correspondente —
> nenhum handler/emissão novo entra sem teste. Rodar `pnpm --filter @markethub/api test:coverage`;
> **não reduzir** a cobertura dos módulos afetados (piso global 80% linhas; diff ≥ 90%). Sem
> `skip`/`only`/`xfail` sem justificativa no código (CLAUDE.md).

## Dependências

- **Bloqueada pela story 45** (infra outbox/relay/idempotência).
- **Depende da 46** para o handler de shortfall (`picking.done`); se implementada antes da 46, o
  shortfall fica pendente e entra quando o evento existir — o restante (`order.canceled`) não
  depende.
