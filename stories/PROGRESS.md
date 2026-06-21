# PROGRESS — rodada AUTORUN (stories 01 → 02)

Rodada: realtime tracking do pedido (`/track/:id`). Ordem rígida 01 → 02.
Fonte de verdade p/ retomar: **git log + este arquivo**. Story com `feat(story-NN)` = feita.

| # | Título | Status |
|---|---|---|
| 01 | Separação dirige status do pedido + emit realtime (backend picking) | OK |
| 02 | Tela /track/:id realtime via socket (api-client + customer) | OK |

## Log

<!-- [OK|PARCIAL|BLOQUEADO] NN — testes: <resumo> — commit: <hash> — merge: <hash> — <data> — <bloqueio> -->
[OK] 01 — testes: api unit 195/24 verde + e2e 34/8 verde, typecheck 11/11 — commit: 28f645e — merge: ff54e09 — 2026-06-21 — sem bloqueio (sem schema, sem dep externa)
[OK] 02 — testes: api-client 17 verde + customer 30 verde, typecheck 11/11 + build 8/8 — commit: 860d67a — merge: 8ff2a56 — 2026-06-21 — sem bloqueio (socket.io-client mockado)

## Resumo final da rodada

**Concluída.** Ambas as stories implementadas, testadas (suíte tocada toda verde) e mergeadas na
main. Sem push (conforme protocolo). Nenhum BLOQUEIO / PENDENTE-MANUAL.

- **01** (backend `picking`): `start()` agora dirige `OrderGroup→picking` + recomputa `Order.status`
  e emite `order.updated`; `recomputeOrderStatus`+emit extraído p/ `OrderTrackingService`
  (compartilhado com `HandoffService`); `updateItem`/substitution/`completePicking` emitem no canal
  `order:` (best-effort). Sem schema/migration.
- **02** (frontend): RealtimeClient real em `@markethub/api-client` (socket.io-client, namespace
  `/picking`, JWT no handshake) substitui o stub; hook `useOrderTracking` no customer (load REST +
  subscribe:order + setQueryData no evento + fallback de polling + cleanup terminal); tela
  `/track/:id` migrada p/ React Query. Deps novas: `socket.io-client`, `@tanstack/react-query`.

### Branches/commits (sem push; branches não deletadas)
- `story/01-picking-dirige-status-pedido`: impl `28f645e` → merge `ff54e09` → arquivamento `434c789`
- `story/02-track-realtime-socket-cliente`: impl `860d67a` → merge `8ff2a56` → arquivamento `7c7cbef`
- Stories arquivadas em `stories/done/phase-8-realtime-tracking/`.

### Reproduzir (serviços de pé: Postgres/Redis/MinIO via `pnpm infra:up`)
```
pnpm --filter @markethub/api prisma:generate
pnpm --filter @markethub/api test && pnpm --filter @markethub/api test:e2e   # story 01
pnpm --filter @markethub/types build && pnpm --filter @markethub/api-client build
pnpm --filter @markethub/api-client test && pnpm --filter @markethub/customer test  # story 02
pnpm typecheck && pnpm build
```

Loop AUTORUN encerrado (cron deletado).
