# Gate de cobertura — detalhe e racional

Regras vigentes resumidas no `CLAUDE.md` (seção CI). Este arquivo guarda o detalhe e o histórico
das decisões (stories 19, 35-43 e 44).

## Mecânica

`pnpm test:coverage` (turbo) roda a cobertura de todos os workspaces. Cada um declara o piso **no
próprio config** — jest `coverageThreshold.global` / vitest `coverage.thresholds` — com o all-files
cravado (jest `collectCoverageFrom`; vitest `coverage.include`, que no v4 já reporta todo arquivo do
include, testado ou não). Threshold violado = job `coverage` vermelho.

## Piso único (story 44)

**Mínimo de 80% linhas em TODOS os workspaces**, declarado no config de cada um (jest
`coverageThreshold.global.lines` / vitest `coverage.thresholds.lines`). As stories 35-43 levaram
cada workspace ao alvo; a 44 selou o piso. O número **só sobe** (ratchet) — vários workspaces já
estão acima de 80 (ex.: `api-client` 98, `merchant`/`admin` por outros eixos) e mantêm o piso mais
alto que tinham; **nunca baixar**. Branches/functions/statements ficam em um piso atingível abaixo
do medido (com folga p/ não flapar no CI), nunca acima do real.

Baixar um número no config exige justificativa explícita no PR; o caminho normal é subir conforme
o backfill cobre cada módulo. Sem `--passWithNoTests` em workspace que deve ter teste.

## Diff-coverage (eixo "código novo")

Em PR, `pnpm diff-coverage` (`scripts/diff-coverage.mjs`) exige **linhas novas/alteradas ≥ 90%**
cobertas — um arquivo novo sem teste reprova o PR mesmo que o agregado do workspace passe os 80%.

## `perFile: true` (vitest) — decisão por workspace

| Workspace | perFile | Motivo |
|---|---|---|
| packages/api-client | **on** | 100% em todos os eixos → todo arquivo passa o piso por arquivo. |
| packages/ui | **on** | 100% em todos os eixos; superfície pequena e estável. |
| packages/types | off | 85% agregado vem de linhas não cobertas concentradas em arquivo(s) que ficariam < 80 por arquivo. |
| apps/admin · apps/merchant | off | páginas/rotas/providers individuais < 80 por arquivo apesar do agregado alto; ligar deixaria a `main` vermelha. |
| services/api (jest) | off | controllers cobertos só por e2e + bootstrap (env/prisma/strategy/filter) em 0% por arquivo (story 43). |
| apps/customer · apps/picker · apps/driver (jest) | off | rotas/telas individuais < 80 por arquivo; jest usaria thresholds por glob, não ligados. |

Em todos os "off", o rigor por arquivo para **código novo** vem do gate de **diff ≥ 90%**. Conforme
o backfill eleva a cobertura mínima por arquivo de um workspace, `perFile` pode ser ligado nele.

## Pendência manual

**PENDENTE-MANUAL:** marcar o job `coverage` como **required check** na branch protection da `main`
(Settings → Branches) — precisa de acesso de admin ao repositório no GitHub.
