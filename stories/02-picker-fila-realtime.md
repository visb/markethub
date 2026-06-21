# Plan: Picker — fila atualiza em tempo real ao chegar pedido

## Context

Bloco **picker** do BACKLOG. A lista de pedidos do separador (`apps/picker/app/home.tsx`)
deve **atualizar sozinha** quando um pedido novo entra na fila (e quando uma tarefa muda
de status, ex.: outro separador assume) — hoje só atualiza no load ou no pull-to-refresh
manual.

**Infra já pronta no backend:** `PickingGateway` (namespace `/picking`, `services/api`)
com `subscribe:store` autorizado por staff/loja; `PickingEvents.taskStatusChanged` já emite
`pick_task.updated` para a `store room` **na criação da task** (`picking.service.ts:44`) e em
cada transição. Ou seja, o sinal de "chegou/mudou pedido" já existe — falta o app **escutar**.

**Estado atual do app picker (o que falta):**
- `apps/picker` **não tem** `@tanstack/react-query`, nem `QueryClientProvider`, nem `src/api`,
  nem `src/lib/queryKeys.ts`. `home.tsx` faz fetch legado com `useState`/`useEffect` via
  `client.pickStores()`/`client.pickQueue()`.
- O `auth-context.tsx` do picker expõe `client`, mas **não** expõe `realtime`.
- O `RealtimeClient` (`packages/api-client/src/socket.ts`) só tem `subscribeOrder` — falta
  `subscribeStore`.

**Decisões travadas (refino):**
- Esta story estabelece a **fundação React Query do app picker** (primeira tela a usar) — é
  consequência da regra do CLAUDE.md de migrar fetch legado ao tocar a tela, e pré-requisito
  para invalidar a fila por evento.
- Padrão espelha `apps/customer/src/api/hooks/useOrderTracking.ts`: query REST como snapshot +
  socket dispara invalidação/refetch + **fallback de polling** quando o socket está
  desconectado.
- Atualização é **silenciosa** (refresh da lista). Sem toast/badge/som de "novo pedido" —
  fora de escopo.
- Depende da **story 01** apenas no sentido de que ambas tocam a fila do picker; a ordenação
  (queued no topo) é da 01. Esta story não altera ordenação.

## Desenho

**1. api-client (`packages/api-client`) + types**
- `socket.ts`: adicionar `subscribeStore(storeId: string)` ao `RealtimeClient` (emite
  `subscribe:store` com `{ storeId }`, espelhando `subscribeStore` do gateway).
- `packages/types/src/picking-events.ts`: exportar const `PICK_TASK_UPDATED_EVENT =
  "pick_task.updated"` (o literal já existe no union `PickTaskEventName`); re-exportar via
  `@markethub/api-client` para o app não duplicar string.

**2. App picker — fundação React Query**
- `apps/picker/package.json`: add `@tanstack/react-query` (mesma versão dos outros apps).
- `app/_layout.tsx`: envolver com `QueryClientProvider` (mesma config do customer).
- `src/auth-context.tsx`: criar `realtime = createRealtimeClient({ url: API_URL, getToken })`
  e expor no contexto (espelha customer; mantém o nome `client` já usado pelo picker).
- `src/lib/queryKeys.ts` (novo): `queryKeys.pick.stores` e `queryKeys.pick.queue(storeId)`.
- `src/api/picking.ts` (novo): módulo tipado que recebe `ApiClient` e expõe `pickStores`,
  `pickQueue(storeId)` (wrap das chamadas já existentes no client).
- `src/api/hooks/usePickQueue.ts` (novo): `usePickStores()` + `usePickQueue(storeId)` (query
  condicional via `enabled: !!storeId`).

**3. Tela `home.tsx` — migrar + realtime**
- Trocar os `useState`/`useEffect` de fetch pelos hooks acima. Estado de UI local (storeId
  selecionado) pode seguir em `useState`.
- `assume()` vira mutation (`usePickAssign`) que invalida `queryKeys.pick.queue(storeId)`
  no sucesso/erro.
- Efeito de realtime (espelha `useOrderTracking`): ao ter `storeId`, `realtime.connect()`,
  no `connect` chamar `realtime.subscribeStore(storeId)` e invalidar a fila (re-sync pós
  reconexão); ouvir `PICK_TASK_UPDATED_EVENT` → `invalidateQueries(queryKeys.pick.queue)`;
  no `disconnect` ligar fallback de polling (`refetchInterval` ~20s só enquanto desconectado);
  cleanup com `disconnect()` no unmount / troca de loja.

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/api test:coverage` (se tocar backend) e `pnpm --filter
@markethub/picker test:coverage`. Sem `skip`/`only` injustificado.

- **api-client** (`packages/api-client`): teste de `subscribeStore` emitindo `subscribe:store`
  com o `storeId` correto (mockando o socket, no padrão dos testes existentes de socket).
- **picker** (`apps/picker`): teste do hook `usePickQueue`/efeito de realtime (no padrão de
  `apps/customer/src/__tests__/useOrderTracking.test.tsx`):
  - Load inicial popula a fila via REST.
  - Evento `pick_task.updated` recebido → fila é invalidada/refetch (nova tarefa aparece).
  - Socket desconectado → fallback de polling ativo; conectado → sem polling.
  - `connect` dispara `subscribeStore(storeId)`.
- Como o app picker passa a ter React Query, garantir `pnpm typecheck` + `pnpm build` verdes
  (novas deps/Provider). Backend sem mudança de lógica → não precisa de novos specs de service.

## Fora de escopo

- Ordenação da fila (story 01).
- Toast/badge/som de "novo pedido" — atualização é silenciosa.
- Push notification (FCM/APNs) — o `push` do `PickingEvents` segue stub.
- Realtime nas demais telas do picker (`task/[id]`, `deliveries`) — só a fila (`home.tsx`).
