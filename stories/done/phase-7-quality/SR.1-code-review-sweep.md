# SR.1 Code Review Sweep (auto-fix seguro + relatório)
- **Fase:** 7
- **Epic:** Qualidade
- **Status:** todo
- **Depende de:** —

## Objetivo
Passada completa de review em todo o repositório, módulo a módulo, conferindo o código
contra `CLAUDE.md` e `BUSINESS_RULES.md`. Aplicar automaticamente os fixes de baixo risco;
documentar os achados arriscados para decisão humana — sem tocar no código deles.

## User story
Como mantenedor, quero o débito técnico do repo varrido e corrigido onde for seguro, com
um relatório claro do que exige minha decisão, para subir a qualidade sem regressão.

## O que é auto-fix (baixo risco — aplicar e commitar)
- Erros de lint / `eslint --fix`, imports não usados, dead code, variáveis órfãs.
- Erros e `any` de TypeScript onde o tipo correto é óbvio (sem relaxar flag global).
- Violação de padrões do `CLAUDE.md`:
  - query key string literal fora de `queryKeys.ts` → mover/centralizar.
  - `useQuery`/`useMutation`/`useForm`/`fetch`/`request` cru em tela/route → extrair p/ hook + módulo `src/api/`.
  - fetch com `useState`/`useEffect` → migrar p/ React Query.
  - campo de form com `useState` → migrar p/ react-hook-form + zod.
  - controller com regra de negócio → mover p/ service.
  - import relativo cruzando boundary app/service → ajustar p/ package.
- Inconsistência de `code` de erro (não-SCREAMING_SNAKE), shape `{ code, message }` ausente.
- Comentário morto/enganoso, console.log esquecido.

## O que NÃO auto-corrigir (registrar em REVIEW-FINDINGS.md)
- Qualquer mudança que altere comportamento observável: arredondamento de preço, regra de
  refund/cancelamento, transição de status, lógica de picking/delivery, cálculo de frete.
- Mudança de contrato de API (shape de resposta consumido pelos apps).
- Mudança de schema Prisma / migration.
- Refactor estrutural amplo (mover módulo, renomear entidade pública).
- Qualquer coisa sem teste cobrindo, onde o fix possa regredir silenciosamente.

→ Para cada um: linha em `REVIEW-FINDINGS.md` com `path:line · severidade · problema · fix sugerido`.

## Critérios de aceite
- [ ] Toda unidade `B-*` do `PROGRESS.md` revisada (api por módulo, admin, customer, picker,
      driver, packages).
- [ ] Fixes de baixo risco aplicados e commitados (um commit por unidade), com `typecheck` +
      `test` afetado verdes.
- [ ] `REVIEW-FINDINGS.md` preenchido com os achados arriscados, ordenados por severidade.
- [ ] Nenhuma migration aplicada editada; nenhum push.

## Escopo / Fora de escopo
- Fora: aplicar os achados arriscados (é decisão sua, pós-run); reescrever arquitetura;
      otimização de performance que mude comportamento.

## Notas técnicas
- Comando base por workspace: `pnpm --filter <pkg> lint` + `typecheck`. `eslint --fix` quando seguro.
- Severidade em REVIEW-FINDINGS: `crit` (bug/regra de negócio) · `high` · `med` · `low`.
