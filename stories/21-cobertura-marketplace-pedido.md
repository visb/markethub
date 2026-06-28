# 21 Cobertura de testes — marketplace (carrinho + pedido)

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura
- **Status:** todo
- **Depende de:** 19

## Objetivo

Cobrir `cart.service` e `orders.service` — núcleo do fluxo de compra, hoje quase sem teste.

## User story

Como time, quero carrinho e criação/transição de pedido cobertos, para garantir que total,
saleType/peso-em-gramas e mudança de status não regridam.

## Critérios de aceite

- `marketplace/cart.service.ts` (hoje **8.5%**) ≥ 80% linhas.
- `marketplace/orders.service.ts` (hoje **12.9%**) ≥ 80% linhas.
- `marketplace/orders.controller.ts` (**0%**) coberto no caminho feliz + validação.
- Casos carrinho: item `unit` vs `weight` (gramas), quantidade, remoção, recálculo de total,
  item indisponível.
- Casos pedido: criação, transições válidas/ inválidas de status, cancelamento (ver
  `BUSINESS_RULES.md`).

## Escopo / Fora de escopo

**Dentro:** specs cart+orders service/controller. **Fora:** substitution (story 22), refund
(story 20).

## Notas técnicas

Conferir invariantes de status/cancelamento em `BUSINESS_RULES.md` antes de escrever os asserts.
