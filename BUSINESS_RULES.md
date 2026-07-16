# Regras de negócio — MarketHub

Fonte canônica das **invariantes de domínio** efetivamente impostas pelo código. Cada regra aponta pro arquivo que a garante — não alterar o comportamento sem ler a origem. Se mudar a regra no código, atualizar aqui.

Convenção: enums em `services/api/prisma/schema.prisma`; regras em services do backend (`services/api/src/<domínio>`).

---

## Identidade & auth

- Autenticação centralizada em `User`. JWT carrega `userId`, `role`, `profileType`.
- `RoleName`: `customer · picker · driver · merchant · admin`.
- Toda rota exige JWT por padrão (`JwtAuthGuard` global). Abrir com `@Public()` (login, health, webhooks).
- RBAC por `@Roles(...)` + `RolesGuard` global. Rotas de admin: `@Roles("admin")`.
- Staff de loja (`StoreStaff`) tem papéis `manager · picker · driver`. Manager gerencia a loja; só manager edita oferta/estoque (`NOT_A_MANAGER`, `STORE_NOT_MANAGED`).
- *Pointer:* `src/auth/*`, `src/auth/guards/`, `src/auth/decorators/`.

---

## Catálogo, oferta & estoque

- **Produto** é o catálogo global deduplicado/enriquecido entre lojas. **Offer** = produto numa loja (preço/disponibilidade). **Stock** = quantidade por loja/produto (quantidade opcional — alguns ERPs só dão flag `available`).
- `Offer`: único por `(storeId, productId)` e `(storeId, externalId)`.
- **lockedFields (anti-sobrescrita do ERP):** campos editados manualmente pelo manager (em `Offer`/`Stock`) e pelo admin (em `Product`) ficam em `lockedFields[]` e o **sync ERP / enriquecimento NÃO sobrescreve**.
  - Só os campos **efetivamente editados** travam — o update discrimina por `undefined`, gravando/travando apenas o diff. `updatedById` registra o último editor manual.
  - *Pointer:* `src/catalog/admin-catalog.service.ts` (`updateProduct`/`unlockFields`), modelos `Offer`/`Stock`/`Product`.
- **Enrichment** (`EnrichmentStatus`: `pending · enriched · needs_review`): GTIN via Cosmos/Bluesoft + Claude p/ categoria; respeita `lockedFields`.
- **Categoria de marketplace** é curada pelo admin — é o que aparece no app cliente (≠ categoria crua do ERP).

---

## Carrinho

- **saleType** (`unit` | `weight`) dirige o input de quantidade:
  - `unit`: conta unidades (`quantity`). `INVALID_QUANTITY` se inválido.
  - `weight`: vendido por **peso em gramas** (`weightGrams`). `WEIGHT_REQUIRED` se faltar.
- Carrinho referencia `Offer` (preço/disponibilidade vivos). Checkout com carrinho vazio → `CART_EMPTY`.
- *Pointer:* `src/marketplace/cart.service.ts`, `src/marketplace/pricing.ts`.

---

## Pedido (multi-loja)

- Um **Order** do cliente se divide em **OrderGroup** por loja (sub-pedido). Cada grupo tem sua própria modalidade `fulfillment` (`delivery` | `pickup`), totais e `status`.
- Totais em **centavos**; snapshot do endereço (`addressSnapshot`) preservado caso o `Address` mude/some.
- **OrderStatus** (Order e OrderGroup): `created → paid → preparing → picking → ready_for_pickup → on_the_way → delivered`, ou `canceled`.
  - `ready_for_pickup` = separado/empacotado, aguardando coleta do entregador.
- Reembolso é **único por Order** (consolida todos os grupos) — relação 1:1 (`Order.refund`).
- *Pointer:* `src/marketplace/orders.service.ts`, modelos `Order`/`OrderGroup`/`OrderItem`.

### Cancelamento

- Order só cancela se status ∈ {`created`, `paid`, `preparing`} **e** nenhuma PickTask passou de `queued`/`assigned`. Caso contrário `CANNOT_CANCEL`.
- Cancelar libera o slot de entrega reservado.
- *Pointer:* `src/marketplace/orders.service.ts` (`cancel`).

### Cancelamento pelo suporte/admin (story 67)

- **Exceção à invariante do cliente:** o admin (suporte) cancela o Order **inteiro** em **qualquer status não-terminal** (≠ `delivered`/`canceled`), inclusive com separação avançada e pedido `on_the_way`. Status terminal → `CANNOT_CANCEL`.
- Efeitos atômicos (mesma TX): PickTasks ainda na fila (`queued`/`assigned`) removidas — as avançadas **ficam** (histórico da separação); Deliveries não-terminais → `canceled`; grupos não-terminais → `canceled` (grupo `delivered` fica como está); Order → `canceled`; evento `order.canceled` no outbox com trilha (`canceledBy: "admin"` + `reason` opcional, visível na timeline).
- Estorno **TOTAL** durável via handlers da story 48 (slot liberado, estorno, notificações). **Estoque NÃO volta** (padrão story 61).
- O admin delega ao marketplace (dono do agregado) via barrel — só o marketplace muta Order/OrderGroup e emite o evento.
- *Pointer:* `src/marketplace/orders.service.ts` (`adminCancel`), `src/admin/admin-order-support.service.ts`.

### Cancelamento por sub-pedido (OrderGroup — story 54)

- A loja/marketplace cancela **um** sub-pedido (grupo de uma loja); os demais grupos do pedido seguem. Invariante espelha a de Order: o grupo cancela se `status ∈ {created, paid, preparing}` **e** a PickTask do grupo (se houver) ainda não passou de `assigned`. Caso contrário `CANNOT_CANCEL_GROUP`. **Exceção (story 61):** grupo com `Delivery` em `failed` pode cancelar mesmo já avançado (ver "Falha na entrega + decisão da loja"); estoque não volta.
- Ator: capability **`orders.manage`** (owner, administrador e gerente no escopo da loja). Grupo de loja fora do escopo → 404 (não vaza existência).
- Efeitos atômicos (mesma TX): grupo → `canceled`; PickTask do grupo removida da fila; evento `order.group_canceled` no outbox (payload `orderId`, `groupId`, `amountCents` já rateado, `reason`). Quando é o **último grupo ativo** (os demais já cancelados), o Order inteiro vira `canceled` e o slot de entrega (Order-level) é liberado — **sem** emitir `order.canceled` (o handler do grupo já cobre o estorno; emitir os dois duplicaria o reembolso).
- Estorno **parcial** durável: handler do evento acumula um `RefundComponent` (`reason = group_canceled`) no `Refund` 1:1 do pedido e estorna o valor no gateway (retry isolado, idempotente via `ProcessedEvent` + presença do component do grupo — padrão story 48). Push ao cliente ("itens de X foram cancelados e estornados").
- **Rateio do cupom** (Order-level): `amountCents = totalGrupo − (desconto × totalGrupo / totalPedido)`, onde `totalGrupo` = subtotal + entrega + preparo + taxa da plataforma do grupo e `totalPedido` = soma dos totais (pré-desconto) de todos os grupos. Arredondamento com **soma exata** (método do prefixo por id): Σ das fatias de desconto de todos os grupos = desconto (nada perdido no arredondamento).
- Capability **`orders.view`** continua dando só leitura (board + detalhe do sub-pedido); só `orders.manage` cancela.
- *Pointer:* `src/marketplace/orders.service.ts` (`cancelGroup`), `src/marketplace/group-refund.pricing.ts` (`groupCancelRefundCents`), `src/events/handlers/order-group-canceled.handlers.ts`, `src/payment/refund.service.ts` (`issueGroupCancelRefund`).

### Cupom

- `CouponType`: `fixed` (centavos) | `percent` (%) | `free_shipping`. `merchantId = null` → global.
- Restrições: `minOrderCents`, janela `validFrom`/`validTo`, `maxUses` vs `usedCount`, `active`.

---

## Pagamento

- **PaymentStatus**: `pending → paid` (via webhook) | `expired` | `failed` | `refunded`.
- PIX via **Pagar.me** atrás de `PaymentProvider` (swappable + mock). Provider escolhido por `PAYMENT_PROVIDER`.
- Expiração do PIX por `PIX_EXPIRES_SECONDS`. Confirmação de pagamento é por **webhook**, não polling do cliente.
- *Pointer:* `src/payment/*` (`payment-provider.interface.ts`, `providers/`).

---

## Picking (separação)

- Uma **PickTask** por OrderGroup. O picker resolve item a item, ensacola e libera p/ coleta.
- **PickTaskStatus**: `queued → assigned → picking → packed → ready_for_pickup`.
  - Transições validam estado de origem (`PICK_TASK_NOT_QUEUED`, `PICK_TASK_NOT_ASSIGNED`, `PICK_TASK_NOT_PICKING`).
  - Só o picker dono resolve itens da task (`NOT_TASK_OWNER`).
- **PickItemStatus**: `pending → picked` | `refused` (sem estoque/avariado) | `substituted`.
  - `picked` registra o separado real: `quantityPicked` (unit) ou `weightGramsPicked` (weight).
- **Substituição** (`SubstitutionStatus`: `pending → approved | rejected`): proposta com **snapshot de preço** (congela o valor mostrado ao cliente); aprovação é do cliente, à parte.
- *Pointer:* `src/picking/*`, modelos `PickTask`/`PickItem`/`Substitution`.

---

## Delivery (entrega própria da loja)

- Modelo **own-store**: 1 `Delivery` por OrderGroup com `fulfillment = delivery`. Sem marketplace de entregadores — o `driver` é entregador vinculado à loja (`StoreStaff` role `driver`), atribuído **manualmente** pela loja.
- **DeliveryStatus**: `unassigned → assigned → picked_up → delivered`, ou `canceled` (`DELIVERY_NOT_ASSIGNED`), ou `failed` (story 61 — ver abaixo).
- **Códigos curtos** (4 dígitos, `common/codes.ts`):
  - `pickupCode` (OrderGroup, loja→entregador): picker/merchant digita p/ liberar a coleta.
  - `deliveryCode` (Order, entregador→cliente): entregador digita p/ confirmar a entrega.
  - Não são segredo forte — protegidos por limite de tentativas (anti-brute-force).
- `pickup` (retirada): cliente retira, sem Delivery.
- *Pointer:* `src/driver/*`, `src/common/codes.ts`, modelo `Delivery`.

### Falha na entrega + decisão da loja (story 61)

- **Falha é da `Delivery`, não do OrderGroup.** O entregador que já coletou (`picked_up`) mas não consegue entregar reporta a falha: `Delivery → failed` com `failReason` (`customer_absent | wrong_address | refused | other`), `failNote?` e `failedAt`. Só o **dono** da entrega e só a partir de `picked_up` (antes da coleta ele apenas não aceita/desatribui) — senão `NOT_DELIVERY_DRIVER` / `DELIVERY_NOT_PICKED_UP`. Guarda só a **última** falha (histórico de tentativas fora de escopo). Idempotente quando já `failed`.
- O **status do OrderGroup NÃO ganha estado novo** (segue `on_the_way`): os painéis (merchant board/drawer, fila do picker) derivam a **exibição** da `Delivery` — evita ripple em DTOs/boards.
- Na MESMA TX do `fail`: evento `delivery.failed` no outbox (payload `orderId`, `groupId`, `deliveryId`, `reason`). Handler (fila própria, idempotente via `ProcessedEvent` — padrão story 48): **push ao cliente** ("problema na sua entrega: <motivo>, a loja vai entrar em contato") + **realtime ao merchant** (`order.status_changed` à store room — mesmo canal do som/badge da story 54).
- **A loja decide** (`store/deliveries/:id/retry`, mesmo guard/RBAC do despacho — manager/picker da loja; `NOT_STORE_STAFF`):
  - **Reenviar** (`retry`): `failed → unassigned`, limpa `driverId` + timestamps de coleta (`assignedAt`/`pickedUpAt`) mas **PRESERVA** a última falha (`failReason`/`failNote`/`failedAt`); na mesma TX o OrderGroup volta a `ready_for_pickup` (estava `on_the_way`) — a entrega retorna ao pool e à fila de coleta. Não-`failed` → `DELIVERY_NOT_FAILED`.
  - **Cancelar o sub-pedido**: usa o fluxo da story 54 (cancelamento por grupo + estorno).
- **Exceção à trava de cancelamento (story 54):** um grupo com `Delivery` em `failed` **PODE** ser cancelado mesmo com o grupo `on_the_way` e a PickTask avançada (`ready_for_pickup`) — a loja escolhe entre reenviar e cancelar. **Estoque NÃO volta** (os itens separados ficam como estão; devolução de estoque fora de escopo). Fora esse caso, a invariante padrão (só antes de a separação começar) vale.
- *Pointer:* `src/driver/driver.service.ts` (`fail`), `src/driver/store-delivery.service.ts` (`retry`), `src/events/handlers/delivery-failed.handlers.ts`, `src/marketplace/orders.service.ts` (`cancelGroup` — exceção `deliveryFailed`).

---

## Reembolso (SF.3)

- **Um Refund por Order** (`Order.refund` 1:1), consolidando faltas de todos os grupos. `amountCents = max(0, pago − total ajustado)`. Breakdown por grupo em `RefundComponent`.
- **RefundStatus**: `pending → processed | failed`.
- **RefundReason**: `weight_shortfall` | `refused` | `group_canceled` (sub-pedido cancelado — total do grupo com cupom rateado; estorno **parcial** acumulado no mesmo Refund, ver "Cancelamento por sub-pedido") | `manual` (reembolso manual do suporte, story 67 — ver abaixo).
- Falta cobrável por item (`itemShortfall`, cálculo puro testável):
  - `refused`: valor **integral** da linha.
  - `picked` com separação **menor** que o pedido (peso ou unidade): diferença até `min(separado, pedido)`. **Over-delivery não gera falta** (não cobra a mais).
  - `pending`/`substituted`: sem falta (substituição aprovada à parte).
- *Pointer:* `src/payment/refund.pricing.ts` (+ `refund.pricing.spec.ts`), `refund.service.ts`.

### Reembolso manual pelo suporte/admin (story 67)

- O admin reembolsa **valor arbitrário por grupo** (`POST admin/dashboard/orders/:id/refund`), limitado ao **teto = pago − já reembolsado** (Refund não-`failed`; um Refund `failed` não conta — nada saiu do gateway). Acima do teto → `REFUND_EXCEEDS_PAID`; valor ≤ 0 / não-inteiro → `INVALID_REFUND_AMOUNT`; pedido não pago → `ORDER_NOT_PAID`.
- Vira `RefundComponent` com `reason = manual` e **`createdById` = admin** (trilha mínima; audit log genérico fora de escopo) acumulado no Refund 1:1 do pedido. **Vários reembolsos manuais do mesmo grupo são permitidos** (acúmulo até o teto).
- Estorno **parcial durável** — mesmo mecanismo 48/54: a validação emite `order.refund_requested` no outbox (mesma TX); o handler estorna no gateway com retry isolado. Idempotência da reentrega pela presença do `RefundComponent` com o `componentId` do payload (a marca é **por evento**, não por grupo). A nota (`note`) vive só no payload do evento (aparece na timeline).
- *Pointer:* `src/admin/admin-order-support.service.ts` (`manualRefund`), `src/events/handlers/order-refund-requested.handlers.ts`, `src/payment/refund.service.ts` (`issueManualRefund`).

---

## Avaliações & gorjeta (S5.2)

- Disponível **após `delivered`**. `ReviewAxis`: `platform` | `delivery` (só se houve entrega) | `merchant`.
- Unicidade: 1 review `platform`/`delivery` por pedido; 1 `merchant` por mercado do pedido (garantida no service — NULLs são distintos no Postgres).
- **Tip** (gorjeta ao entregador): `TipStatus` `pending → paid` (webhook) | `failed`. Cobrança PIX separada; `driverId` vem da `Delivery` do grupo.
- *Pointer:* `src/reviews/*`, modelos `Review`/`Tip`.

---

## Integração ERP

- Sync auditado (`Sync`): `SyncType` `full · prices · stock`; `SyncStatus`. Conector por merchant (`connectorType`/`connectorConfig`); MVP usa CSV mock (`NOT_MOCK` quando operação exige conector mock).
- Sync **nunca** sobrescreve `lockedFields` (ver Catálogo).
- Agendamento por `SYNC_SCHEDULE_ENABLED` / `SYNC_CRON`.
- *Pointer:* `src/erp/*`, `src/scheduling/*`.

---

## Convenção de erros

Exceções carregam `{ code, message }` — `code` em SCREAMING_SNAKE, consumido pelo front p/ discriminar. Normalizado por `AllExceptionsFilter` global. Catálogo de helpers em `src/common/codes.ts`.

Exemplos em uso: `PRODUCT_NOT_FOUND`, `OFFER_NOT_FOUND`, `STORE_NOT_MANAGED`, `NOT_TASK_OWNER`, `CANNOT_CANCEL`, `CART_EMPTY`, `PICK_TASK_NOT_PICKING`, `DELIVERY_NOT_ASSIGNED`, `EMAIL_TAKEN`, `SLUG_TAKEN`.
