---
name: issue
description: Cria e conduz uma story do início ao fim no monorepo MarketHub — escreve o plano em stories/phase-*/, desenvolve numa branch nova, valida, marca como done e pergunta se deve mergear na main. Stories grandes podem ser quebradas em múltiplas sub-stories dentro de uma subpasta. Use quando o usuário invocar /issue ou pedir para abrir/criar uma nova story/issue/tarefa de desenvolvimento.
---

# /issue — ciclo de vida de uma story

Skill invocável via `/issue`. Conduz uma unidade de trabalho do plano ao merge.
Aceita título/descrição como argumento (`/issue corrigir filtro de catálogo`) ou nada
(então levantar o escopo com o usuário).

**Sem Pull Requests.** Fluxo: branch local → merge direto na main, sob confirmação.
Nunca abrir PR, nunca push automático.

## Convenções do repo (respeitar)

- Stories ficam em `stories/phase-N-<slug>/SX.Y-<slug>.md`. Numeração **por fase**: `S<fase>.<seq>`
  (ex.: `S6.7`). Roadmap geral em `stories/ROADMAP.md`.
- **Não há `stories/done/`.** Conclusão = editar o cabeçalho `- **Status:** done` no próprio arquivo
  e marcar os critérios de aceite (`- [x]`).
- Formato (seguir as existentes, ex.: `stories/phase-6-customer-refinement/*.md`):
  ```
  # SX.Y Título
  - **Fase:** N
  - **Epic:** <epic>
  - **Status:** todo | in progress | done
  - **Depende de:** — | SX.Z

  ## Objetivo
  ## User story
  ## Critérios de aceite      (checklist - [ ])
  ## Escopo / Fora de escopo
  ## Notas técnicas
  ```
- Commits: Conventional Commits em pt-BR com escopo de story — `feat(S6.7): ...`, `fix(S6.7): ...`,
  `docs(S6.7): ...`. Assunto curto, imperativo.
- Co-author: `Claude Opus 4.8 <noreply@anthropic.com>` (ou o modelo corrente).

## Fluxo

### 1. Levantar o escopo

- Se `/issue` veio com texto, usar como ponto de partida; senão perguntar o problema/feature.
- Só perguntar o que muda o resultado (escopo ambíguo, decisão de produto, trade-off). Preencher
  defaults óbvios e seguir.
- Capturar o **porquê** e as **decisões travadas** — é o que o git diff não guarda.
- Regra de domínio envolvida (status, cancelamento, reembolso, picking, delivery, lockedFields)?
  Cruzar com `BUSINESS_RULES.md` antes de escrever o plano.

### 2. Descobrir fase e número

- Decidir a **fase**: normalmente a fase aberta mais recente (`stories/phase-*` de maior N) ou a que
  o usuário indicar. Feature de natureza nova pode pedir fase nova (`phase-(N+1)-<slug>`) — confirmar.
- Varrer os `SX.Y-*.md` da fase alvo; próximo `seq` = maior `.Y` daquela fase + 1.
- Slug kebab-case curto e descritivo.

### 3. Avaliar tamanho — story única ou dividida

Decidir se cabe numa story só ou se deve **quebrar em sub-stories** (ver "Stories grandes" abaixo).
Sinais de que deve dividir:
- Critérios de aceite cobrem áreas independentes (ex.: schema+backend **e** 2 apps **e** admin) que
  validam e mergeiam separado.
- Entregáveis sequenciais com dependência clara entre si (S deve vir antes de T).
- O conjunto não fecha num diff coeso / não dá pra validar de uma vez.

Na dúvida, **perguntar ao usuário** se prefere uma story grande ou dividida (em modo autônomo, decidir
pela divisão quando os sinais acima baterem e registrar a decisão no `_index.md`).

### 4. Escrever a story (caso única)

- Criar `stories/phase-N-<slug>/SX.Y-<slug>.md` no formato acima.
- Conteúdo mínimo: **Objetivo**, **Critérios de aceite** (checklist), **Escopo/Fora de escopo**,
  **Notas técnicas** (validação: quais builds/testes; migrations; decisões).
- Mostrar o plano e confirmar antes de codar. Em modo autônomo, travar as decisões na story e seguir.

### 5. Branch nova — SEMPRE

- Toda story numa branch nova. Nunca codar direto na main.
```
git switch main
git switch -c <type>/<slug>      # feat/ fix/ chore/ docs/ — casa o commit
```
- Commitar a story (o `.md`) primeiro: `docs(SX.Y): plano da story — <título>`.

### 6. Implementar

- Seguir a story à risca. Consultar as skills `markethub-backend`/`-frontend`/`-workflow`/`-project-map`
  para padrões e localização.
- Reusar antes de criar (hook/módulo de API/componente) — checklist do `CLAUDE.md`.
- Schema mudou → `prisma:migrate` (nova migration, nunca editar aplicada) + `prisma:generate`.
- Contrato de API mudou → atualizar `packages/types` **e** o backend (sem dep compartilhada).

### 7. Validar

- Rodar a validação por tipo de mudança da tabela em `markethub-workflow` conforme a área tocada.
- Backend: `pnpm --filter @markethub/api typecheck` + `build` + `test`. Admin: `pnpm --filter @markethub/admin build`.
  Mobile: `tsc --noEmit` do app. Cross-cutting: `pnpm typecheck && pnpm build` na raiz.
- Sem `skip`/`only`/`xfail` sem justificativa no código. Corrigir até verde.

### 8. Commitar a implementação

- `git add` só dos arquivos da story (+ migration/testes). `git commit` na convenção. Commits coesos.

### 9. Marcar como done

- Editar o `.md`: `- **Status:** done` e `- [x]` nos critérios atendidos.
- Commit: `docs(SX.Y): conclui story — <título>`.

### 10. Perguntar sobre merge na main

Verde e concluída, **perguntar** (não decidir sozinho):

> Story SX.Y pronta na branch `<branch>`, validação verde. Mergear na main agora?

- **Sim** →
```
git switch main
git merge --no-ff <branch> -m "merge: story SX.Y — <título>"
```
  Não deletar a branch sem pedido. Não push automático.
- **Não / depois** → deixar na branch, informar o nome para o usuário mergear quando quiser.

## Stories grandes — dividir em subpasta

Quando a story é grande demais para um diff coeso, vira **guarda-chuva** com sub-stories:

```
stories/phase-N-<slug>/
  SX.Y-<slug>/              ← subpasta (mesmo código SX.Y do guarda-chuva)
    _index.md              ← guarda-chuva: objetivo macro, decisões, ordem das sub-stories + deps
    SX.Y.1-<slug>.md       ← sub-story 1
    SX.Y.2-<slug>.md       ← sub-story 2
    ...
```

- **`_index.md`**: cabeçalho de story normal (`# SX.Y Título`, `Status`), seção **Objetivo** macro,
  **Decisões travadas**, e uma **lista ordenada das sub-stories** com `Depende de` entre elas e o
  estado de cada uma (checkbox). É o mapa do épico.
- **Cada sub-story** (`SX.Y.K-*.md`): story completa no formato padrão (Objetivo, Critérios,
  Escopo, Notas técnicas), com `- **Depende de:** SX.Y.(K-1)` quando sequencial.
- **Numeração das sub-stories**: `SX.Y.1`, `SX.Y.2`, … na ordem de execução.

### Fluxo do guarda-chuva

1. Escrever `_index.md` + todas as sub-stories; confirmar o plano com o usuário.
2. Commitar o plano numa branch: `docs(SX.Y): plano do épico — <título>` (pode ser branch própria
   ou a primeira branch de sub-story).
3. Para **cada** sub-story, rodar o ciclo normal (passos 5–10): branch própria
   (`<type>/<slug-da-sub>`), implementar, validar, marcar a sub-story como done, perguntar merge.
   Respeitar a ordem de dependência do `_index.md`.
4. Ao concluir uma sub-story, marcar seu item no `_index.md` (`- [x] SX.Y.1 …`).
5. Guarda-chuva vira `Status: done` só quando **todas** as sub-stories estão done — commit
   `docs(SX.Y): conclui épico — <título>`.

> Cada sub-story é independente para branch/validação/merge. Não acumular tudo numa branch só —
> o ganho da divisão é poder validar e mergear em pedaços.

## Modo autônomo

Se o usuário pedir execução sem supervisão (várias issues em fila), travar as decisões dentro de cada
story/`_index.md` e seguir. Sub-agente por story quando útil; `ScheduleWakeup` como fallback de
continuidade. Mesmo autônomo, **não mergear na main sem confirmação** — a menos que o usuário tenha
autorizado o merge explicitamente de antemão.

## Proibido

- Abrir PR (não faz parte do workflow).
- Codar na main.
- Push sem pedido explícito.
- Mergear na main sem confirmação.
- Editar migration já aplicada.
- Pular testes ou deletar trabalho não criado nesta story.
