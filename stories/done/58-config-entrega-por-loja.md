# Plan: config de entrega por loja — taxa, pedido mínimo e raio

## Context

Hoje a config de entrega é pobre e centralizada: tarifas vivem na **rede**
(`Merchant.deliveryFeeCents` default 700, `prepFeeCents`, `platformFeeBps`) e só o **admin**
edita; pedido mínimo não existe; cobertura é só por **cidade** (`COVERED_CITIES`,
Curitiba+limítrofes — S6.3), sem raio por loja. `avgPrepMinutes` por loja já existe e compõe o
ETA (nada a fazer em tempo estimado). Entrega é own-store: cada loja tem realidade própria de
taxa e alcance.

Decisões travadas (planning 2026-07-11):

- **Nível loja com herança** (escolhido pelo usuário): `Store.deliveryFeeCents?` e
  `Store.minOrderCents?` — `null` herda da rede; `Store.deliveryRadiusKm?` — `null` = sem
  limite além da cidade.
- Raio validado no checkout por **haversine** (lat/lng de loja e endereço já existem) →
  `OUT_OF_DELIVERY_AREA`. Pickup não valida raio. Endereço sem lat/lng → cai na validação por
  cidade, como hoje.
- Pedido mínimo é **por grupo** (subtotal de itens da loja) → `MIN_ORDER_NOT_MET` no checkout;
  carrinho mostra progresso ("faltam R$ X").
- Merchant edita config **da loja** (mesma capability da edição de loja); tarifa-base da rede
  e `platformFeeBps` seguem só no admin.

## Desenho

### Schema

1. Migration: `Store.deliveryFeeCents Int?`, `Store.minOrderCents Int?`,
   `Store.deliveryRadiusKm Float?`.

### Backend

2. `cart.service`: taxa efetiva do grupo = `store.deliveryFeeCents ?? merchant.deliveryFeeCents`
   (pickup segue 0). Expor no view do carrinho, por grupo: taxa efetiva, `minOrderCents`
   efetivo e `missingForMinCents` (0 quando atingido).
3. Checkout (`marketplace`): grupo delivery com subtotal < mínimo → `{ code:
   "MIN_ORDER_NOT_MET" }` (lista loja + valor faltante); distância loja→endereço > raio →
   `{ code: "OUT_OF_DELIVERY_AREA" }`. Helper haversine no shared/kernel (reaproveitar se o
   stores-nearby já tiver um).
4. Módulo `merchant`: campos novos no PATCH de loja (DTO `@IsOptional`, `null` explícito =
   voltar a herdar — atenção `undefined` ≠ `null`, padrão do repo).
5. DTO de vitrine/detalhe da loja (catalog): expor taxa efetiva, mínimo e raio p/ o customer.

### Merchant app

6. Seção "Entrega" no `EditStore`/StoreForm: taxa (com checkbox "herdar da rede" ↔ null),
   pedido mínimo, raio km. react-hook-form + zod; exibir o valor herdado da rede como
   placeholder quando null.

### Customer app

7. Página da loja: linha "entrega até X km • mínimo R$ Y" quando configurados.
8. Carrinho: por grupo, barra/aviso "faltam R$ X para o mínimo de <loja>"; CTA desabilitado do
   checkout enquanto houver grupo abaixo do mínimo.
9. Checkout: tratar `OUT_OF_DELIVERY_AREA` (sugerir retirada quando `allowsPickup`) e
   `MIN_ORDER_NOT_MET`.

## Validação

- Backend: specs de herança da taxa (override/null), mínimo por grupo (multi-loja: só o grupo
  abaixo bloqueia), haversine (dentro/fora/borda, endereço sem lat/lng cai p/ cidade, pickup
  ignora), PATCH com `null` volta a herdar. Migration limpa.
  `pnpm --filter @markethub/api test`.
- Merchant: form (herdar↔override, validação de negativos).
- Customer: barra de mínimo no carrinho, erros de checkout com CTA de retirada.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  merchant + customer ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm --filter @markethub/api prisma:generate` antes do typecheck; `pnpm typecheck` + build.

## Fora de escopo

- Taxa dinâmica por distância/faixa (flat por loja só).
- Frete grátis acima de X (cupom `free_shipping` já cobre promoção).
- Merchant editar tarifas da rede / `platformFeeBps` (admin).
- Polígono de cobertura desenhado no mapa (raio circular só).
