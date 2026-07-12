# Plan: merchant — pausar loja + toggle rápido de disponibilidade

## Context

Dois controles de emergência que o lojista não tem hoje:

- **Pausar loja**: fechar temporariamente (rush, falta de picker, problema operacional) sem
  mexer em horário semanal nem em `Store.active` (que é ativação administrativa). Nada no
  schema/UI cobre isso.
- **Esgotou na gôndola**: marcar produto indisponível direto da lista do catálogo. O backend já
  cobre 100% — `Offer.available` é lockável (`OFFER_LOCKABLE`), `PATCH merchant/offers/:id`
  existe e `useUpdateOffer`/`useUnlockOfferField` também; só falta o toggle na linha da tabela
  (hoje exige abrir o form).

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- Pausa = `Store.pausedAt DateTime?` (timestamp permite "pausada desde HH:MM"); null = ativa.
- Endpoints dedicados `POST merchant/stores/:id/pause` / `POST .../resume` (mesma capability da
  edição de loja) — não sobrecarregar o PATCH genérico.
- **Pausa bloqueia todo pedido novo**, inclusive agendado (`STORE_PAUSED`) — é emergência
  curta; diferente de loja fechada por horário (story 52 permite agendado).
- Toggle manual de `available` mantém a semântica de lock existente (trava contra sync ERP;
  cadeado de unlock já presente na tela).

Dependência: story 52 (badge aberto/fechado no customer e validação de checkout) — esta story
estende os mesmos pontos; implementar após a 52.

## Desenho

### Schema

1. Migration: `Store.pausedAt DateTime?`.

### Backend

2. Módulo `merchant`: `pause`/`resume` (idempotentes; pausar loja já pausada = no-op).
   Expor `pausedAt` no DTO de loja do merchant.
3. `catalog.service`: loja pausada → `openNow = false` + flag `paused: true` no DTO de
   vitrine/detalhe (customer distingue "fechada" de "pausada temporariamente").
4. `marketplace` (checkout): grupo com loja pausada → `{ code: "STORE_PAUSED" }`, mesmo para
   pedido agendado (diferença deliberada vs `STORE_CLOSED` da story 52).

### Merchant app

5. Header da página Lojas (e/ou EditStore): botão "Pausar loja" / "Retomar" com confirm +
   badge "Pausada desde HH:MM" bem visível (estado perigoso de esquecer ligado).
6. Catálogo: coluna `available` da tabela de ofertas vira switch inline (mutation
   `useUpdateOffer` existente, optimistic update + rollback em erro); ícone de cadeado segue
   como está.

### Customer app

7. Badge "Pausada" na página/cards da loja (reusa pontos da story 52); checkout trata
   `STORE_PAUSED` com mensagem própria (sem CTA de agendamento — pausa bloqueia tudo).

## Validação

- Backend: specs pause/resume (idempotência, capability, escopo), vitrine com `paused`,
  checkout `STORE_PAUSED` imediato **e** agendado. Migration limpa.
  `pnpm --filter @markethub/api test`.
- Merchant: toggle de pausa (confirm, badge), switch de available (optimistic + rollback).
- Customer: badge pausada, erro de checkout.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  merchant + customer ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm --filter @markethub/api prisma:generate` antes do typecheck; `pnpm typecheck` + build.

## Fora de escopo

- Auto-retomar após N horas (lembrete/push ao lojista fica p/ depois).
- Pausar produto por período (só on/off).
- Pausa por loja no admin (admin já tem `active`).
