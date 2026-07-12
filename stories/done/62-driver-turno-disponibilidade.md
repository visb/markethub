# Plan: driver — turno on/off (disponibilidade)

## Context

A loja atribui entrega a qualquer `StoreStaff` driver ativo — o vínculo (`StoreStaff.active`) é
administrativo, não diz se a pessoa **está trabalhando agora**. Resultado: picker/gerente
atribui entrega a driver de folga. Não existe noção de turno.

Precedente no schema: o veículo do turno corrente já vive no `User`
(`activeVehicleId`, story 15) — a disponibilidade acompanha.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- `User.driverAvailableAt DateTime?` — null = indisponível; timestamp = disponível desde
  (exibível). Global ao driver (não por loja) — turno é da pessoa.
- **Atribuição manual** (picker/loja) a driver indisponível é **bloqueada** no backend
  (`DRIVER_UNAVAILABLE`); a listagem mostra todos com badge, indisponível vem desabilitado.
- **Aceite self-service** (`deliveries/available`) exige disponível — indisponível vê a lista
  com banner "você está indisponível" e o aceitar desabilitado (toggle a um toque).
- Logout desliga o turno automaticamente.

## Desenho

### Schema

1. Migration: `User.driverAvailableAt DateTime?`.

### Backend (`services/api/src/driver`)

2. `POST driver/availability { available: boolean }` (role driver) — seta/limpa
   `driverAvailableAt`; idempotente. Expor o estado no DTO que o app driver já consome
   (ex.: junto de `vehicle/current`).
3. `store/drivers` (picker/loja): incluir `available: boolean` + `availableSince` no DTO.
4. Guard nas atribuições: atribuir (store-deliveries) a driver indisponível →
   `DRIVER_UNAVAILABLE`; `POST driver/deliveries/:id/accept` com ator indisponível → idem.
5. Logout (auth): se o user tem role driver, limpar `driverAvailableAt` (mesmo ponto em que a
   sessão morre).

### Driver app

6. Home: switch "Disponível" proeminente no topo (verde/cinza + "desde HH:MM"); mutation
   otimista. Indisponível → banner sobre a lista de disponíveis + aceitar desabilitado.

### Picker app (entregas da loja)

7. Lista de drivers p/ atribuir: badge disponível/indisponível, indisponível desabilitado.
   Tratar `DRIVER_UNAVAILABLE` (corrida: ficou indisponível entre load e clique) com toast +
   refetch.

## Validação

- Backend: specs do toggle (idempotente, role errada nega), guards de atribuição/aceite
  (indisponível → `DRIVER_UNAVAILABLE`), logout limpa, DTO com badge. Migration limpa.
  `pnpm --filter @markethub/api test`.
- Driver: switch (otimista + rollback), banner/desabilitado quando off.
- Picker: badge, desabilitado, toast de corrida.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  driver + picker ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm --filter @markethub/api prisma:generate` antes do typecheck; `pnpm typecheck` + build.

## Fora de escopo

- Disponibilidade por loja (global ao driver).
- Auto-off por inatividade / fim de expediente.
- Escala/agenda de turnos (planejamento de RH).
- Ofertar entrega automaticamente ao driver disponível (dispatch automático — atribuição segue
  manual + aceite).
