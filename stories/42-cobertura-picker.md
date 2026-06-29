# 42 Cobertura de testes — app picker

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura — frontend + libs
- **Status:** todo
- **Depende de:** 19

## Objetivo

Fechar o gap pequeno do `apps/picker` de **63% linhas** ao meta-alvo de **70%**, cobrindo o que
restou do fluxo de separação fora dos hooks já testados.

## User story

Como time, quero o fluxo de picking coberto, para que fila, separação de item, substituição e
finalização não regridam.

## Critérios de aceite

- **Tela de picking/tarefa:** render da fila, item separado/faltante, ajuste de quantidade/peso,
  finalizar tarefa.
- **Substituição na UI:** buscar substituto (autocomplete já tem hook coberto — story 03), aplicar/
  recusar; refletir estado.
- Hooks restantes do picker sem cobertura: chave de `queryKeys`, `enabled`, invalidação, realtime.
- Piso do picker sobe pra 70 no `jest` config.

## Escopo / Fora de escopo

**Dentro:** specs das telas/hooks de picking restantes. **Fora:** fila `queued`/realtime e
autocomplete (já cobertos stories 01/02/03); backend de substituição (story 22).

## Notas técnicas

`usePickQueue`/`useSubstituteSearch`/`useDebouncedValue` já cobertos — focar nas telas e nos hooks
ainda zerados. Mockar `expo-router`/`ApiClient`/socket. Sem rede.
