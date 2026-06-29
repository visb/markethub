# 36 Cobertura de testes — @markethub/ui

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura — frontend + libs
- **Status:** todo
- **Depende de:** 19

## Objetivo

Cobrir os componentes RN compartilhados (`Button`, `Screen`, `Text`, `tokens`) — hoje **30% linhas /
0% funcs/branches** (só o barrel é tocado). São reusados pelos apps mobile; variação não testada
quebra UI em vários lugares.

## User story

Como time, quero os componentes base cobertos, para que mudança de variante/estilo/estado disabled
não quebre os apps que os consomem.

## Critérios de aceite

- `packages/ui/src/components/Button.tsx` ≥ **50% linhas**: render do texto, variantes, `onPress`,
  estado `disabled` (não dispara), `loading` (se houver).
- `packages/ui/src/components/Text.tsx` e `Screen.tsx`: render + props de variante/estilo.
- `packages/ui/src/tokens.ts`: exporta a paleta/escala esperada (smoke).
- Recalibrar o piso do workspace pra ~50 (meta-alvo story 19) ao fechar — ratchet só sobe.

## Escopo / Fora de escopo

**Dentro:** specs (vitest + RNTL) dos 3 componentes + tokens. **Fora:** criar componentes novos ou
refatorar API dos existentes.

## Notas técnicas

Ambiente RN no vitest — usar o setup de teste já presente nos apps mobile como referência (ou
`react-test-renderer`). Ampliar o `include` do coverage pra cobrir o módulo real (não só o barrel),
recalibrando o baseline antes de travar o piso (nota da story 19).
