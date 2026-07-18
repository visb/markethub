# Plan: Busca no customer — sugestões ao digitar + tela de resultado

## Context

Hoje o campo de busca da home do customer descarta o que foi digitado:
`onSubmitEditing={() => router.push("/explore")}` (`app/home.tsx:110`) — enter joga o usuário na
aba explore. Comportamento esperado (backlog): **sugestões conforme digita**; selecionar um
termo ou submeter o form leva ao **resultado da busca**.

O backend `GET /search` (catalog) já aceita `storeId` opcional — busca global de produtos
existe; o front só a usa com `storeId` (busca dentro da loja). Faltam sugestões e a tela de
resultado.

Decisões travadas (refinadas no planning):

- **Sugestões = termos**: nomes de produto deduplicados + categorias que casam (rotuladas "em
  Categoria"). Selecionar termo → tela de resultado; selecionar categoria → tela da categoria
  existente (`/category/[id]`).
- **Resultado: lista flat com badge da loja, com recorte geo** — produtos de todas as lojas
  próximas (mesmo lat/lng/raio usados na home), paginado. Consistente com o feed multi-loja.

## Desenho

### Backend (`services/api` — catalog)

- `GET /search/suggest?q=` novo (controller fino + service): retorna
  `{ terms: string[], categories: { id, name }[] }` — nomes de produto `contains` (insensitive)
  deduplicados (limite ~8) + categorias que casam (limite ~3). Query mínima de 2 caracteres
  (DTO valida).
- `GET /search` sem `storeId`: aceitar `lat`/`lng`/`radiusKm` (mesmo parse geo dos demais
  endpoints do catalog) para restringir às lojas próximas; itens do resultado passam a carregar
  identificação da loja (`storeId`, `storeName`) para o badge. Com `storeId` (busca na loja),
  comportamento atual inalterado.

### Contratos (`packages/types`)

- Tipos do suggest e do item de resultado com loja (backend não importa `packages/types` —
  manter os dois lados; re-export via `@markethub/api-client`).

### App customer

- `src/api/marketplace.ts`: `searchSuggest(q)` e `search` global com geo (assinatura nova sem
  quebrar a busca por loja da tela de store).
- Hooks novos (React Query, keys em `queryKeys`): `useSearchSuggestions(q)` (enabled `q.len ≥ 2`,
  debounce) e `useProductSearch(q, geo)` (paginado).
- `app/home.tsx`: input vira orquestração de componente de busca com dropdown de sugestões
  (termos + categorias); submit ou tap em termo → `router.push({ pathname: "/search", params:
  { q } })`; tap em categoria → `/category/[id]`. Remove o `router.push("/explore")`.
- `app/search.tsx` rota nova: lê `q` dos params, orquestra `useProductSearch` + grid de produtos
  com badge da loja (add ao carrinho pelo fluxo existente), estados vazio/carregando, paginação.

## Validação

- `pnpm --filter @markethub/api test:coverage` — casos: suggest dedup + limite + mínimo 2 chars;
  search global com geo exclui loja fora do raio; item traz storeId/storeName; busca com storeId
  segue igual (regressão).
- `pnpm --filter @markethub/customer test:coverage` — sugestões aparecem ao digitar (≥ 2 chars);
  tap em termo e submit navegam p/ `/search` com `q`; tap em categoria navega p/ categoria;
  tela de resultado renderiza itens com badge, vazio e paginação.
- `pnpm typecheck` + `pnpm build`.
- **Gate:** código novo sem teste não fecha a story (diff ≥ 90%); sem `skip`/`only` injustificado.

## Fora de escopo

- Histórico de buscas do usuário (local ou server).
- Ranking/relevância além do `contains` atual; busca fonética/typo-tolerante.
- Mudar a busca dentro da loja (`store/[id]`) ou a aba explore.
