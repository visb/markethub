# Plan: driver — fluxo de problema na entrega (falha, retorno, decisão da loja)

## Context

O fluxo de entrega só tem caminho feliz: `unassigned → assigned → picked_up → delivered` (ou
`canceled`). Cliente ausente, endereço errado ou recusa não têm representação — o driver fica
travado com uma entrega que não consegue concluir.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- Falha é da **Delivery** (não do OrderGroup): status novo `failed` + motivo. O status do grupo
  não ganha estado novo — painéis derivam a exibição da delivery (evita ripple em todos os
  boards/DTOs).
- Após falha, a **loja decide**: "tentar novamente" (delivery volta a `unassigned`, driver
  limpo, itens de volta à fila de entrega) ou "cancelar sub-pedido" (fluxo da story 54 —
  cancelamento por grupo + estorno). Guardar só a **última** falha (histórico de tentativas
  fora de escopo).
- Depende das stories **54** (cancelar grupo — a invariante lá precisa aceitar grupo com
  delivery `failed`) e **50** (push ao cliente); implementar depois delas.

## Desenho

### Schema

1. Migration: enum `DeliveryStatus` + `failed`; `Delivery.failReason`
   (`customer_absent | wrong_address | refused | other`), `failNote String?`,
   `failedAt DateTime?`.

### Backend

2. `POST driver/deliveries/:id/fail { reason, note? }` — guard: driver dono + status
   `picked_up` (falha só depois de coletar; antes ele simplesmente não aceita). Na TX: status
   `failed` + evento outbox `delivery.failed` (orderId, groupId, deliveryId, reason).
3. Handler do evento: push ao cliente ("problema na sua entrega: <motivo>, a loja vai entrar
   em contato") + realtime pro painel merchant (som/badge da story 54).
4. Decisão da loja — `POST store/deliveries/:id/retry` (staff da loja/manager, mesmo guard das
   ações de `store-deliveries.controller`): `failed → unassigned`, limpa `driverId`/timestamps
   de coleta, mantém `failReason` da última falha. Cancelar usa o endpoint da story 54.
5. Invariante da 54 ajustada: grupo com delivery `failed` **pode** cancelar (exceção à trava
   de PickTask avançada — itens já separados voltam pro estoque? NÃO: estoque fica como está;
   registrar em BUSINESS_RULES).
6. **Atualizar `BUSINESS_RULES.md`** (DeliveryStatus + failed, quem decide, retry).

### Driver app

7. `delivery/[id]`, fase pós-coleta: botão secundário "Problema na entrega" → sheet com os 4
   motivos + observação opcional → confirm ("o pedido volta para a loja"). Depois, tela mostra
   estado "aguardando decisão da loja" e libera voltar à home.

### Picker app (tela de entregas da loja) + merchant

8. `deliveries.tsx` (picker) e board do merchant: entrega `failed` destacada (motivo + hora)
   com ações "Reenviar" (retry) e "Cancelar sub-pedido" (54). Realtime já existente atualiza.

## Validação

- Backend: specs do fail (só dono, só picked_up, TX status+outbox), retry (só failed, limpa
  driver, mantém motivo), handler (push + idempotência), invariante da 54 com failed.
  Migration limpa. `pnpm --filter @markethub/api test`.
- Driver: sheet de motivo (validação, confirm, estado pós-falha). Picker: card failed com
  ações. Merchant: badge/ação no board.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  driver + picker + merchant ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm --filter @markethub/api prisma:generate` antes do typecheck; `pnpm typecheck` + build.

## Fora de escopo

- Histórico de múltiplas tentativas (só última falha).
- Reagendamento com o cliente (nova janela/slot) — retry volta pra fila imediata.
- Devolução de estoque dos itens separados.
- Foto/comprovante de tentativa (POD fica p/ story futura se precisar).
