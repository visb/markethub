# AUTORUN — protocolo de execução autônoma de stories

Protocolo **estável e round-agnóstico** para **implementar, testar e commitar** um lote de
stories/unidades **sem intervenção humana**. As decisões já estão travadas em cada plano
(`stories/NN-*.md`, seção "Decisões travadas") — **não perguntar nada ao usuário** durante a execução.

> **Este arquivo não muda entre rodadas.** O que muda (quais stories, ordem, dependências, cuidados)
> vive no **ledger da rodada** (ver "Config da rodada"). Como uma unidade é implementada (codificar +
> gates + commit) é responsabilidade do agent **`markethub-implementer`** — este protocolo só
> **orquestra**: escolhe a próxima unidade, dispara o agent, mergeia na main e atualiza o ledger.

Forma de iniciar: skill **`/autorun`** (encapsula o loop) — ver `.claude/skills/autorun`. O texto
abaixo é o protocolo que a skill executa; pode também ser colado num `/loop` manualmente.

---

## Config da rodada (NÃO fica aqui — fica no ledger)

Cada rodada tem um **ledger** próprio: `stories/PROGRESS.md` (ou um arquivo dedicado da rodada). O
**topo do ledger** declara a config — preencher ao abrir a rodada:

```md
# PROGRESS — rodada AUTORUN (<tema>)
Ordem: NN → NN → …   |   Branch base: main   |   Merge na main por unidade: sim
Deps rígidas: <A→B (se A bloquear, B bloqueia, não pular)>  ·  cadeias independentes: <…>
Cuidados da rodada: <migrations, contratos packages/*, apps em padrão legado, RBAC, etc.>

| #  | Título | Dep | Status |   ← todo · in_progress · done · blocked
```

Fonte de verdade para retomar (após resumo de contexto / reinício / reset de limite): **git log + o
ledger**. Unidade com commit `feat(story-NN)` (ou hash no ledger) = feita; pular.

---

## Princípios

- **Um spawn por unidade, contexto limpo:** para cada story, disparar o agent
  `markethub-implementer` (tool `Agent`). O orquestrador **não** codifica no próprio contexto — só
  coordena, sobe serviços, dispara um agent por vez, mergeia e registra.
- **Merge na main por unidade (padrão), sem push, sem PR:** cada unidade, ao ficar verde, é mergeada
  na `main` local antes da próxima. Branches preservadas.
- **Teste-antes-do-merge (DoD):** antes de **qualquer** merge — suíte da área tocada **toda verde**
  (casos novos **e** sem regressão). Vermelho = não mergeia; devolve ao agent pra corrigir. "Unidade
  concluída" = implementada **E** verde. (O `markethub-implementer` já roda os gates; o orquestrador
  pode reconfirmar via `markethub-validator` antes do merge.)
- **Não travar a fila:** unidade bloqueada (dep externa etc.) → registrar `blocked` no ledger, pular e
  seguir — **exceto** dep rígida declarada (se A bloquear, B da cadeia também bloqueia; não pular B).
- **Sem credencial:** implementar a lógica atrás de interface + **mock** nos testes; marcar
  PENDENTE-MANUAL no ledger o que exige ambiente externo. Nunca inventar chave, chamar API real nem
  commitar segredo.
- **Plataforma:** Windows / PowerShell (Bash tool p/ scripts POSIX).

## Bootstrap de serviços (uma vez, no início, em background)

1. `pnpm install` (se necessário)
2. `pnpm infra:up` — Postgres, Redis, MinIO (docker)
3. `pnpm --filter @markethub/api prisma:generate` (após mudança de schema; antes do typecheck do backend)
4. `pnpm --filter @markethub/types build && pnpm --filter @markethub/api-client build` — quando a
   rodada tocar contratos; rebuildar sempre que o contrato mudar.
5. **API** (background, só se o e2e exigir): `pnpm dev:api` → :3000 (esperar healthcheck).
6. **App web** (background, só p/ e2e Playwright web): conforme a unidade. Esperar responder.

## Branches — uma por unidade, mergeada na main ao fechar

```
git switch main
git switch -c story/NN-{slug}
```

- O `markethub-implementer` commita o `.md` do plano (se ainda não versionado) +
  `feat(story-NN): <título>` na branch (rodapé co-author; pt-BR — ver CLAUDE.md). **Sem push.**
- Orquestrador, após recibo OK do agent **e** suíte verde: `git switch main && git merge --no-ff
  story/NN-{slug} -m "merge: story NN — <título>"`. Sem push. Não deletar a branch.
- Arquivar o plano: `git mv stories/NN-*.md stories/done/` (flat — **não** agrupar por `phase-NN`) +
  commit `docs(stories): arquiva story NN concluida em done/`.

## A cada disparo do loop

1. **Reler estado:** ledger + `git log`. Unidades com commit/hash = prontas; pular.
2. **Se a sessão estiver no limite** (`You've hit your session limit · resets <hora>`): **não fazer
   nada**, encerrar o turno. O `/loop` (intervalo fixo) redispara depois do reset e retoma sozinho —
   não rearmar nada. (Encher a **janela de contexto** é outro caso: há auto-compactação e segue no
   mesmo turno.)
3. **Caso contrário:** escolher a próxima unidade `todo`/`in_progress` na ordem (respeitando deps
   rígidas), disparar `markethub-implementer` com o plano + branch. Ao receber o recibo: se OK e
   verde → mergear na main + arquivar; senão → registrar `blocked`/PARCIAL com motivo. Marcar status
   no ledger. Várias unidades por turno se houver orçamento.
4. **Salvar estado sempre:** ledger atualizado + tudo commitado (cada unidade = checkpoint).

## Registro de progresso (ledger)

Após cada unidade, anexar:

```
[OK|PARCIAL|BLOQUEADO] NN — testes: <resumo> — commit: <hash> — merge: <hash> — <data> — <bloqueio se houver>
```

**Entrada curta — máx. ~3 linhas.** O ledger existe pra retomar (status + contagem de testes +
hashes + bloqueio + no máx. 1 nota crítica). Detalhe rico (lista de specs, percentuais por arquivo,
racional) vai no **corpo do commit** ou no `.md` da story ao arquivar — não no ledger.

## Encerrar o loop

Quando **todas** as unidades estiverem `done` ou `blocked`/PENDENTE-MANUAL no ledger: escrever o
resumo final (ver "Ao terminar") e **encerrar o loop** — não reagendar.

## Ao terminar

Resumo final no ledger: o que passou, o que ficou BLOQUEADO/PENDENTE-MANUAL e por quê, branches e
commits/merges, comandos exatos pra reproduzir os gates. Deixar os serviços de pé.

**Arquivar a rodada:** mover o conteúdo da rodada encerrada para `stories/done/PROGRESS-NN-MM.md`
e restaurar o stub em `stories/PROGRESS.md` (o ledger ativo fica pequeno — ele é relido a cada
disparo do loop; rodadas mortas não podem acumular nele). Commit
`docs(stories): arquiva rodada NN-MM`.

## Proibido

Push · abrir PR · deletar trabalho não criado pelo agente · pular testes sem justificativa · inventar
chave/segredo · chamar API externa real · perguntar qualquer coisa ao usuário · mergear na main com a
suíte tocada vermelha · editar este arquivo com config de uma rodada específica (vai no ledger).
(Merge na main É permitido e esperado, por unidade, após suíte verde — sem push.)
