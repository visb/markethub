# 25 Cobertura de testes — catálogo (service, qualidade, categoria marketplace)

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura
- **Status:** todo
- **Depende de:** 19

## Objetivo

Cobrir o miolo do catálogo: `catalog.service` (maior gap absoluto, ~490 linhas), `catalog-quality`
e `marketplace-category`.

## User story

Como time, quero o catálogo coberto, para que edição de produto, lockedFields e árvore de
categoria não regridam.

## Critérios de aceite

- `catalog/catalog.service.ts` (hoje **17.7%**) ≥ 80% linhas: CRUD produto, `lockedFields` (só o
  diff trava), busca/filtro, dedup entre lojas.
- `catalog/catalog-quality.service.ts` (**0%**) ≥ 80%: score/completeness.
- `marketplace/marketplace-category.service.ts` (**0%**) ≥ 80%: árvore, mapeamento.
- Controllers correspondentes cobertos no caminho feliz + validação.

## Escopo / Fora de escopo

**Dentro:** specs de catalog/catalog-quality/marketplace-category (service+controller). **Fora:**
enrichment pipeline (já tem specs; providers na story 26).

## Notas técnicas

`admin-catalog.service.spec`, `catalog.service.spec`, `completeness.spec` já existem — ampliar, não
duplicar. Conferir `lockedFields` em `BUSINESS_RULES.md`.
