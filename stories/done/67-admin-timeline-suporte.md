# Plan: admin — detalhe profundo do pedido, timeline e ferramentas de suporte

## Context

Suporte da plataforma não tem ferramenta: `Orders.tsx` do admin é lista paginada com filtro de
status (padrão legado `useState`/`useEffect` — **migra ao ser tocado**, regra do repo), sem
busca, sem detalhe navegável, sem ação. `GET admin/orders/:id` já devolve detalhe com
refund+components, e `OutboxEvent` é indexado por `aggregateId` — a matéria-prima da timeline
existe. Nenhuma ação administrativa sobre pedido (cancelar/reembolsar) existe hoje.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- **Busca** por id do pedido, nome ou e-mail do cliente (`User` não tem telefone — entra
  quando a story de conta/perfil do customer criar o campo).
- **Cancelamento admin** (suporte) pode ultrapassar a invariante do cliente: permitido em
  qualquer status não-terminal (≠ `delivered`/`canceled`), Order inteiro, estorno total via
  fluxo da story 48. Exceção registrada em BUSINESS_RULES.md.
- **Reembolso manual parcial** por grupo: valor arbitrário limitado ao teto
  (total pago − já reembolsado), vira `RefundComponent` com reason `manual` (valor novo no
  enum `RefundReason`) e estorno parcial durável.
- **Trilha mínima**: `RefundComponent.createdById` (quem fez o reembolso manual); audit log
  genérico fica fora.
- Timeline = merge de eventos do outbox do agregado (`type`, `createdAt`) + marcos de
  timestamps do pedido/grupos/delivery — ordenada, vertical.

## Desenho

### Schema

1. Migration: enum `RefundReason` + `manual`; `RefundComponent.createdById String?`.

### Backend (`services/api/src/admin`)

2. `GET admin/orders` ganha `q` (match id exato, nome/e-mail `contains` insensitive).
3. `GET admin/orders/:id/timeline` → itens `{ at, kind, label, meta }` combinando OutboxEvent
   (`aggregateId = orderId`) e timestamps (created/paid/picking/ready/on_the_way/delivered/
   canceled por grupo; delivery failed se story 61 presente).
4. `POST admin/orders/:id/cancel { reason? }` — não-terminal → cancela Order inteiro
   (delegando ao marketplace via barrel, flag de override admin), evento `order.canceled` →
   estorno total (48). Terminal → `CANNOT_CANCEL`.
5. `POST admin/orders/:id/refund { orderGroupId, amountCents, note? }` — valida teto
   (pago − reembolsado), cria component `manual` com `createdById = admin`, dispara estorno
   parcial durável (mesmo mecanismo 48/54). `REFUND_EXCEEDS_PAID` acima do teto.
6. **Atualizar BUSINESS_RULES.md** (cancelamento admin, reembolso manual, teto).

### Admin app

7. `Orders.tsx`: migrar p/ React Query (hooks + query keys) ao tocar; adicionar campo de
   busca `q` com debounce.
8. Rota de detalhe `orders/:id`: cabeçalho (cliente, totais, pagamento, refund acumulado),
   grupos com itens/substituições, **timeline vertical**, painel de ações:
   - Cancelar pedido (confirm com motivo).
   - Reembolso manual (modal: grupo, valor R$ com máscara → cents, nota; mostra teto
     restante).
   Desabilitar ações conforme estado (terminal, teto zerado).

## Validação

- Backend: specs da busca (id/nome/email), timeline (merge ordenado, pedido sem eventos),
  cancel admin (não-terminal ok inclusive `on_the_way`, terminal nega, estorno disparado),
  refund manual (teto, acúmulo de components, `createdById`, valor ≤ 0 nega). Migration limpa.
  `pnpm --filter @markethub/api test`.
- Admin: busca com debounce, detalhe renderiza timeline/grupos, modais de ação (validação de
  teto no client, sucesso invalida queries). `pnpm --filter @markethub/admin test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  admin ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm --filter @markethub/api prisma:generate` antes do typecheck; `pnpm typecheck` + build.

## Fora de escopo

- Busca por telefone (campo não existe — story de conta/perfil).
- Audit log genérico de ações admin.
- Reembolso por item (por grupo/valor só).
- Reenviar push/e-mail ao cliente a partir do detalhe.
