# Plan: Picker — autocomplete de substituto + migração da tela de separação

## Context

Bloco **picker** do BACKLOG. Durante a separação, ao clicar em **Substituir**, o campo
"Buscar substituto na loja" hoje **não busca enquanto digita**: só dispara no
`onSubmitEditing` (tecla "search" do teclado), o que no app passa a impressão de campo
quebrado. O pedido é transformar em **autocomplete**: busca produtos da loja conforme o
separador digita, **com debounce** e **só depois de 2 caracteres** no input.

Estado atual (`apps/picker/app/task/[id].tsx`):
- A tela inteira faz fetch legado com `useState`/`useEffect`: `client.pickTask` (load),
  e as ações `pickUpdateItem`, `pickSubstitute`, `pickStart`, `pickCompletePicking`,
  `pickReady`, `storeHandover`.
- A busca usa `client.request("/search?storeId=&q=")` direto no componente, disparada só
  no submit (`searchSubs`).

**Decisões travadas (refino):**
- **Migrar a tela inteira para React Query** (escolha do usuário), cumprindo a regra do
  CLAUDE.md de migrar fetch legado ao tocar a tela: `pickTask` vira query; as ações viram
  mutations que invalidam a query da task; a busca de substituto vira query **com debounce
  + gate de 2 caracteres**.
- **Depende da story 02**, que estabelece a fundação React Query do app picker
  (`QueryClientProvider`, `src/lib/queryKeys.ts`, `src/api/`, hooks). Esta story **reusa**
  essa fundação — se a 02 ainda não tiver entrado, esta a pressupõe (criar o que faltar
  seguindo o mesmo padrão).
- Debounce: ~300ms; busca só com `q.trim().length >= 2` (abaixo disso, limpa resultados e
  não chama a API). Sem busca no submit/Enter — o autocomplete substitui esse gatilho.
- Mantém o endpoint atual `GET /search?storeId=&q=` (já existe; retorna `{ items: SubOffer[] }`).
  Sem mudança de backend.

## Desenho

**1. Camada de dados (app picker, reusando a fundação da story 02)**
- `src/lib/queryKeys.ts`: adicionar `queryKeys.pick.task(id)` e
  `queryKeys.pick.search(storeId, q)`.
- `src/api/picking.ts`: expor `pickTask(id)`, as ações de mutação acima e
  `searchOffers(storeId, q)` (tipado `SubOffer[]`; move o `SubOffer`/`/search` do componente
  para o módulo tipado — sem `client.request` cru na tela).
- `src/api/hooks/usePickTask.ts` (novo):
  - `usePickTask(id)` — query.
  - mutations `usePickStart`, `usePickUpdateItem`, `usePickSubstitute`,
    `usePickCompletePicking`, `usePickReady`, `useStoreHandover` — cada `onSuccess`
    invalida `queryKeys.pick.task(id)`.
  - `useSubstituteSearch(storeId, query)` — query com `enabled: query.trim().length >= 2`,
    usando `q` **já debounced** (ver hook abaixo); `keepPreviousData` para a lista não
    piscar entre teclas.
- `src/hooks/useDebouncedValue.ts` (novo, util genérico): retorna o valor após N ms parado.

**2. Tela `task/[id].tsx`**
- Substituir `useState`/`useEffect` de fetch pelos hooks. Estado de UI local permanece em
  `useState` (`subFor`, `subQuery`, `pickupCode`).
- Busca: `const debouncedQ = useDebouncedValue(subQuery, 300)` →
  `useSubstituteSearch(task.storeId, debouncedQ)`; remover `searchSubs`,
  `onSubmitEditing` e o `subResults` em `useState` (passa a vir da query). Render dos
  resultados a partir de `data`; mostrar loading/empty conforme `q.length >= 2`.
- `proposeSub`/ações passam a `mutateAsync`; erros exibidos no mesmo `error` atual (ou via
  estado de erro da mutation).

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/picker test:coverage`. Sem `skip`/`only` injustificado.
Backend não muda → sem novos specs de service.

- **`useDebouncedValue`**: teste com fake timers — só emite após o atraso; digitação rápida
  cancela o valor intermediário.
- **`useSubstituteSearch`** (ou o componente de busca): 
  - `q` com 1 caractere → **não** chama a API (query `disabled`).
  - `q` com ≥2 caracteres (após debounce) → chama `searchOffers(storeId, q)` e popula a lista.
  - troca de `q` respeita o debounce (não dispara a cada tecla).
- **mutations** (`usePickSubstitute` etc.): on success invalidam `queryKeys.pick.task(id)`
  (ao menos um teste representativo, no padrão dos testes de hook do customer).
- `pnpm typecheck` + `pnpm build` verdes.

## Fora de escopo

- Mudança no endpoint `/search` ou na relevância/ranking dos resultados.
- Paginação/scroll infinito dos resultados de substituto.
- Realtime na tela de task (fora do escopo da story 02, que cobre só a fila).
- Fundação React Query do picker em si — é entregue pela **story 02** (esta reusa).
