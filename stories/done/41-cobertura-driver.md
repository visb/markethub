# 41 Cobertura de testes — app driver

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura — frontend + libs
- **Status:** todo
- **Depende de:** 19

## Objetivo

Subir o `apps/driver` de **51% linhas** ao **mínimo de 80%** (política da rodada), cobrindo as telas
do entregador (home/entregas, login com seleção de veículo) e os hooks de dados ainda descobertos.

## User story

Como time, quero as telas do entregador cobertas, para que a fila de entregas, o aceite/atualização
de status e a seleção de veículo não regridam.

## Critérios de aceite

- **Home/entregas:** render da lista, estados (sem entregas/carregando), ação de avançar status.
- **Login + seleção de veículo** (story 15 já cobriu o hook/gate — fechar a tela e os branches de UI
  restantes: `VehiclePicker`, `VehicleIndicator`).
- Hooks de dados do driver: chave de `queryKeys`, `enabled`, invalidação; realtime se houver.
- Migrar fetch legado tocado pra React Query. **Agregado do workspace ≥ 80% linhas**; piso do driver
  sobe pra 80 no `jest` config.

## Escopo / Fora de escopo

**Dentro:** specs de home/entregas, login+veículo, componentes `VehiclePicker`/`VehicleIndicator`,
hooks. **Fora:** backend de veículos/entrega (já coberto stories 14/15); gorjeta (story 22).

## Notas técnicas

`useDriverVehicle`/`select-vehicle` já cobertos (story 15) — ampliar pros componentes e telas
restantes, sem duplicar. Mockar `expo-router`/`ApiClient`. Sem rede.
