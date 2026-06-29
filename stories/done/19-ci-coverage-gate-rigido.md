# 19 Gate de cobertura rígido no CI

- **Fase:** infra/qualidade
- **Epic:** Qualidade & CI
- **Status:** todo
- **Depende de:** —

## Objetivo

Transformar cobertura de testes em **gate obrigatório e rígido** do CI: PR não mergeia se a
cobertura cair, se um arquivo novo/alterado vier mal coberto, ou se um workspace ficar abaixo do
piso definido. Rígido = sem escape por flag, sem média que dilui arquivo ruim, sem piso que só
desce.

## User story

Como time, quero que o CI **reprove** qualquer mudança que reduza cobertura ou introduza código
sem teste, para que a dívida de teste pare de crescer e os módulos críticos (payment, marketplace,
picking, auth) caminhem para a meta sem depender de disciplina manual.

## Critérios de aceite

1. **CI roda cobertura, não `pnpm test` cru.** Step passa a `pnpm test:coverage` (turbo). Job
   falha (exit ≠ 0) se qualquer threshold for violado.
2. **Threshold travado em config, não em flag CLI.** Cada workspace declara thresholds no próprio
   arquivo de config (`coverageThreshold` no jest, `test.coverage.thresholds` no vitest). Não pode
   depender de `--coverage.all` passado na linha de comando — o all-files vira config:
   - jest: `collectCoverageFrom` no config (glob `src/**/*.ts`, excluindo `*.spec.ts`, `*.module.ts`,
     `*.dto.ts`, `main.ts`, `*.processor.ts`, `*.scheduler.ts`).
   - vitest: `coverage.all: true` + `include` já existente.
3. **`perFile: true` (rígido).** Threshold aplica **por arquivo**, não só no agregado — um arquivo
   abaixo do piso reprova o build, mesmo que a média global passe. (jest: `coverageThreshold`
   com chave glob por arquivo / vitest: `coverage.thresholds.perFile: true`.)
4. **Ratchet que só sobe.** O piso de cada workspace é commitado e **nunca decresce**. Baseline
   inicial = cobertura medida hoje (ver tabela), arredondada pra baixo. Reduzir um número no
   config exige justificativa explícita no PR (não é o caminho normal). Subir é livre.
5. **Cobertura de diff alta pra código novo.** Linhas adicionadas/alteradas no PR devem ter
   **≥ 90%** de cobertura. Implementar via check de diff-coverage (ex.: comparar relatório
   `lcov` do PR vs base, ou ferramenta tipo `diff-cover`/equivalente JS). Reprova se o diff
   introduzir linha não coberta acima do limite.
6. **`--passWithNoTests` removido** dos workspaces que devem ter teste (backend hoje usa). Workspace
   sem nenhum teste é falha, não passe verde.
7. **Job de cobertura separado e obrigatório.** Novo job (ou step) `coverage` no `ci.yml`, marcado
   como required check na branch protection da `main` (documentar no story que precisa ativar no
   GitHub). Relatório (`lcov`/`text-summary`) publicado como artifact do run.
8. **Documentado.** `CLAUDE.md` (seção CI) e/ou `BUSINESS_RULES.md` registram os pisos vigentes e a
   regra "piso só sobe / diff ≥ 90%". Tabela de metas-alvo por workspace fica versionada.

## Escopo / Fora de escopo

**Dentro:**
- Editar configs de teste de todos os workspaces com `coverageThreshold`/`thresholds` + `perFile`.
- Baked-in `collectCoverageFrom` (jest) / `coverage.all` (vitest).
- Alterar `.github/workflows/ci.yml`: step/job de cobertura + artifact + diff-coverage.
- Script auxiliar de diff-coverage (se necessário) em `scripts/` ou `package.json` raiz.
- Documentar metas e ativação de required check.

**Fora:**
- **Escrever os testes** que faltam pra bater as metas-alvo (isso são as stories de backfill por
  módulo — payment, marketplace, picking, auth, catálogo etc.). Esta story só cria o **gate** e
  trava o baseline atual; as metas-alvo são o destino que as stories de backfill perseguem.
- Cobertura de e2e (Playwright) — gate é só unit/integration.

## Notas técnicas

### Baseline (medido hoje, all-files) e meta-alvo

Piso inicial do ratchet = baseline arredondado pra baixo. Meta-alvo = destino após backfill.
Gate começa travando o baseline; cada story de backfill sobe o piso.

| Workspace | Baseline linhas | Piso inicial | Meta-alvo | Branches alvo |
|---|---|---|---|---|
| services/api | 35.5% | 35% | **80%** | 70% |
| apps/merchant | 92.5% | 90% | **90%** (manter) | 80% |
| apps/admin | 48.5% | 48% | **70%** | 65% |
| apps/customer | 31.0% | 31% | **55%** | 50% |
| apps/picker | 63.8% | 63% | **70%** | 65% |
| apps/driver | 47.2% | 47% | **65%** | 60% |
| packages/api-client | 39.0% | 39% | **70%** | 65% |
| packages/types | 100% | 90% | **90%** | — |
| packages/ui | 100% | 40% | **50%** | — |

> `packages/types` e `ui` mostram 100% só porque o `include` pega um barrel mínimo. Ao ampliar o
> `include` pra cobrir o módulo real, recalibrar o baseline antes de travar o piso (senão trava
> 100% num escopo falso).

### Rígido sem travar o desenvolvimento

A combinação que dá rigor **sem** deixar `main` permanentemente vermelha:
- **Piso agregado = baseline atual** (não a meta). Garante que nada regride.
- **`perFile` + diff ≥ 90%** força todo código **novo** a vir bem coberto. A média sobe sozinha à
  medida que se mexe no repo.
- Backfill empurra o piso agregado até a meta, story a story.

Assim o gate é rígido (nada regride, código novo quase 100%) mas não exige reescrever 65% do
backend num único PR.

### CI

- Provavelmente vale um job `coverage` separado do `verify` (roda em paralelo) pra não inflar o
  caminho crítico; ou um step após `test`. Decidir na implementação.
- Postgres já está disponível no job `verify` (specs de backend tocam Prisma? conferir — a maioria
  é unit com mock, mas validar se o coverage run precisa do DB).
- `turbo run test:coverage` precisa que cada workspace tenha o script (já têm).

### Validação

- `pnpm typecheck` + `pnpm build`.
- Rodar `pnpm test:coverage` local e confirmar que: (a) passa no baseline, (b) baixar
  artificialmente um threshold reprova, (c) adicionar arquivo novo sem teste reprova via `perFile`.
