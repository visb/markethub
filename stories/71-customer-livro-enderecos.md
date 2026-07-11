# Plan: customer — livro de endereços (tela dedicada)

## Context

O backend de endereços está completo (`GET/POST/PATCH/DELETE addresses` +
`POST :id/default` + validação de cobertura por cidade) e o `AddressForm` (com CEP) existe —
mas endereço só é tratado **inline** nos fluxos de delivery/checkout. Não há lugar p/ ver
todos, editar um antigo, remover ou trocar o padrão fora do meio de uma compra.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- Story **frontend-only** (customer); zero backend novo.
- Deletar endereço usado em pedidos passados é seguro (Order guarda `addressSnapshot`) —
  confirm simples basta.
- Deletar o padrão: backend segue como está; UI promove visualmente o próximo da lista se o
  backend já o fizer, senão só remove o badge (conferir comportamento e refletir, sem regra
  nova).

Complementa a story 70 (entrada "Endereços" na tela de conta).

## Desenho

### Customer app

1. Rota nova `addresses.tsx`: lista de cards (label, rua nº, cidade, badge "Padrão"),
   ações por card — editar, remover (confirm), "tornar padrão".
2. Rota/modal `address/[id].tsx` (e modo "novo") reusando o `AddressForm` existente —
   RHF+zod já embutidos no form; salvar volta pra lista.
3. Hooks em `src/api/hooks/useAddresses.ts` (query + mutations juntos, padrão do repo),
   query keys centralizadas; invalidação após cada mutation.
4. Entradas: item "Endereços" na conta (70) e link "gerenciar" no seletor de endereço do
   fluxo de delivery/checkout (seletor continua funcionando como hoje).
5. Estado vazio: CTA "cadastrar primeiro endereço".

## Validação

- Customer: lista renderiza com badge, criar/editar reusa form, remover pede confirm e some
  da lista, tornar padrão move o badge, estado vazio, invalidação (mock das mutations).
  `pnpm --filter @markethub/customer test`.
- **Gate de cobertura:** código novo sem teste não fecha a story —
  `pnpm --filter @markethub/customer test:coverage` ≥ piso (80 global / 90 diff), sem
  `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Qualquer mudança de backend.
- Endereço com apelido/ícone custom além do `label` atual.
- Compartilhar endereço entre contas.
- Validação de raio de entrega na tela (é do checkout — story 58).
