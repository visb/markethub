# 26 Cobertura de testes — conectores ERP e providers de enrichment

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura
- **Status:** todo
- **Depende de:** 19

## Objetivo

Cobrir a ingestão de catálogo/preço/estoque (ERP CSV) e os providers de enriquecimento GTIN, hoje
0%.

## User story

Como time, quero ingestão ERP e providers de enrichment cobertos, para que importação de preço/
estoque e enriquecimento por GTIN não quebrem silenciosamente.

## Critérios de aceite

- `erp/connectors/csv.connector.ts` (**0%**) e `erp/connectors/csv.util.ts` (**0%**) ≥ 80%:
  parsing de fixtures, linhas inválidas, mapeamento de colunas, preço/estoque.
- `erp/erp.scheduler.ts` / `erp.processor.ts` (**0%**) cobertos no disparo.
- `enrichment/providers/cosmos.provider.ts` (**0%**) e `mock.provider.ts` (**0%**) ≥ 80%:
  resposta ok, GTIN não encontrado, falha de rede (mockada).
- `enrichment/enrichment.processor.ts` (**0%**) coberto.

## Escopo / Fora de escopo

**Dentro:** specs de connectors ERP + providers de enrichment + processors/scheduler. **Fora:**
mapeamento de categoria por IA (já em `enrichment-mapping.spec`).

## Notas técnicas

Usar fixtures CSV existentes em `services/api/src/erp`. Mockar HTTP do Cosmos — sem rede real.
`erp.service.spec` e `catalog-normalize.spec` dão o padrão.
