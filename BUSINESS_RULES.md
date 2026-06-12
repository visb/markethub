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
- *Pointer:* `src/marketplace/orders.service.ts:226+`.

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
- **DeliveryStatus**: `unassigned → assigned → picked_up → delivered`, ou `canceled` (`DELIVERY_NOT_ASSIGNED`).
- **Códigos curtos** (4 dígitos, `common/codes.ts`):
  - `pickupCode` (OrderGroup, loja→entregador): picker/merchant digita p/ liberar a coleta.
  - `deliveryCode` (Order, entregador→cliente): entregador digita p/ confirmar a entrega.
  - Não são segredo forte — protegidos por limite de tentativas (anti-brute-force).
- `pickup` (retirada): cliente retira, sem Delivery.
- *Pointer:* `src/driver/*`, `src/common/codes.ts`, modelo `Delivery`.

---

## Reembolso (SF.3)

- **Um Refund por Order** (`Order.refund` 1:1), consolidando faltas de todos os grupos. `amountCents = max(0, pago − total ajustado)`. Breakdown por grupo em `RefundComponent`.
- **RefundStatus**: `pending → processed | failed`.
- Falta cobrável por item (`itemShortfall`, cálculo puro testável):
  - `refused`: valor **integral** da linha.
  - `picked` com separação **menor** que o pedido (peso ou unidade): diferença até `min(separado, pedido)`. **Over-delivery não gera falta** (não cobra a mais).
  - `pending`/`substituted`: sem falta (substituição aprovada à parte).
- *Pointer:* `src/payment/refund.pricing.ts` (+ `refund.pricing.spec.ts`), `refund.service.ts`.

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
