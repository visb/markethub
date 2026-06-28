# 20 Cobertura de testes — payment

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura
- **Status:** todo
- **Depende de:** 19

## Objetivo

Cobrir o módulo `payment` — reembolso e provedores de pagamento — que hoje está quase sem teste,
apesar de mexer com dinheiro real.

## User story

Como time, quero o fluxo de reembolso e a integração de cobrança cobertos por teste, para que um
bug não devolva valor errado ao cliente nem cobre a mais.

## Critérios de aceite

- `payment/refund.service.ts` (hoje **10.6%**) coberto ≥ meta-alvo do workspace (80% linhas).
- `payment/providers/pagarme.payment-provider.ts` (**0%**) e `mock.payment-provider.ts` (**0%**)
  cobertos — provider atrás de interface, testar com mock de HTTP/SDK.
- Casos: reembolso total, parcial, idempotência, falha do provedor, valor já reembolsado, PIX
  criado/confirmado/falho via webhook.
- Erros no shape `{ code, message }` validados (ex.: `REFUND_ALREADY_DONE`).

## Escopo / Fora de escopo

**Dentro:** specs de `refund.service`, providers pagarme+mock. **Fora:** mudar lógica de negócio
(só testar; bug encontrado vira fix à parte).

## Notas técnicas

`refund.pricing.spec.ts` já cobre o cálculo; falta o **service** orquestrando. Mock do
`PaymentProvider` já existe — reusar padrão de `payment.service.spec.ts`.
