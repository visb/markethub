# SF.3 Reembolso por falta em itens de peso (1 por pedido)

- **Fase:** fix (pré-fase-4)
- **Epic:** Correções de domínio
- **Status:** todo
- **Depende de:** [S3.3, S2.6, S2.7]

## Objetivo
Ao separar item de quantidade variável (`saleType=weight`), o separador informa as gramas realmente separadas. Se separou **menos** que o pedido, gerar reembolso da diferença. Se separou **mais**, registra mas mantém o valor cobrado (não cobra extra). Consolidar em **um único reembolso por pedido**, somando faltas de todos os itens/grupos.

## User story
Como cliente, quero ser reembolsado quando o separador entregar menos peso do que pedi, num único estorno por pedido, para não pagar pelo que não recebi.

## Regras de negócio
- **Item por peso, picked < requested:** falta = valor pedido − valor do peso separado. Entra no reembolso.
- **Item por peso, picked > requested:** registra `weightGramsPicked`, **cobra o valor original** (não cobra a mais, não vira crédito).
- **Item recusado (`refused`):** valor integral do item entra no reembolso (zera a cobrança). *(decisão: recusados somam no mesmo reembolso)*
- **Cobrança ajustada por item de peso = `min(picked, requested)`.** Total nunca excede o valor já pago.
- **Contabilidade por grupo:** cada `OrderGroup` calcula sua falta (auditoria/repasse ao merchant), mas o **estorno financeiro é único por `Order`**.
- **Gatilho:** quando **todas** as `OrderGroup` do pedido concluem a separação (`packed`/`ready_for_pickup`), consolidar e emitir 1 reembolso. Pedido de loja única dispara ao concluir aquele grupo.
- `refundCents = max(0, paidCents − totalAjustadoCents)`. Se `0`, não cria reembolso.

## Critérios de aceite
- **Captura de gramas:** sessão de separação exige `weightGramsPicked > 0` ao marcar item de peso como `picked` (validação já parcial em `picking-session.service.ts` — garantir).
- **Cálculo de cobrança (`recalcTotals`):** para item de peso `picked`, usar `min(weightGramsPicked, weightGrams)` no `computeItemTotal` (hoje usa o valor real cheio, cobrando a mais em over-delivery — corrigir). Over-delivery mantém valor original.
- **Schema:** novo `model Refund` (order-level): `orderId`, `amountCents`, `status` (`pending | processed | failed`), `provider`, `providerRefundId?`, `reason`, `createdAt`, `processedAt?`. Breakdown por grupo para contábil: `RefundComponent` (`refundId`, `orderGroupId`, `amountCents`, `reason: weight_shortfall | refused`) **ou** campo agregável equivalente. 1 `Refund` por `Order` (unique enquanto ativo).
- **PaymentProvider:** adicionar `refund(input: { chargeId, amountCents, reason })` à interface; implementar em `mock` (marca processado) e `pagarme` (estorno PIX). `PaymentStatus.refunded` já existe — usar para estorno total; estorno parcial mantém `paid` + registro em `Refund`.
- **Orquestração:** ao último grupo do pedido concluir separação, calcular faltas agregadas, criar `Refund` e chamar `provider.refund`. Idempotente (não duplicar reembolso).
- **Tipos (`packages/types`):** expor `RefundDTO` (valor, status, componentes) para cliente/admin.
- **Cliente:** pedido reflete total ajustado e mostra reembolso (valor + motivo). *(UI mínima; detalhar em fase de polish se preciso)*
- Testes: pricing de `min(picked, requested)`; agregação multi-grupo; idempotência; caso sem falta (refund=0, nada criado).

## Escopo / Fora de escopo
- **Inclui:** validação de gramas, ajuste de `recalcTotals`, entidade Refund, método refund no provider (mock+pagarme), orquestração do estorno único, tipos, reflexo no app cliente.
- **Fora:** gorjeta/avaliação; reembolso por cancelamento total de pedido (fluxo separado); UI rica de reembolso (polish).

## Notas técnicas
- Preço de peso: `lineTotalCents = round(unitPriceCents * grams / 1000)` (`pricing.ts`). Falta de peso usa a mesma fórmula com `(requested − picked)`.
- `recalcTotals` já recompõe `Order.itemsCents/totalCents`; estorno parte de `Payment.amountCents` (valor pago) vs total ajustado, não do recalc isolado por grupo.
- Estorno PIX real depende do gateway suportar refund parcial (Pagar.me). Mock sempre sucesso.
- Reembolso só faz sentido se `Payment.status = paid`. Pedido não pago não estorna.
