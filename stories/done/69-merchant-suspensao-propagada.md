# Plan: admin — suspensão de merchant propagada de ponta a ponta

## Context

O toggle existe (`PATCH admin/merchants/:id/active`, botão no MerchantDetail, badge na lista,
`listMerchants` da vitrine filtra `active`) — mas a suspensão **não propaga**:

- `listStores`/detalhe de loja/ofertas não checam `merchant.active` — loja de rede suspensa
  continua comprável navegando direto.
- **Checkout não valida** — pedido novo em rede suspensa passa.
- Painel merchant: staff de rede suspensa **continua operando** normalmente (context não
  checa).

Não há self-signup de merchant (admin cria a rede), então "aprovação de onboarding" não se
aplica — o ciclo de vida é ativo ⇄ suspenso, e o que falta é consistência.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- Pedidos **em andamento continuam** até concluir (picking/entrega seguem; suspensão bloqueia
  só pedido novo). Sem cancelamento automático.
- Painel merchant de rede suspensa: staff loga mas cai em tela bloqueante "rede suspensa —
  contate a plataforma" (read-nothing); staff de loja nos apps picker/driver segue operando
  os pedidos em voo.
- Sem campo de motivo no schema (boolean como está); confirm no admin lista os efeitos.

## Desenho

### Backend

1. `catalog`: todas as superfícies de vitrine passam a exigir `merchant.active` — listStores,
   detalhe de loja, stores-nearby/viewport, ofertas/busca por loja (where único/central se
   possível). Loja de rede suspensa → `MERCHANT_SUSPENDED`/omitida das listas.
2. `marketplace` (checkout): grupo cuja loja pertence a rede suspensa →
   `{ code: "MERCHANT_SUSPENDED" }`. Carrinho existente com itens da rede: aviso no view do
   carrinho (flag por grupo) p/ o app exibir.
3. `merchant` (context): rede suspensa → context devolve `merchantSuspended: true` (ou 403
   code `MERCHANT_SUSPENDED` nas rotas de escrita) — leitura mínima p/ montar a tela
   bloqueante.
4. Fluxos de picking/driver **não** ganham checagem (pedidos em voo seguem — decisão acima).

### Admin app

5. MerchantDetail: confirm ao suspender listando efeitos ("sai da vitrine, novos pedidos
   bloqueados, painel do lojista bloqueado; pedidos em andamento seguem"). Badge/estado já
   existem.

### Merchant app

6. Tela bloqueante quando context indica suspensão (substitui o layout; só logout disponível).

### Customer app

7. Tratar `MERCHANT_SUSPENDED` no checkout (mensagem + remover itens do grupo) e flag de aviso
   no carrinho.

## Validação

- Backend: specs — vitrine omite/nega rede suspensa em cada superfície, checkout bloqueia,
  carrinho sinaliza, context sinaliza, picking/driver de pedido em voo NÃO bloqueiam.
  `pnpm --filter @markethub/api test`.
- Admin: confirm de suspensão. Merchant: tela bloqueante renderiza no flag. Customer: erro de
  checkout tratado.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  admin + merchant + customer ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Self-signup/aprovação de merchant novo.
- Motivo/histórico de suspensão no schema.
- Cancelamento automático dos pedidos em andamento ao suspender.
- Suspensão de **loja** individual (Store.active já existe e é filtrada).
