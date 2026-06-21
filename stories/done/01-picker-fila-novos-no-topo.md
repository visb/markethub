# Plan: Picker — pedidos não atribuídos no topo da fila

## Context

Bloco **picker** do BACKLOG. No app picker (`apps/picker`), os pedidos novos (ainda
não assumidos) devem aparecer **primeiro** na fila, para o separador ver de imediato
o que precisa ser puxado.

Hoje `PickingService.listQueue` (`services/api/src/picking/picking.service.ts:53`)
ordena tudo por tempo efetivo ascendente (`scheduledFrom ?? createdAt`), misturando
tarefas `queued` com as já `assigned`/`picking` do próprio separador. Resultado: uma
tarefa nova recém-criada pode cair no meio/fim da lista atrás das que o separador já
está tocando.

**Decisão travada (refino):** agrupar por status — tarefas **não atribuídas** (`queued`)
vêm antes das **minhas** (`assigned`/`picking`/…); **dentro de cada grupo mantém o FIFO**
por tempo efetivo (`scheduledFrom ?? createdAt`, ascendente). Isso preserva o SLA de
picking (mais antigo primeiro dentro do grupo) e destaca o que precisa ser assumido.
Descartado LIFO puro (quebraria o FIFO/SLA) e o esquema "novo no topo até ser visto"
(exigiria estado de 'visto', complexidade desnecessária pro MVP).

Mudança é primariamente de ordenação no backend; o front já renderiza a lista na ordem
recebida. A atualização automática quando chega pedido novo é escopo da **story 02**
(realtime) — esta story só garante a ordem correta quando a fila é (re)carregada.

## Desenho

- **Backend** (`picking.service.ts` → `listQueue`):
  - Manter o `effective(t) = scheduledFrom ?? createdAt` como critério FIFO.
  - Novo `sort`: ordenar primeiro por grupo de status (`queued` = 0, demais = 1) e,
    em empate, por `effective` ascendente. Resultado: `queued` no topo em FIFO, seguidas
    das atribuídas em FIFO.
  - Não altera o shape do `PickTaskDTO` nem o `picking.mapper.ts` — só a ordem do array.
- **Frontend** (`apps/picker/app/home.tsx`): nenhuma mudança de ordenação necessária
  (consome a ordem do backend). Se a story 02 ainda não tiver migrado a tela para React
  Query, **não** migrar aqui — manter o escopo só na ordenação do backend.

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/api test:coverage`. Sem `skip`/`only` injustificado.

- **`picking.service.spec.ts`** — `listQueue`:
  - Caso: fila com uma `queued` mais **nova** e uma `assigned` (minha) mais **antiga** →
    a `queued` vem primeiro (status manda sobre o tempo entre grupos).
  - Caso: duas `queued`, uma mais antiga e uma mais nova → mais antiga primeiro (FIFO
    interno preservado).
  - Caso: duas `assigned` minhas → FIFO interno preservado.
  - Caso: agendada (`scheduledFrom`) vs imediata `queued` → respeita `effective` dentro
    do grupo `queued`.
- Rodar `pnpm --filter @markethub/api test` + `pnpm typecheck`.

## Fora de escopo

- Atualização automática / realtime ao chegar pedido (story 02).
- Migração da `home.tsx` para React Query (acompanha a story 02).
- Qualquer mudança visual de destaque ("novo!") na lista.
