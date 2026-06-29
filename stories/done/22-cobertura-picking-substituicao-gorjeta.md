# 22 Cobertura de testes — substituição (picking) e gorjeta (driver)

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura
- **Status:** todo
- **Depende de:** 19

## Objetivo

Cobrir `picking/substitution.service` e `driver/tips.service` — ambos mexem em valor cobrado/pago,
hoje 0%.

## User story

Como time, quero substituição de item e gorjeta cobertas, para que troca de produto não cobre
errado e gorjeta chegue certa ao entregador.

## Critérios de aceite

- `picking/substitution.service.ts` (**0%**) ≥ 80% linhas: substituir item, ajuste de
  preço/estorno, aprovação/recusa do cliente, item sem substituto.
- `picking/substitution.scheduler.ts` (**0%**) coberto no disparo.
- `driver/tips.service.ts` (**0%**) ≥ 80% linhas: criar gorjeta, valor, associação a pedido/
  entregador, idempotência.
- Erros no shape `{ code, message }`.

## Escopo / Fora de escopo

**Dentro:** specs de substitution (service+scheduler) e tips. **Fora:** resto do picking já
coberto.

## Notas técnicas

`picking.service.spec.ts` e `handoff.service.spec.ts` dão o padrão de mock Prisma.
