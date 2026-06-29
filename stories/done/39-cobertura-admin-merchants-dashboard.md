# 39 Cobertura de testes — admin: merchants, lojas, usuários e dashboard

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura — admin (3/3)
- **Status:** todo
- **Depende de:** 37

## Objetivo

Terceira das três stories do admin. Cobrir o restante das páginas — **merchants/redes, lojas
(StoreDetail), usuários/permissões e dashboard** — fechando o `apps/admin` no **mínimo de 80% linhas**.

## User story

Como time, quero as telas de operação do admin cobertas, para que gestão de rede/loja, usuários e as
métricas do dashboard não regridam.

## Critérios de aceite

- **Merchants/lojas:** listagem + `StoreDetail` (edição de dados da loja, `phone`/`allowsPickup` e
  **horário de funcionamento** da story 29 — render de `HoursSection` + save por dia da semana).
- **Usuários/permissões:** CRUD/listagem de usuários admin, atribuição de papel (espelha RBAC já
  testado no backend — stories 16-18/24).
- **Dashboard:** render dos cards/métricas, filtros de período (agregações já cobertas no backend —
  story 28; aqui é a camada de view + hooks).
- Após esta story, `apps/admin` deve estar **≥ 80% linhas**; piso ajustado no `vitest.config.ts`.

## Escopo / Fora de escopo

**Dentro:** specs das páginas merchants/stores/usuários/dashboard + hooks. **Fora:** auth/shell
(37); catálogo (38). Sem mudar lógica de backend.

## Notas técnicas

`StoreDetail.tsx` já teve `minToHHMM`/`hhmmToMin` exportados+testados (fix de CI da rodada 14-34);
aqui cobrir o render/save de `HoursSection`. Mockar `ApiClient`/hooks; sem rede. Subir o piso final
do admin pra 80.
