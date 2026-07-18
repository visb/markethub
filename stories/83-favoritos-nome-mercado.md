# Plan: favoritos — mostrar nome do mercado (+ migração React Query)

## Context

Bloco "Favoritos" do BACKLOG. Em `/favorites` (`apps/customer/app/favorites.tsx:84`) a linha da
loja mostra `item.store.name` (nome da loja física), mas ao lado o `MerchantLogo` já usa
`merchantName` — cliente pensa na rede, não na loja. O dado certo já vem no payload
(`FavoriteView.store.merchantName`): correção é frontend-only, sem backend.

Decisão travada (planning 2026-07-18): a tela ainda faz fetch com `useState`/`useEffect`
(padrão legado). Regra do repo — legado **migra ao ser tocado** — então esta story inclui a
migração da tela para React Query. Não é opcional.

Mesma linha das stories 81/82: exibição prioriza o mercado (rede); nome da loja fica para
contextos operacionais.

## Desenho

- `favorites.tsx:84`: trocar `item.store.name` → `item.store.merchantName`.
- Migração React Query:
  - `apps/customer/src/api/hooks/useFavorites.ts` (ou arquivo existente do recurso, se houver):
    `useFavorites()` (query, key em `queryKeys`) + `useAddFavoriteToCart()` (mutation
    encapsulando `mkt.addItem` com a regra unit/weight de 300g que hoje está inline na tela).
  - Query key nova em `src/lib/queryKeys.ts` — nunca literal na tela.
  - Tela vira orquestração: `useFavorites()` para a lista (loading via `isLoading`), mutation
    para o botão "Adicionar" (busy via `isPending` por item), navegação igual.
- Comportamento preservado: empty state, indisponível, preço promocional, navegação pro
  produto e pro carrinho.

## Validação

- Frontend: `pnpm --filter @markethub/customer test` — casos:
  - linha renderiza `merchantName` (e **não** `store.name`);
  - hook `useFavorites` busca e expõe a lista; mutation adiciona unit (quantity 1) e weight
    (300g) correto;
  - regressão: item indisponível desabilita botão; empty state.
- Gates: `pnpm typecheck` + `pnpm build`.
- **Cobertura:** código novo sem teste não fecha a story — `pnpm --filter @markethub/customer
  test:coverage` verde (piso 80%, diff ≥ 90%); sem `skip`/`only` injustificado.

## Fora de escopo

- Backend (payload já traz `merchantName`).
- Redesign do card de favorito (só a troca do nome + migração de padrão).
- Favoritar/desfavoritar (fluxo do coração no detalhe do produto não muda).
