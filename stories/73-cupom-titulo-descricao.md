# Plan: Cupons — título e descrição

## Context

Hoje o cupom só tem `code` técnico (ex.: `BEMVINDO10`). Para o cliente entender o benefício —
e para a listagem de cupons disponíveis no carrinho (story 74, que **depende desta**) — o cupom
precisa de um nome legível e uma descrição curta.

Decisões travadas (refinadas no planning):

- **`title` obrigatório para cupons novos, legado com fallback.** Coluna `title` **nullable** no
  banco (cupons existentes ficam sem título); forms de criação/edição (admin e merchant) exigem
  título; toda exibição usa `title ?? code` como fallback.
- **`description` opcional, texto livre curto.** Textarea opcional no form; exibida nas listas
  admin/merchant e no card do cupom no carrinho (a exibição no customer fica na story 74).
- Exibição no app customer fica **fora desta story** (story 74 consome os campos novos).

## Desenho

### Backend (`services/api`)

- Migration nova (nunca editar existente): `coupons` ganha `title TEXT NULL` e
  `description TEXT NULL`. `pnpm --filter @markethub/api prisma:generate` após o schema.
- `admin/admin-coupons` e `merchant/merchant-coupons`: DTOs de create/update ganham
  `title` (create: obrigatório `@IsString() @IsNotEmpty()`; update: `@IsOptional()`) e
  `description` (`@IsOptional() @IsString()`). Services persistem e retornam os campos novos.
- Endpoints de leitura que serializam cupom (admin, merchant e o apply/validação do carrinho em
  `marketplace/cart`) passam a incluir `title` e `description` na resposta.

### Contratos (`packages/types`)

- Tipo `Coupon` (contrato consumido pelos apps) ganha `title: string | null` e
  `description: string | null`. Backend não importa `packages/types` — atualizar os dois lados.

### Frontends (admin + merchant)

- `CouponForm` (ambos): campo `title` (obrigatório, zod `min(1)`) e `description`
  (opcional, textarea). react-hook-form + zod, padrão já existente do form.
- `Coupons.tsx` (listas, ambos): exibir `title ?? code` como principal; `code` vira secundário;
  `description` quando presente.
- Módulos `src/api/coupons.ts` (ambos): tipos de payload/resposta atualizados.

## Validação

- `pnpm --filter @markethub/api test:coverage` — casos: create exige `title`; update parcial não
  apaga `title`/`description` ausentes (`undefined` ≠ `null`); leitura retorna campos novos;
  cupom legado (title null) segue aplicável no carrinho.
- `pnpm --filter @markethub/admin test:coverage` e `pnpm --filter @markethub/merchant
  test:coverage` — CouponForm valida título obrigatório; lista renderiza fallback `code` quando
  title null.
- `pnpm typecheck` + `pnpm build`.
- **Gate:** código novo sem teste não fecha a story (diff ≥ 90%); sem `skip`/`only` injustificado.

## Fora de escopo

- Exibição dos campos no app customer (carrinho/checkout) — story 74.
- Backfill de título para cupons legados.
- Qualquer mudança nas regras de aplicação/validação do cupom (`shared/coupon-rules`).
