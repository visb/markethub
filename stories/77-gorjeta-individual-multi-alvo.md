# Plan: Gorjeta individual por alvo (plataforma, entregador, mercado)

## Context

Hoje a gorjeta é só para o entregador: 1 `Tip` por pedido (`orderId @unique`, `driverId`
obrigatório), criada na tela de review pós-entrega, com PIX próprio (`reviews/tips.service.ts`).
A story torna a gorjeta **individual por alvo**: plataforma, entregador e cada mercado do
pedido, com **um único pagamento** somando tudo.

Decisões travadas (refinadas no planning):

- **Fluxo permanece pós-entrega, na tela de review** — não mexe no checkout/total do pedido.
- **Pedido multi-mercado: uma linha por mercado** (espelha o review por merchant já existente).
- UX: cada linha (Plataforma, Entregador, cada Mercado) com **checkbox marcado por padrão** e
  **input de valor iniciado em R$ 2,00**, editável. Rodapé soma as linhas marcadas e um botão
  gera **um único PIX** do total.
- Pedido de retirada (sem delivery/driver): linha "Entregador" não aparece.
- Gorjetas legadas (driver) são backfilladas como item driver — histórico e ganhos do driver não
  podem quebrar.

## Desenho

### Schema (migration nova)

- `TipItem` novo: `tipId`, `target` (enum `TipTarget`: `platform | driver | merchant`),
  `targetDriverId?`, `targetMerchantId?` (weak refs no padrão do Review), `amountCents`.
- `Tip` vira o agregado de cobrança: mantém `orderId @unique`, `amountCents` (total), status e
  campos PIX; `driverId` passa a nullable (legado). Migration backfilla cada tip existente com um
  `TipItem` `driver` de mesmo valor.

### Backend (`services/api`)

- `reviews/tips.service.ts`: create recebe `items: { target, targetId?, amountCents }[]`
  (DTO valida: alvos válidos p/ o pedido — driver só se houve entrega, merchants do pedido,
  plataforma no máx. 1; `amountCents > 0`; sem alvo duplicado), soma total, cria `Tip` +
  `TipItem[]` e gera **uma** cobrança PIX via `PaymentProvider` (fluxo atual). Webhook de
  pagamento continua marcando o `Tip` (status agregado) — itens herdam via relação.
- `driver/driver-earnings.service` + `earnings.mapper`: gorjeta do driver passa a somar
  `TipItem` (`target=driver`, tip paga) em vez de `Tip.driverId` — legado coberto pelo backfill.
- Endpoint de leitura da tela devolve os alvos possíveis do pedido (driver? merchants?) para o
  app montar as linhas.

### Contratos (`packages/types`) + app customer

- Tipos `TipTarget`, `TipItemInput`, resposta do create (total + PIX) e dos alvos do pedido.
- `app/review/[id].tsx` orquestra componente novo de gorjeta: linhas com checkbox (default
  marcado) + input monetário (default R$ 2,00), total dinâmico, um botão de pagar → QR PIX
  (fluxo de exibição atual). Hooks React Query; form com react-hook-form + zod + `Controller`.

## Validação

- `pnpm --filter @markethub/api test:coverage` — casos: create multi-item soma e gera uma
  cobrança; driver rejeitado em pedido de retirada; merchant fora do pedido rejeitado; alvo
  duplicado rejeitado; webhook paid propaga; ganhos do driver contam item driver pago e ignoram
  não-pago/outros alvos; tip legada (backfill) segue nos ganhos.
- `pnpm --filter @markethub/customer test:coverage` — linhas default marcadas com R$ 2,00; soma
  reage a checkbox/valor; retirada esconde entregador; submit envia só linhas marcadas.
- `pnpm typecheck` + `pnpm build`.
- **Gate:** código novo sem teste não fecha a story (diff ≥ 90%); sem `skip`/`only` injustificado.

## Fora de escopo

- Gorjeta no checkout (junto do pagamento do pedido).
- Repasse/split financeiro real dos valores por alvo (plataforma/mercado) — só registro.
- Editar/cancelar gorjeta após criada; reembolso de gorjeta.
