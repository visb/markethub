# PROGRESS — rodada AUTORUN 45–49 (event-driven backend: outbox, fronteiras, push assíncrono) — ENCERRADA

Ordem: 45 → 46 → 47 → 48 → 49   |   Branch base: main   |   Merge na main por unidade: sim
Deps rígidas: 45→46 e 45→48 (infra outbox/relay/ProcessedEvent). 46→48 preferencial. 47 pressupõe 45/46. 49 independente.
Cuidados da rodada: migrations novas (OutboxEvent, ProcessedEvent na 45); gate de cobertura rígido (piso 80, diff ≥ 90); 47 lint de fronteira + allow-list; 49 sem outbox (fila BullMQ simples); sem push/PR; sem credencial externa.

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 45 | Eventos de domínio — outbox + relay + migração `order.paid` | — | done |
| 46 | Eventos de domínio p2 — `order.created` → PIX · `picking.done` → entrega | 45 | done |
| 47 | Modular monolith — travar fronteiras de contexto (lint + allow-list) | 45,46 | done |
| 48 | Eventos de domínio p3 — `order.canceled` + estorno durável com retry | 45 (46 pref.) | done |
| 49 | Push notifications assíncronas — fila BullMQ atrás do `PushService` | — | done |

## Log

[OK] 45 — testes: api 937/937 (87 suítes, +21) + e2e payment 4/4; coverage 83.39% linhas — commit: 3e12989 — merge: a0a886b — 2026-07-07
Nota: lint do @markethub/api vermelho JÁ NA MAIN (import não usado em merchant-product.service.spec.ts) — corrigido em commit próprio na main (e66b9a6).

[OK] 46 — testes: api 967/967 (90 suítes) + e2e 111/111 + diff-coverage 100%; coverage 83.49% linhas — commit: fb5a7a0 — merge: 715a1d6 — 2026-07-07
Nota: corrigiu bug latente da 45 (jobId com `:` rejeitado pelo BullMQ → relay morto em runtime; separador virou `__`) e e2e picking/delivery que já estavam vermelhos na main.

[OK] 47 — testes: api 967/967 + e2e 111/111; coverage 83.57% linhas; lint com regra de fronteira verde — commit: 5faecdd — merge: 2e6c067 — 2026-07-07
Nota: allow-list herdada = 7 arestas, todas do ciclo payment↔fulfillment (follow-up: fachada order-status + reembolso por evento). Detalhe em docs/context-boundaries.md.

[OK] 48 — testes: api 997/997 (92 suítes) + e2e 111/111 + diff-coverage 100%; coverage 83.68% linhas — commit: 76d141a — merge: f7fd951 — 2026-07-08
Nota: drenou 4 arestas da allow-list de fronteira (todo o lado fulfillment→payment); restam 2 (payment→marketplace). Retry de estorno: attempts=5, backoff exponencial 5s, markFailed só na última tentativa.

[OK] 49 — testes: api 1003/1003 (93 suítes) + e2e 111/111; coverage 83.73% linhas — commit: 45a7445 — merge: 5c8c4a5 — 2026-07-08
Nota: fachada `sendToUser` preservada; retry attempts=3, backoff exponencial 2s, descarte ao esgotar (sem dead-letter). Sem outbox por decisão travada.

## Resumo final

**5/5 unidades OK, zero bloqueios, zero PENDENTE-MANUAL.** Backend migrado para eventos de domínio duráveis:

- **Infra (45):** transactional outbox (`OutboxEvent` + `ProcessedEvent`, migration `20260707131730`), `OutboxPublisher` na TX do agregado, relay por poll BullMQ com fan-out por subscriber (1 job/handler, retry isolado), dedupe idempotente `eventId+handler`. `order.paid` migrado.
- **Fluxos (46/48):** `order.created` (checkout → cobrança PIX + webhook merchant + socket), `picking.done` (→ entrega + shortfall refund), `order.canceled` (→ estorno durável com retry + liberar slot + notificações). Estorno falho não morre mais em log.
- **Fronteiras (47):** regra ESLint `markethub/context-boundaries` no lint normal do CI; cross-context só via barrel/module permitido/evento; allow-list herdada caiu de 7 → 2 arestas (payment→marketplace; follow-up: fachada order-status).
- **Push (49):** provider fora do caminho quente via fila BullMQ dedicada, best-effort com retry leve.

Suíte final: api unit 1003/1003 (93 suítes), e2e 111/111 (11 suítes), coverage 83.73% linhas (piso 80), lint/typecheck/build verdes.

Consertos colaterais na main: import morto em merchant-product spec (e66b9a6); bug do jobId `:` do BullMQ (relay morto em runtime desde a 45, corrigido na 46); e2e picking/delivery vermelhos na main (corrigidos na 46 com poll helper `test/helpers/wait.ts`).

Branches preservadas: `story/45-eventos-dominio-outbox-order-paid`, `story/46-eventos-dominio-checkout-picking-done`, `story/47-modular-monolith-fronteiras`, `story/48-eventos-dominio-cancelamento-estorno`, `story/49-push-notifications-assincronas`.

Reproduzir gates: `pnpm --filter @markethub/api prisma:generate && pnpm typecheck && pnpm build && pnpm --filter @markethub/api test && pnpm --filter @markethub/api lint` (e2e: `pnpm --filter @markethub/api test:e2e`, exige `pnpm infra:up`).
