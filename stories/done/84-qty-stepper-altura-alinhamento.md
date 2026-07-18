# Plan: QtyStepper — altura igual ao botão e alinhamento correto

## Context

Bloco "Input quantity" do BACKLOG (2 itens fundidos em 1 story — decisão do planning
2026-07-18, mesmos estilos do mesmo componente).

Problemas no `QtyStepper` (`apps/customer/src/components/QtyStepper.tsx`), usado no
`ProductCard` no lugar do botão COMPRAR quando o item está no carrinho:

1. **Altura:** stepper tem 38px; `Button size="sm"` tem 40px
   (`packages/ui/src/components/Button.tsx:65`). O card "pula" 2px ao trocar
   COMPRAR ↔ stepper. Além disso os glifos "−"/"+" (`Text` fontSize 20) assentam baixos na
   linha — impressão de ícone caído. Sugestão do usuário: compensar com padding bottom nos
   botões.
2. **Alinhamento:** layout atual `[btn 34][valor minWidth 44][btn 34]` = 112px encostado à
   esquerda numa caixa que estica a 158px (largura do card). Esperado: valor centralizado
   ocupando o meio, botões "−"/"+" nas extremidades e **quadrados perfeitos**.

Decisões travadas:

- Uma story só (itens 4+5 do backlog).
- Altura alvo = **40px** (paridade com `Button sm`), não mudar o Button.
- Botões 40×40 (quadrados = altura da caixa), valor com `flex: 1` centralizado.
- Correção visual dos glifos via padding bottom nos botões (proposta do usuário) — ajustar o
  valor fino na implementação até o glifo ficar oticamente centrado.

## Desenho

`apps/customer/src/components/QtyStepper.tsx` (frontend-only, um componente):

- `box`: `height: 40`; mantém borda/raio; garante largura total do card (já estica).
- `btn`: `width: 40, height: 40`, conteúdo centralizado + `paddingBottom` fino para centrar
  oticamente o glifo.
- `value`: `flex: 1` (substitui `minWidth`), centralizado; mantém separadores verticais
  (borderLeft/Right) que agora encostam nos botões das pontas.
- Nenhuma mudança de API do componente (`label`, `onDec`, `onInc`) — só estilo.
- Conferir os consumidores (`ProductCard`, telas que renderizam o stepper) — sem mudança
  esperada neles.

## Validação

- Frontend: `pnpm --filter @markethub/customer test` — casos (em
  `purchaseComponents.test.tsx` ou spec própria):
  - caixa do stepper com altura 40 (igual `Button sm`);
  - botões "−"/"+" 40×40 (quadrados);
  - valor com `flex: 1` (centralizado entre os botões);
  - regressão: `onDec`/`onInc` seguem disparando.
- Gates: `pnpm typecheck` + `pnpm build`.
- **Cobertura:** código novo sem teste não fecha a story — `pnpm --filter @markethub/customer
  test:coverage` verde (piso 80%, diff ≥ 90%); sem `skip`/`only` injustificado.

## Fora de escopo

- Mudar `Button` do `packages/ui` (referência de altura, não alvo).
- Steppers/inputs de quantidade de outras telas ou apps que não usem `QtyStepper`.
- Promover `QtyStepper` para `packages/ui` (segue específico do customer).
