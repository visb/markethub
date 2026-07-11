# Plan: cupons — gestão no admin (globais) e no merchant (da rede)

## Context

O model `Coupon` está completo (`type` fixed/percent, `value`, `merchantId` null = global,
`minOrderCents`, `validFrom/validTo`, `maxUses`/`usedCount`, `active`) e a aplicação no carrinho
funciona (`POST/DELETE cart/coupon`, `loadValidCoupon`, `INVALID_COUPON`). **Mas não existe
nenhuma UI nem endpoint para criar/gerenciar cupom** — hoje só via seed/SQL.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- **Dois donos:** admin gerencia cupons **globais** (`merchantId` null); merchant gerencia
  cupons **da própria rede**. Cupom é da rede (merchant), não da loja — no merchant, gestão
  fica no nível owner/administrador (capability nova `coupons.manage`, fora do alcance de
  gerente de loja).
- **Código imutável** após criação (evita quebrar cupom divulgado); demais campos editáveis.
- **Cupom com uso (`usedCount > 0`) não deleta — desativa** (`active = false`). Sem uso pode
  deletar.

## Desenho

### Backend

1. Módulo `merchant`: `GET/POST/PATCH/DELETE merchant/coupons` — escopo automático
   `merchantId` da rede do ator; capability `coupons.manage` (conceder a owner/administrador
   na matriz de capabilities existente). Validações: `code` único (409 `COUPON_CODE_TAKEN`),
   percent 1–100, fixed > 0, `validFrom < validTo`, `maxUses ≥ usedCount`. DELETE com uso →
   400 `COUPON_IN_USE` (UI oferece desativar).
2. Módulo `admin`: `GET/POST/PATCH/DELETE admin/coupons` — mesmos DTOs/regras; admin vê
   **todos** (globais + por merchant, filtro `merchantId`), cria globais.
3. Service compartilhado dentro de cada módulo (sem cross-context de internals); regra comum
   pode viver no próprio marketplace (dono do model) exposta via barrel, se o lint pedir.

### `packages/types`

4. `CouponDTO` + payloads de create/update, re-exportados pelo api-client (backend não importa
   o package — manter os dois lados em sincronia).

### Merchant app

5. Página `Coupons` (rota `/coupons`, atrás de `RequireCapability capability="coupons.manage"`):
   tabela (código, tipo/valor, validade, usos/limite, ativo) + form criar/editar
   (react-hook-form + zod) + toggle ativo + deletar (confirm; usado → só desativa).

### Admin app

6. Página `Coupons` (rota `/coupons`, `AdminOnly`): mesma tabela com coluna merchant + filtro
   global/por rede; criar cupom global.

## Validação

- Backend: specs dos dois CRUDs — escopo por merchant (não vê/edita cupom alheio), capability,
  validações (código duplicado, percent fora de faixa, janela invertida), delete vs desativa
  com uso. `pnpm --filter @markethub/api test`.
- Merchant/admin: testes das páginas (listagem, criação com erro de validação, toggle,
  confirmação de delete) via testing-library, padrão das páginas vizinhas.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` da api +
  merchant + admin ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Mudar regras de aplicação no carrinho (já existem e ficam como estão).
- Rateio financeiro do desconto (quem absorve: plataforma vs merchant) — hoje desconta do
  total; modelagem de repasse fica p/ story de finanças.
- Cupom por loja (só global e por rede).
- Cupom por usuário/primeira compra, código em lote, relatório de conversão.
