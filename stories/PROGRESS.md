# PROGRESS — rodada AUTORUN (busca + favoritos + qty stepper, 81-84)
Ordem: 81 → 82 → 83 → 84   |   Branch base: main   |   Merge na main por unidade: sim
Deps rígidas: 81→82 (ambas tocam `apps/customer/app/search.tsx`; se 81 bloquear, 82 bloqueia)  ·  cadeias independentes: 83, 84
Cuidados da rodada: sem migration; 81/82 tocam contrato em `apps/customer/src/api/marketplace.ts` (front-only, backend não importa packages/types — atualizar os dois lados); 83 inclui migração obrigatória da tela favorites para React Query (legado migra ao ser tocado); cobertura piso 80% / diff ≥ 90% em api e customer.

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 81 | Busca — card do resultado igual ao da home | — | todo |
| 82 | Busca — encontrar mercados pelo nome | 81 | todo |
| 83 | Favoritos — nome do mercado + migração React Query | — | todo |
| 84 | QtyStepper — altura igual ao botão e alinhamento | — | todo |
