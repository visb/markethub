# PROGRESS — rodada AUTORUN (event-driven backend: outbox, fronteiras, push assíncrono)

Ordem: 45 → 46 → 47 → 48 → 49   |   Branch base: main   |   Merge na main por unidade: sim
Deps rígidas: 45→46 e 45→48 (infra outbox/relay/ProcessedEvent — se 45 bloquear, 46 e 48 bloqueiam, não pular). 46→48 preferencial (48 reusa `picking.done`), mas 48 pode seguir se 46 bloquear por motivo alheio à infra. 47 e 49 independentes entre si; 47 pressupõe 45/46 mergeadas para a parte "comunicação por evento".
Cuidados da rodada: migrations novas (OutboxEvent, ProcessedEvent na 45) — nunca editar migration aplicada; `prisma generate` antes de typecheck; gate de cobertura rígido (piso 80, diff ≥ 90) — handlers/relay novos precisam de teste; 47 introduz regra de lint de fronteira + allow-list explícita (não "consertar" o ciclo payment↔marketplace nesta rodada, só vedar código novo); 49 NÃO usa outbox (decisão travada — fila BullMQ simples, fachada `sendToUser` preservada); nada de push/PR; sem credencial externa (Pagar.me/FCM ficam atrás de interface + mock, marcar PENDENTE-MANUAL se algo exigir ambiente real).

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 45 | Eventos de domínio — outbox + relay + migração `order.paid` | — | done |
| 46 | Eventos de domínio p2 — `order.created` → PIX · `picking.done` → entrega | 45 | todo |
| 47 | Modular monolith — travar fronteiras de contexto (lint + allow-list) | 45,46 | todo |
| 48 | Eventos de domínio p3 — `order.canceled` + estorno durável com retry | 45 (46 pref.) | todo |
| 49 | Push notifications assíncronas — fila BullMQ atrás do `PushService` | — | todo |

## Log

(entradas `[OK|PARCIAL|BLOQUEADO] NN — testes — commit — merge — data — bloqueio` após cada unidade)

[OK] 45 — testes: api 937/937 (87 suítes, +21) + e2e payment 4/4; coverage 83.39% linhas — commit: 3e12989 — merge: a0a886b — 2026-07-07
Nota: lint do @markethub/api vermelho JÁ NA MAIN (import não usado em merchant-product.service.spec.ts) — corrigido em commit próprio na main.
