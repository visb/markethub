# Plan: Driver /earnings — histórico respeita o filtro de período

## Context

Na página `/earnings` do app driver, os cards de resumo respeitam o seletor "Hoje / 7 dias /
30 dias", mas o "Histórico de entregas" lista **tudo**: `DriverService.deliveryHistory(userId,
page)` não recebe período e o hook `useDeliveryHistory()` é chamado sem parâmetro
(`apps/driver/app/earnings.tsx:30`). Bug — comportamento esperado é o histórico acompanhar o
mesmo filtro dos cards.

Decisões (sem ambiguidade de produto):

- Reusar `earningsPeriodStart` (`driver.service.ts`) — mesma janela dos cards
  (`today` = 00:00 do servidor; `7d`/`30d` = agora − N dias).
- Recorte por data da linha do histórico: entregue → `deliveredAt`; cancelada (sem
  `deliveredAt`) → `updatedAt` — mesma data que o `toHistoryItem` exibe.
- Trocar de período reseta a paginação (page 1).

## Desenho

### Backend (`services/api`)

- `deliveryHistory(userId, page, period)`: novo parâmetro `EarningsPeriod`; `where` ganha
  recorte `OR: [{ status: "delivered", deliveredAt: { gte: start } }, { status: "canceled",
  updatedAt: { gte: start } }]`. Paginação/ordenação inalteradas.
- Controller do histórico: query param `period` validado (DTO, enum `today|7d|30d`); definir
  default `30d` quando ausente (compat com chamadas sem o param).

### App driver

- `src/api` (módulo driver) + hook `useDeliveryHistory(period)`: período entra na chamada e na
  query key (via `queryKeys` — troca de período refaz a lista da page 1; paginação existente do
  hook preservada por período).
- `app/earnings.tsx`: passa o mesmo `period` do estado do seletor para `useDeliveryHistory`.

### Contratos

- Se o tipo do request do histórico vive em `packages/types`/`api-client`, adicionar o campo
  `period` — backend não importa `packages/types`; manter os dois lados.

## Validação

- `pnpm --filter @markethub/api test:coverage` — casos: entregue dentro/fora da janela;
  cancelada recortada por `updatedAt`; `today` corta em 00:00; default `30d` sem param;
  paginação segue funcionando com filtro.
- `pnpm --filter @markethub/driver test:coverage` — trocar chip refaz o histórico com o período
  novo e volta à page 1; lista vazia no período mostra o empty state.
- `pnpm typecheck` + `pnpm build`.
- **Gate:** código novo sem teste não fecha a story (diff ≥ 90%); sem `skip`/`only` injustificado.

## Fora de escopo

- Range custom de datas (janelas seguem fixas: today/7d/30d).
- Mudança no shape dos itens do histórico ou nos cards de resumo.
