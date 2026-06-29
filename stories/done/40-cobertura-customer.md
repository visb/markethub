# 40 Cobertura de testes — app customer

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura — frontend + libs
- **Status:** todo
- **Depende de:** 19

## Objetivo

Subir o `apps/customer` de **47% linhas** ao **mínimo de 80%** (política da rodada), cobrindo as
telas/hooks de compra ainda no padrão legado (`useState`/`useEffect`) ou sem teste.

## User story

Como time, quero o fluxo de compra do cliente coberto, para que carrinho, checkout, home e endereços
não regridam — e migrar o que estiver legado pra React Query ao tocar.

## Critérios de aceite

- **Carrinho** (`use-cart`/cart screen): adicionar `unit` vs `weight` (gramas), quantidade, remoção,
  recálculo de total.
- **Checkout:** seleção de endereço/entrega vs retirada, totais (frete/door surcharge), criar pedido.
- **Home / listagem de ofertas:** render, busca/filtro, navegação pra produto/loja.
- **Endereços** (`/delivery`): CRUD via hooks, default.
- Código legado **tocado migra** pra React Query + react-hook-form (CLAUDE.md). **Agregado do
  workspace ≥ 80% linhas**; piso do customer sobe pra 80 no `jest` config.

## Escopo / Fora de escopo

**Dentro:** specs de carrinho, checkout, home, endereços (telas + hooks). **Fora:** explore/produto/
store/seguir (já cobertos nas stories 05/06/29/30/31/34); backend.

## Notas técnicas

Padrão RNTL + mocks de `expo-router`/`marketplace`/`useAuth` já estabelecido nas telas cobertas.
Query keys só de `queryKeys.ts`. Sem rede real.
