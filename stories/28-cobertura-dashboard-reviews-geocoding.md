# 28 Cobertura de testes — dashboard admin, agregado de reviews e geocoding

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura
- **Status:** todo
- **Depende de:** 19

## Objetivo

Fechar os zeros de risco médio restantes: métricas do dashboard, agregação de avaliação e provider
de geocoding.

## User story

Como time, quero dashboard, agregado de reviews e geocoding cobertos, para que métricas, média de
avaliação e resolução de endereço não regridam.

## Critérios de aceite

- `admin/admin-dashboard.service.ts` (**0%**) ≥ 80%: agregações/contagens.
- `reviews/reviews-aggregate.service.ts` (**0%**) ≥ 80%: média, contagem, distribuição de notas.
- `geocoding/providers/nominatim.geocoding-provider.ts` (**0%**) e `mock.geocoding-provider.ts`
  (**0%**) ≥ 80% com HTTP mockado.
- Controllers correspondentes cobertos no caminho feliz.

## Escopo / Fora de escopo

**Dentro:** specs dashboard, reviews-aggregate, geocoding providers. **Fora:** glue de baixo risco
(filters, env, health, controllers finos restantes) — opcional, fora do ratchet crítico.

## Notas técnicas

`reviews.service.spec` já existe — ampliar para o aggregate. Mockar Nominatim — sem rede.
