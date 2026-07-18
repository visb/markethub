# PROGRESS — rodada AUTORUN (busca + favoritos + qty stepper, 81-84)
Ordem: 81 → 82 → 83 → 84   |   Branch base: main   |   Merge na main por unidade: sim
Deps rígidas: 81→82 (ambas tocam `apps/customer/app/search.tsx`; se 81 bloquear, 82 bloqueia)  ·  cadeias independentes: 83, 84
Cuidados da rodada: sem migration; 81/82 tocam contrato em `apps/customer/src/api/marketplace.ts` (front-only, backend não importa packages/types — atualizar os dois lados); 83 inclui migração obrigatória da tela favorites para React Query (legado migra ao ser tocado); cobertura piso 80% / diff ≥ 90% em api e customer.

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 81 | Busca — card do resultado igual ao da home | — | done |
| 82 | Busca — encontrar mercados pelo nome | 81 | done |
| 83 | Favoritos — nome do mercado + migração React Query | — | in_progress |
| 84 | QtyStepper — altura igual ao botão e alinhamento | — | todo |

[OK] 81 — testes: api 1556/1556 (catalog 74/74), customer 363/363 (searchScreen 6/6); coverage api 90.76% / customer 87.83% — commit: a2f8075 — merge: main (no-ff) — 2026-07-18
[OK] 82 — testes: api 1571/1571 (catalog 162/162), customer 371/371; coverage api+customer verdes — commit: fd8f435 — merge: main (no-ff) — 2026-07-18
