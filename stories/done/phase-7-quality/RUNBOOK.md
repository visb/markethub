Você é o driver de um run de qualidade autônomo no monorepo MarketHub. Esta é uma sessão
headless nova e isolada. Todo o estado durável está em git + em
stories/phase-7-quality/PROGRESS.md. Faça UMA unidade de trabalho e encerre. Não tente fazer
mais de uma. Outro disparo agendado continuará de onde você parar.

## 0. Setup da sessão
1. Confirme a branch: deve estar em `quality/autonomous-sweep`. Se não, `git switch quality/autonomous-sweep` (criar de `main` só se não existir). NUNCA trabalhe na `main`.
2. `git status` deve estar limpo. Se houver mudança não commitada de um run anterior morto, avalie: se for de uma unidade completa e válida, commite-a (e marque a unidade no ledger); se for lixo parcial, `git restore`/`git clean` e deixe a unidade como `todo`.

## 1. Escolher a unidade
Leia stories/phase-7-quality/PROGRESS.md. Pegue a PRIMEIRA linha com status `in_progress`
(interrompida) ou, se não houver, o menor id com status `todo` cuja dependência esteja
satisfeita (Grupo A antes de qualquer `C-*`; A1→A5 em ordem; `B-*` livre). Marque-a
`in_progress` e incremente `tent` (tentativas). Salve o PROGRESS.md já com esse estado.

Se NÃO houver nenhuma unidade `todo`/`in_progress`: o run acabou — pule pra seção 6.

## 2. Executar a unidade
Leia CLAUDE.md e BUSINESS_RULES.md antes de tocar código nessas áreas. Conforme o `tipo`:

- **infra (A1–A5):** monte a config de teste descrita no `escopo` (ver SR.2-test-coverage.md).
  Padrões do repo: jest no api (jest.config.js já existe), vitest no admin, jest-expo no
  mobile, Playwright contra build web. Banco de teste SEPARADO — nunca o de dev. Deixe pelo
  menos um teste smoke rodando verde pra provar que a infra funciona.
- **review (B*):** leia os arquivos da área. Aplique SÓ fixes de baixo risco (lista em
  SR.1-code-review-sweep.md). Achado que muda comportamento/contrato/schema → NÃO toque:
  adicione linha em stories/phase-7-quality/REVIEW-FINDINGS.md no formato
  `B-id · path:line · <sev crit|high|med|low> · problema · fix sugerido`.
- **unit / e2e / e2e-web (C*):** escreva specs cobrindo os caminhos críticos do `escopo`
  (ver estratégia em SR.2). Reuse hooks/módulos existentes; siga padrões dos specs que já
  existem em services/api/src/**/*.spec.ts.

Mantenha a unidade pequena. Não refatore fora do escopo. Não invente script — confira o
package.json. Não edite migration aplicada (nova sempre). Não relaxe flag TS global.

## 3. Validar (só o afetado)
- Tocou schema Prisma → `pnpm --filter @markethub/api prisma:generate` antes do typecheck.
- `pnpm --filter <pkg> typecheck`.
- Teste alvo: `pnpm --filter <pkg> test` (api e2e: o script jest-e2e que A1 criar).
- Tocou tipo cross-package (packages/*) → `pnpm --filter <consumidores> build`.
Tudo verde para prosseguir. Vermelho → seção 5.

## 4. Commitar + marcar done
- Commit Conventional Commit pt-BR, escopo = id da unidade:
  `test(C05): pricing + coupons no marketplace`, `refactor(B20): query keys centralizadas no admin`,
  `chore(A1): harness e2e do api (jest-e2e + supertest)`.
  Rodapé: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- NUNCA `git push`. Só commit local.
- Atualize PROGRESS.md: status `done`, preencha `commit` (hash curto) e `nota` (1 linha).
- Commite também a atualização do ledger/findings (pode ser no mesmo commit da unidade).
- Encerre a sessão. Fim.

## 5. Falha
Se não conseguir deixar verde: se `tent` < 3, deixe a unidade como `todo` (será retentada no
próximo disparo) e encerre, OU tente mais uma abordagem dentro desta sessão se for rápido. Se
`tent` >= 3, marque `blocked` com motivo curto na `nota`, faça `git restore`/`git clean` das
mudanças parciais (não commite código quebrado), commite só a atualização do ledger, encerre.

## 6. Encerramento do run
Se não havia unidade pendente: escreva stories/phase-7-quality/FINAL-REPORT.md com — total
done/blocked, lista de `blocked` com motivo, ponteiro pro REVIEW-FINDINGS.md, e o lembrete
`schtasks /delete /tn markethub-sweep /f`. Commite. Encerre. Não reabra trabalho.

## Invariantes (sempre)
Branch quality/autonomous-sweep · um commit por unidade · sem push · sem editar migration
aplicada · boundaries apps/services/packages · só uma unidade por sessão.
