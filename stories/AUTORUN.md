# AUTORUN — protocolo de execução autônoma de stories

Protocolo para **implementar, testar e commitar** um lote de stories **sem intervenção humana**. As
decisões já estão travadas dentro de cada `stories/NN-*.md` (seção "Decisões travadas") — **não
perguntar nada ao usuário** durante a execução.

> Preencha os placeholders `{...}` ao iniciar uma rodada (quais stories, ordem, dependências).
> Histórico de execuções anteriores vive no `git log` + `stories/done/`. Estado da rodada corrente
> em `stories/PROGRESS.md`.

## Prompt de início (colar e sair)

Iniciar com `/loop` **com intervalo fixo** (não auto-pacing). O harness redispara o prompt sozinho
a cada intervalo, independente do limite de sessão — disparo que cair no limite não faz nada e o
próximo (após o reset) retoma. Colar (ajustar a faixa de stories e a ordem):

```
/loop 30m Modo autônomo. Siga C:\code\markethub\final2\stories\AUTORUN.md à risca, sem me perguntar nada. A cada disparo deste loop, releia stories/PROGRESS.md + git log e continue da próxima story NÃO commitada na ordem 01 → 02. Se a sessão tiver batido o limite, não faça nada e aguarde o próximo disparo (após o reset) — não tente rearmar nada. Implemente tudo que for autonomamente possível; ao terminar cada story, rode os testes automatizados (unit + e2e) e, com a suíte tocada TODA verde, faça merge --no-ff na main e siga para a próxima. O que depender de credencial/serviço externo que você não tem: implemente atrás de interface com mocks nos testes, marque BLOQUEADO em PROGRESS.md com o motivo, e siga — não invente chaves, não chame API real, não dê push. Quando todas estiverem commitadas ou BLOQUEADAS, escreva o resumo final em PROGRESS.md e encerre o loop.
```

---

## Princípios

- **Contexto limpo por story**: para cada story, disparar um sub-agente novo via tool `Agent`
  (`subagent_type: general-purpose`). O orquestrador **não** implementa no próprio contexto — só
  coordena, sobe serviços e dispara um sub-agente por vez.
  - **Se o spawn falhar por limite de sessão** ("You've hit your session limit") → seção **Limite
    de sessão**: encerrar o turno sem fazer nada; o próximo disparo do `/loop` (após o reset)
    retoma sozinho. Não tentar rearmar nem insistir em loop apertado.
- **Nenhum app rodado manualmente**: o orquestrador sobe docker (infra) e, quando o e2e exigir, a
  API e o app web.
- **Sem push / sem PR**, mas **COM merge na main por story** (padrão; ajustar se a rodada pedir
  outra coisa): cada story, ao ficar verde, é mergeada na `main` local antes da próxima. Sem push.
- **Protocolo "teste-antes-do-merge" (DoD)**: antes de **QUALQUER** merge na main — rodar a suíte
  da área tocada e exigir **tudo verde**. "Story concluída" = **implementada E testes verdes**
  (casos novos **e** sem regressão no que a mudança tocou). Suíte vermelha = não mergeia, corrige.
- **Não travar a fila**: se uma story bloquear (dependência externa, etc.), registrar em
  `stories/PROGRESS.md`, pular e seguir — **a menos que** a ordem tenha dependência rígida (ver "Ordem").
- **Plataforma**: Windows / PowerShell (Bash tool disponível p/ scripts POSIX).

## Stories da rodada

| #   | Tipo / o que é | Implementar? |
| --- | --- | --- |
| 01 | Separação dirige o status do pedido + emit realtime (backend `picking`) | SIM |
| 02 | Tela `/track/:id` em tempo real via socket (api-client + app customer) | SIM (depende 01) |

## Ordem e dependências

```
01 → 02
```

Cadeia rígida: **02 consome o contrato de eventos que a 01 dirige** (status "Comprando" +
snapshot pelo canal `order:`). Implementar 01 antes da 02. Se a 01 bloquear, a 02 também fica
bloqueada — registrar e **parar a fila**, não pular.

- Declarar dependências rígidas. Se houver (story B consome contrato de A), a fila é **sequencial**:
  se A bloquear, B também fica bloqueada — registrar e **parar a fila**, não pular.
- Sem dependência rígida, pode reordenar por conveniência (ex: do mais isolado ao mais acoplado).

## Branches — uma por story, mergeada na main ao fechar

Cada branch parte da `main` ATUAL (já com o merge da story anterior):

```
git switch main
git switch -c story/NN-{slug}
```

- Commitar o `.md` da story primeiro na branch (já existe `stories/NN-*.md`; mover/commitar como
  plano se ainda não estiver): `docs(stories): plano da story NN — <título>`.
- Um ou mais commits coesos da implementação: `feat(story-NN): <título>`. Sempre rodar hooks;
  co-author `Claude Opus 4.8 <noreply@anthropic.com>` (ou o modelo corrente). Commits em pt-BR
  (Conventional Commits, escopo da story — ver CLAUDE.md).
- Merge na main (após suíte verde): `git switch main && git merge --no-ff story/NN-{slug}
  -m "merge: story NN — <título>"`. Sem push. Não deletar a branch.
- Arquivar a story: `git mv stories/NN-*.md stories/done/` (flat — **não** agrupar por `phase-NN`)
  + commit `docs(stories): arquiva story NN concluida em done/`.

## Dependências externas — o que fazer SEM credenciais (não perguntar, não inventar)

Regra geral: **implementar a lógica e os contratos atrás de interface clara, com testes usando
MOCK**; nunca chamar API real, nunca inventar chave, nunca commitar segredo. Pontos típicos
(pagamento Pagar.me, Cosmos/Bluesoft, Google Maps, push FCM/APNs, storage MinIO): mockar nos
testes; marcar PENDENTE-MANUAL em `stories/PROGRESS.md` o que exige ambiente externo; não bloquear
o código por falta de credencial.

## Cuidados específicos da rodada

- **Sem migration nesta rodada.** A story 01 usa enums/colunas existentes (`OrderStatus`,
  `OrderGroup.status`) — **sem mudança de schema**. Se algo exigir migration, criar **nova** (nunca
  editar aplicada) e rodar `prisma:migrate` antes do e2e.
- **Contratos compartilhados**: a 02 mexe em `packages/api-client` (socket real) e reusa nomes de
  evento de `packages/types` (`picking-events`). Rodar `pnpm --filter @markethub/types build` +
  `pnpm --filter @markethub/api-client build` **antes** de typecheck/test do app customer (sem o
  `dist/` os consumidores quebram).
- **Realtime**: a 01 emite `order.updated` no canal `order:<orderId>` (gateway `/picking`); a 02
  consome esse snapshot. Não duplicar nomes de evento soltos — reusar os contratos de `types`.
- **Sem credencial — MOCK, não bloquear** (regra geral acima): push real FCM/APNs segue stub;
  socket testado com `socket.io-client` mockado (sem rede).
- **Padrões CLAUDE.md são gate**: telas não fazem fetch, React Query + query keys em
  `queryKeys.ts`, controller fino / regra no service. Código legado migrado ao ser tocado
  (a 02 troca o `setInterval`/`useState` por hook).

## Bootstrap de serviços (uma vez, no início, em background)

1. `pnpm install` (se necessário)
2. `pnpm infra:up` — Postgres, Redis, MinIO via docker
3. `pnpm --filter @markethub/api prisma:generate` — após qualquer mudança de schema; e antes do
   typecheck do backend.
4. `pnpm --filter @markethub/types build && pnpm --filter @markethub/api-client build` —
   **obrigatório** antes de typecheck/test dos apps quando a story tocar `packages/types` ou
   `packages/api-client` (story 02). Rebuildar sempre que o contrato mudar.
5. **API** (background, só se o e2e exigir): `pnpm dev:api` → http://localhost:3000. Esperar o
   healthcheck antes de testar. O e2e do backend (`test:e2e`, jest-e2e) usa o Postgres do `infra`.
6. **App web** (background, só p/ e2e Playwright web): `pnpm dev:customer` (Expo web) /
   `pnpm dev:admin` (Vite, porta 3001), conforme a story. Esperar responder.

## Por cada story (dentro do sub-agente)

a. Ler `stories/NN-*.md` **inteiro**. Implementar exatamente o descrito.
b. Se tocou `packages/types` / `packages/api-client`, rodar os builds correspondentes (passo 4).
c. Se criou migration, aplicá-la (`prisma:migrate`) antes do e2e. (Nesta rodada: nenhuma.)
d. Se adicionou dependência npm, instalar com `pnpm --filter <workspace> add <pkg>` conferindo
   compat (a 02 adiciona `socket.io-client` ao `@markethub/api-client`).
e. Atualizar/adicionar os testes da seção **Validação** da story (sem `skip`/`only`/`xfail` sem
   justificativa no código — dependência externa SEM credencial é justificativa válida; mockar).
f. Rodar os testes **automatizados** da story (serviços já no ar):
   - Backend (story 01): `pnpm --filter @markethub/api test` **e**
     `pnpm --filter @markethub/api test:e2e`. Gate de cobertura:
     `pnpm --filter @markethub/api test:coverage`.
   - api-client (story 02): `pnpm --filter @markethub/api-client test`.
   - customer (story 02): `pnpm --filter @markethub/customer test` (gate:
     `pnpm --filter @markethub/customer test:coverage`).
   - admin (se tocado): `pnpm --filter @markethub/admin test` (gate: `test:coverage`).
   - e2e web (se a story exigir UI ao vivo): `pnpm test:e2e` (Playwright na raiz).
g. Corrigir até a suíte tocada passar **inteira** (casos novos + sem regressão). Antes de
   "pronto": `pnpm typecheck` + `pnpm build` (CLAUDE.md). Suíte verde é pré-requisito do merge (DoD).
h. `git add` apenas arquivos da story + testes; `git commit` (`feat(story-NN)`).
i. **Merge na main**: `git switch main && git merge --no-ff story/NN-{slug} -m "merge:
   story NN — <título>"`. Resolver conflito se houver. Sem push, não deletar a branch.
j. Arquivar: `git mv stories/NN-*.md stories/done/` (flat — **não** agrupar por `phase-NN`) + commit de arquivamento.
k. Devolver ao orquestrador: arquivos tocados, testes rodados (unit+e2e), hash do merge, BLOQUEIOS.

## Registro de progresso

Manter `stories/PROGRESS.md` (seção nova da rodada). Após cada story, anexar:

```
[OK|PARCIAL|BLOQUEADO] NN — testes: <resumo> — commit: <hash> — merge: <hash> — <data> — <bloqueio se houver>
```

Fonte de verdade para retomar após resumo de contexto / reinício / reset de limite: **git log +
PROGRESS.md**. Stories já commitadas (`feat(story-NN)`) = feitas; pular.

## Limite de sessão / continuação automática (via `/loop`)

**A continuação é responsabilidade do `/loop`, não do modelo.** A execução roda dentro de um
`/loop` com **intervalo fixo** (~30 min): o **harness** redispara o prompt a cada intervalo. Por
isso sobrevive ao limite de sessão sem o modelo precisar rearmar nada.

Quando a conta bate o limite (`You've hit your session limit · resets <hora>`), o disparo atual não
consegue fazer nada — **encerrar o turno sem ação**. O **próximo disparo do loop**, já depois do
reset, retoma sozinho.

> Vale para o **limite de uso/sessão**. Encher a **janela de contexto** é outro caso — há
> auto-compactação e a execução segue sozinha dentro do mesmo turno.

### A cada disparo do loop

1. **Reler estado**: `stories/PROGRESS.md` + `git log`. Stories com commit `feat(story-NN)` estão
   prontas; pular.
2. **Se a sessão estiver no limite**: não fazer nada, encerrar o turno. O harness redispara depois.
3. **Caso contrário**: identificar a próxima story NÃO commitada na ordem e executar do passo "Por
   cada story" (várias por turno se houver orçamento).
4. **Salvar estado sempre**: progresso em `PROGRESS.md` + tudo commitado (cada story = checkpoint).

### Encerrar o loop

Quando **todas** as stories da rodada estiverem commitadas ou registradas BLOQUEADO em
`stories/PROGRESS.md`: escrever o resumo final (seção "Ao terminar") e **encerrar o loop** — não
reagendar.

## Proibido

Push, abrir PR, deletar trabalho não criado pelo agente, pular testes sem justificativa, inventar
chaves/segredos, chamar API externa real, perguntar qualquer coisa ao usuário, mergear na main com
a suíte tocada vermelha. (Merge na main É permitido e esperado, por story, após suíte verde — sem
push.)

## Ao terminar

Escrever resumo final em `stories/PROGRESS.md`: o que passou, o que ficou BLOQUEADO/PENDENTE-MANUAL
e por quê, branches e commits, comandos exatos para reproduzir. Deixar os serviços de pé.
