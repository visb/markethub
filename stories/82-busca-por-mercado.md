# Plan: busca — encontrar mercados pelo nome

## Context

Bloco "Busca, app customer" do BACKLOG. A barra de busca (story 80) sugere termos de produto e
departamentos, e o submit lista só produtos. Cliente quer digitar "atacadão" e chegar no
mercado — hoje o nome da rede não é pesquisável.

Decisões travadas (planning 2026-07-18):

- **Mercado aparece nos dois lugares:** nova seção "Mercados" no dropdown de sugestões **e**
  seção de mercados na tela de resultado (`/search`), acima dos produtos.
- **Tap num mercado navega para a loja visível mais próxima** da rede (`/store/[id]`). Suggest
  passa a aceitar geo opcional; sem geo, qualquer loja visível da rede. **Não** criar tela
  intermediária de rede (overkill no MVP).

Estado atual do código:

- Dropdown: `apps/customer/src/components/SearchBar.tsx` (seções termos + departamentos).
- Suggest: `services/api/src/catalog/catalog.service.ts:194-221` (`searchSuggest`), rota
  `GET /search/suggest` em `catalog.controller.ts:129`, DTO `dto/search-suggest.dto.ts` (só `q`).
- Busca global: mesma service (`searchOffers` sem `storeId`), já recebe geo.
- Visibilidade de loja: `visibleStoreWhere` (loja ativa + rede ativa — story 69). Reusar.

Dependência: story 81 muda o card do resultado — sem conflito direto, mas se ambas tocarem
`search.tsx`, implementar 81 antes.

## Desenho

Backend (`services/api/src/catalog`):

- `searchSuggest(q, geo?)` ganha terceira seção `merchants` (teto ~3): redes com
  `name contains q` (insensitive) e ao menos uma loja visível. Item:
  `{ merchantId, name, logoUrl, storeId }` onde `storeId` = loja visível mais próxima
  (haversine com geo; sem geo, primeira loja visível).
- DTO `SearchSuggestQueryDto`: `lat`/`lng` opcionais (number, transform de query string).
- Busca global (`searchOffers` sem `storeId`): resposta ganha campo `merchants` com o mesmo
  shape/limite, casando o termo — só na primeira página (`page === 1`), para não repetir seção
  na paginação. Busca dentro da loja não muda.

Contrato (`apps/customer/src/api/marketplace.ts` + hooks `useProductSearch.ts`):

- Tipos novos (`SearchMerchant`), `suggest` com geo opcional, resposta da busca com `merchants`.
- `useSearchSuggestions` repassa o geo já usado pela busca (`useSearchGeo`).

Frontend (`apps/customer`):

- `SearchBar.tsx`: seção "Mercados" no dropdown (logo via `MerchantLogo` + nome, sufixo
  "em Mercados" no padrão da seção de categorias). Tap → `onSelectMerchant` (prop nova) →
  `router.push(`/store/${storeId}?name=${merchantName}`)` nas telas que usam a barra.
- `search.tsx`: seção horizontal "Mercados" acima do grid de produtos quando
  `merchants.length > 0`; mesmo destino de navegação.

## Validação

- Backend: `pnpm --filter @markethub/api test` — casos em `catalog.service.spec.ts`:
  - suggest devolve merchants que casam, respeita visibilidade (rede/loja inativa fora);
  - com geo escolhe a loja mais próxima; sem geo devolve alguma loja visível;
  - busca global página 1 traz `merchants`; página 2 não; busca na loja não traz;
  - DTO aceita `lat`/`lng` opcionais (controller spec).
- Frontend: testes de `SearchBar` (seção mercados renderiza + tap chama `onSelectMerchant`) e
  `search.tsx` (seção de mercados aparece/navega).
- Gates: `pnpm typecheck` + `pnpm build`.
- **Cobertura:** código novo sem teste não fecha a story — `pnpm --filter @markethub/api
  test:coverage` e `pnpm --filter @markethub/customer test:coverage` verdes (piso 80%, diff ≥ 90%);
  sem `skip`/`only` injustificado.

## Fora de escopo

- Tela dedicada de rede (lista de lojas do mercado).
- Ranking/fuzzy matching além de `contains` insensitive.
- Busca por mercado nos apps picker/driver/admin.
