# Plan: tela /track/:id em tempo real via socket

## Context

Bloco do BACKLOG: **app customer, tela `/track/:id`** — o status (Pedido confirmado →
Comprando → Pronto para retirar) deve ser atualizado em **tempo real (websockets)**.
Esta story cobre o **lado frontend/cliente**; o backend que dirige os status e emite os
eventos é a story **01** (pré-requisito para o passo "Comprando" e o progresso chegarem
pelo canal — implementar 01 antes ou junto).

**Estado atual:**
- A tela `apps/customer/app/track/[id].tsx` faz **polling REST a cada 8s**
  (`setInterval` → `mkt.tracking(id)`), com `useState`/`useEffect`. Sem socket.
- `@markethub/api-client` expõe **apenas um stub**: `createRealtimeClient()` lança
  `"RealtimeClient not implemented yet — planned for Phase 5"`. Não há `socket.io-client`
  instalado/integrado no cliente.
- O backend já tem o gateway `/picking` com `subscribe:order` (autorizado: só o dono /
  admin) e emite `order.updated` com o **snapshot completo de `OrderTracking`** no canal
  `order:<orderId>`.

**Decisões travadas (refino):**
- **Socket + fallback de polling.** Realtime via socket é o caminho primário; se o socket
  cair/não conectar, manter um refetch REST (refetch ao (re)conectar + intervalo de
  segurança mais espaçado que os 8s atuais). Resiliência sem depender só do socket.
- O payload de `order.updated` **é** o `OrderTracking` — a tela aplica o snapshot direto,
  sem novo round-trip REST a cada evento (REST só no load inicial e no fallback).

## Desenho

1. **Implementar o RealtimeClient real em `@markethub/api-client`** (substituir o stub
   `socket.ts`):
   - usar `socket.io-client` conectando ao namespace `/picking` com `auth.token` (mesmo
     contrato do `PickingGateway`: token JWT no handshake);
   - API mínima já tipada (`connect/disconnect/on/emit`) + helper de assinatura de canal
     do pedido (`subscribe:order`) e tipos dos eventos (`order.updated`) reusando os
     contratos de `packages/types` (`picking-events`) onde fizer sentido — não duplicar
     nomes de evento soltos.
   - Exportar via `index.ts`. Manter `RealtimeOptions { url, getToken }`.
2. **Expor o socket no app customer** seguindo o padrão de injeção do `ApiClient`:
   obter URL/token do `auth-context` (mesma origem da API). Um hook dedicado de
   realtime (ex.: `useOrderTracking(id)`) encapsula: load inicial REST, conexão+subscribe
   no socket, aplicação do snapshot de `order.updated`, cleanup no unmount e o fallback
   de polling. **A rota não faz fetch/socket inline** — consome o hook (CLAUDE.md:
   telas não fazem fetch; server-state via React Query).
3. **Integrar com React Query.** O hook usa React Query como store do snapshot
   (queryKey em `queryKeys` — criar a entrada do tracking; **nunca** string literal). O
   load inicial é a query; o evento de socket faz `setQueryData` do snapshot; o fallback
   reusa `refetch`/`refetchInterval` espaçado quando desconectado. As substituições
   pendentes (`mkt.substitutions`) seguem o mesmo padrão. Migrar a tela do
   `useState`/`useEffect`/`setInterval` atual para esse hook (código legado migra ao ser
   tocado).
4. **Encerrar limpando:** desinscrever/desconectar o socket no unmount e quando o pedido
   chega a estado terminal (`delivered`/`canceled`), como o `setInterval` faz hoje.

## Validação

Camadas tocadas: **`packages/api-client`** (socket client) e **`apps/customer`** (hook +
tela). Frontend-only.

- `packages/api-client` — testes do socket client (padrão `client.test.ts`):
  conexão usa o token de `getToken`; `on`/`emit`/`subscribe:order` encaminham certo;
  `disconnect` limpa. Mockar `socket.io-client` (sem rede).
- `apps/customer` — testes do hook `useOrderTracking` (padrão
  `src/__tests__/marketplace.test.ts` + React Query test utils):
  - load inicial popula o snapshot (REST);
  - evento `order.updated` atualiza o cache sem refetch;
  - fallback: socket desconectado → refetch por intervalo;
  - cleanup ao desmontar e em estado terminal (não vaza listener/intervalo).
- Conferir que a tela não importa `useQuery`/`setInterval` diretamente (orquestra o hook).

**Gate de cobertura (obrigatório):** código novo sem teste não fecha a story. Rodar
`pnpm --filter @markethub/api-client test:coverage` e
`pnpm --filter @markethub/customer test:coverage` (ou equivalentes do app); sem
`skip`/`only`/`xfail` injustificado. Antes de "pronto": `pnpm typecheck` + `pnpm build`.
Se a tela consome status de "Comprando"/progresso, validar **junto com a story 01**
(end-to-end manual: picker inicia → cliente vê "Comprando" sem refresh).

## Fora de escopo

- Transições de status e emit no backend → **story 01** (pré-requisito).
- Mapa/geolocalização do entregador (rastreio segue por status, sem mapa).
- Push real (FCM/APNs).
- Reuso do mesmo socket em outras telas além de `/track/:id` (esta story foca o rastreio
  do pedido; generalização fica para quando outra tela precisar).
