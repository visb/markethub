# Plan: merchant — detalhe do pedido, cancelamento por grupo e alerta de novo pedido

## Context

`Orders.tsx` do merchant é um kanban realtime **read-only** de cards resumidos
(`MerchantOrderDTO` — o próprio comentário no types diz "detalhe é story futura"). Lojista não
vê itens, não cancela, não é alertado de pedido novo com som.

Estado do backend: cancelamento existe só **Order-level** e só pelo cliente
(`POST orders/:id/cancel`, invariante status ∈ {created, paid, preparing} + nenhuma PickTask
além de assigned — BUSINESS_RULES.md). Reembolso é único por Order (1:1) **mas já modelado com
`RefundComponent` por OrderGroup** — a infra de parcial existe. Story 48 entregou
`order.canceled` (outbox) com estorno durável + liberação de slot.

Decisões travadas (planning 2026-07-11):

- **Cancelamento por OrderGroup** (escolha explícita do usuário, não default — opção maior):
  merchant cancela o sub-pedido da loja dele; demais grupos seguem; último grupo ativo
  cancelado → Order inteiro vira `canceled`. Exige invariantes novas em BUSINESS_RULES.md.
- Reembolso do grupo = total do grupo com **desconto de cupom rateado proporcionalmente**
  (cupom é Order-level); vira `RefundComponent` acumulado no `Refund` 1:1 do Order, estorno
  **parcial** durável com retry (mesmo mecanismo da story 48).
- Cancelamento atrás de capability nova `orders.manage` (owner, administrador e gerente no
  escopo da loja); `orders.view` continua dando só leitura.
- Som de novo pedido: opt-in por toggle na página (autoplay policy dos browsers exige gesto),
  persistido em localStorage; badge no title da aba.

## Desenho

### Backend — cancelamento por grupo (`marketplace` + `merchant`)

1. Invariante de grupo (espelha a de Order): OrderGroup cancela se `status ∈ {created, paid,
   preparing}` e PickTask do grupo ≤ `assigned`. Senão `CANNOT_CANCEL_GROUP`.
2. `orders.service` (marketplace, dono do agregado): `cancelGroup(groupId, actor)` — na mesma
   TX: grupo → `canceled`, PickTask do grupo cancelada, slot do grupo liberado, evento outbox
   `order.group_canceled` (payload: orderId, groupId, amountCents, reason). Se era o último
   grupo ativo → Order → `canceled` (emite também o `order.canceled` existente p/ reusar
   handlers? NÃO — handler do grupo cobre; Order só muda status, sem estorno duplicado).
3. Handler do evento (events/): cria/acumula `RefundComponent` no `Refund` do Order e dispara
   estorno parcial no `PaymentProvider` (retry durável, idempotente via `ProcessedEvent` —
   padrão story 48). Push ao cliente ("itens de X foram cancelados e estornados").
4. Rateio: `amountCents` = total do grupo − desconto proporcional
   (`desconto × totalGrupo / totalOrder`). Registrar fórmula em BUSINESS_RULES.md.
5. `merchant-orders.controller`: `POST merchant/orders/groups/:id/cancel` (capability
   `orders.manage`, grupo precisa ser de loja do ator) → delega ao marketplace via barrel.
6. **Atualizar `BUSINESS_RULES.md`** (cancelamento por grupo + rateio + capability).

### Backend — detalhe do pedido

7. `GET merchant/orders/groups/:id` (`orders.view`): itens linha a linha (nome, qty/peso,
   picked/substituted/refused + substituto), fulfillment, pagamento (status/método), cliente
   (nome, telefone), timeline de marcos (timestamps existentes do grupo/task/delivery).
   DTO `MerchantOrderDetailDTO` em `packages/types`.

### Merchant app

8. Kanban: card clicável → drawer/painel lateral de detalhe (query por id, hook novo em
   `api/hooks`). Ações no drawer: **Cancelar sub-pedido** (confirm com motivo opcional;
   desabilitado com tooltip quando invariante não permite) — some atrás de
   `RequireCapability orders.manage`.
9. Som/badge: toggle 🔔 no header da página (localStorage); evento de pedido novo no socket →
   toca chime curto (asset local) + incrementa contador no `document.title` até a aba focar.

## Validação

- Backend: specs de `cancelGroup` (invariante por status/PickTask, multi-grupo segue, último
  grupo cancela Order, slot liberado, TX atômica), rateio do cupom (com/sem cupom,
  arredondamento soma exata), handler idempotente do estorno parcial, capability/escopo do
  endpoint, detalhe (grupo alheio → 404). `pnpm --filter @markethub/api test`.
- Merchant: drawer renderiza itens/substituições, cancelar dispara mutation + confirm, toggle
  de som persiste e dispara no evento (mock Audio). `pnpm --filter @markethub/merchant test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  merchant ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Cancelamento parcial de **itens** dentro do grupo (só grupo inteiro).
- Reembolso manual de valor arbitrário (admin — item 18 do backlog).
- Cancelamento por grupo iniciado pelo **cliente** (segue Order-level).
- Chat lojista ↔ cliente.
