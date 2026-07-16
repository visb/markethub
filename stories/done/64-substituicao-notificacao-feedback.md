# Plan: substituição — push ao cliente na proposta + feedback da decisão ao picker

## Context

O loop de aprovação de substituição está **quase completo no backend** (descoberta do
planning 2026-07-11 — a premissa "decisão unilateral do picker" do backlog estava errada):
picker propõe (`POST .../substitute`), cliente aprova/recusa no track
(`orders/:orderId/substitutions/:subId/approve|reject`), re-proposta volta a `pending` e
existe política de timeout (auto-aceita substituto até X% mais barato, senão remove). Faltam
as duas pontas de comunicação:

- **Cliente não é avisado** da proposta — só descobre se abrir o track por conta própria;
  na prática o timeout decide quase sempre.
- **Picker propõe às cegas** — nenhuma tela do picker mostra `approvalStatus`
  (aguardando/aprovada/recusada).

Decisões travadas: story reduzida ao gap real. **Depende da story 50** (infra de push nos
apps) — implementar depois dela.

## Desenho

### Backend

1. Producer de push na proposta de substituição (`substitution.service.propose`):
   `sendToUser(cliente)` — título "Substituição no seu pedido", corpo com nome do substituto,
   `data.route = /track/<orderId>`. Re-proposta re-notifica.
2. Resolução (approve/reject/timeout) → emitir evento no gateway `/picking` existente p/ a
   sala da task/loja (`substitution:resolved` com `pickItemId`, `approvalStatus`), no padrão
   dos emits atuais (`EVENT_VERSION`).

### Picker app

3. `task/[id]`: item com substituição ganha badge de status — "aguardando cliente" (pending),
   "aprovada" (verde), "recusada/removida" (vermelho) — atualizado em realtime pelo evento
   (socket já conectado na tela) + refetch de reconciliação.

### Customer app

4. Nada novo de tela (track já lista e decide) — só garantir que o tap do push abre
   `/track/[id]` (handler da story 50).

## Validação

- Backend: spec do producer (push disparado na proposta e re-proposta, payload com route) e
  do emit de resolução (approve, reject e timeout emitem). `pnpm --filter @markethub/api test`.
- Picker: badge por status + atualização ao receber evento (mock socket).
  `pnpm --filter @markethub/picker test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  picker ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Mudar a política de timeout (janela/percentual seguem como estão).
- Chat picker ↔ cliente.
- Push na **resolução** para o cliente (ele mesmo decidiu; timeout aparece no track).
