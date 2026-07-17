# Plan: merchant — remover Placeholder.tsx morto

## Context

`apps/merchant/src/pages/Placeholder.tsx` é resquício do scaffold das stories 09–13 ("Em
construção — story NN"). Nenhuma rota o referencia — todas as páginas do merchant são reais.
Código morto que só confunde grep e cobertura.

Decisão (planning 2026-07-11): mini-story de housekeeping; o item "confirmar baseline verde"
do backlog foi dropado sem story — é o passo 0 operacional de qualquer rodada do autorun, não
unidade de trabalho.

## Desenho

1. Deletar `apps/merchant/src/pages/Placeholder.tsx`.
2. Conferir (grep) que nenhum import/teste o referencia; se algum teste morto existir junto,
   deletar também.

## Validação

- `pnpm --filter @markethub/merchant test` + `test:coverage` ≥ piso (delete não derruba
  cobertura — arquivo sem teste próprio sai do denominador).
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Qualquer outra limpeza no app merchant.
