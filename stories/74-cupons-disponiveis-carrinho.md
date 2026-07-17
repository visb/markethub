# Plan: Cupons disponíveis no carrinho (seleção)

## Context

Hoje o cliente só aplica cupom digitando o código (`POST /cart/coupon`). Ele não tem como
descobrir quais cupons existem — a story quer listar os cupons disponíveis no carrinho para o
usuário escolher e aplicar com um toque.

**Depende da story 73** (`title`/`description` no cupom) — o card do cupom exibe
`title ?? code` + `description`.

Decisões travadas (refinadas no planning):

- **Elegibilidade: aplicáveis + "quase-lá".** O endpoint retorna cupons aplicáveis ao carrinho
  atual **e** os que falham apenas por `minOrderCents`, marcados como não aplicáveis com motivo
  (ex.: "faltam R$ X"). Cupons expirados, inativos, esgotados (`maxUses`) ou de merchant fora do
  carrinho **não** aparecem.
- **Input manual de código permanece** — cupons de campanha podem não estar listados.
- **Lista inline no carrinho** (não modal): renderizada na tela do carrinho, acima do resumo,
  junto do input de código existente.

## Desenho

### Backend (`services/api`)

- `GET /cart/coupons` novo em `marketplace/cart.controller.ts` (controller fino) +
  `cart.service.ts`: carrega cupons ativos/vigentes/global-ou-dos-merchants-do-carrinho com
  `usedCount < maxUses` (quando definido), avalia elegibilidade contra o carrinho atual
  reutilizando `shared/coupon-rules` (não duplicar regra) e retorna
  `AvailableCoupon[]`: cupom (com `title`/`description` da 73) + `applicable: boolean` +
  `reason` discriminável quando não aplicável (`MIN_ORDER_NOT_MET` + `missingCents`).
- Não alterar o fluxo de apply — selecionar cupom na lista chama o `POST /cart/coupon` existente.

### Contratos (`packages/types`)

- Tipo `AvailableCoupon` (contrato da resposta) — backend não importa `packages/types`;
  manter os dois lados em sincronia.

### App customer

- `src/api/marketplace.ts`: método `availableCoupons()` tipado.
- Hook novo em `src/api/hooks` (React Query, key em `queryKeys`): `useAvailableCoupons`, com
  invalidação junto das mutações do carrinho (mudar itens muda elegibilidade) e de
  apply/remove coupon.
- `app/cart.tsx` orquestra componente novo (lista inline): card por cupom com `title ?? code`,
  `description`, valor do desconto; aplicável → tap aplica (mutação existente); não aplicável →
  desabilitado com motivo "faltam R$ X". Cupom aplicado destacado, com ação de remover.
  Sem fetch na tela — tudo via hook.

## Validação

- `pnpm --filter @markethub/api test:coverage` — casos: cupom global e do merchant do carrinho
  listados; merchant fora do carrinho excluído; expirado/inativo/esgotado excluídos; abaixo do
  `minOrderCents` vem com `applicable: false` + `missingCents` correto; carrinho vazio.
- `pnpm --filter @markethub/customer test:coverage` — lista renderiza aplicável vs desabilitado
  com motivo; tap aplica cupom (mutação chamada); estado aplicado com remover; fallback
  `title` null → `code`.
- `pnpm typecheck` + `pnpm build`.
- **Gate:** código novo sem teste não fecha a story (diff ≥ 90%); sem `skip`/`only` injustificado.

## Fora de escopo

- Limite de uso por usuário (schema só tem `maxUses` global).
- Push/notificação de cupom novo.
- Tela de cupons fora do carrinho (perfil/loja).
