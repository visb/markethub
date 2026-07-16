# Plan: picker — métricas próprias + visão por colaborador no merchant

## Context

Nenhuma ponta mostra produtividade de separação. Os dados já existem completos: `PickTask`
(`assignedAt`/`startedAt`/`packedAt`/`readyAt`, `pickerId`), `PickItem` (`pickedAt`,
`pickedById`, status) e `Substitution`. O picker não tem noção do próprio ritmo (motivação) e
o merchant Reports agrega só por status — sem visão por colaborador (gestão).

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- Métricas: **tarefas concluídas** (readyAt no período), **itens separados**, **itens/hora**
  (itens ÷ soma de `packedAt − startedAt` das tasks concluídas — tempo ativo de separação),
  **taxa de substituição** (substituted ÷ itens) e **taxa de recusa** (refused ÷ itens).
- Períodos fixos hoje / 7d / 30d — mesma convenção da story 60 (ganhos do driver).
- Sem ranking entre pickers no app do picker (só os próprios números; comparação é do gestor).

## Desenho

### Backend

1. `GET picking/metrics/me?period=today|7d|30d` (role picker) → `{ tasksCompleted,
   itemsPicked, itemsPerHour, substitutionRate, refusalRate }` — agregação Prisma no módulo
   `picking`. Task sem `startedAt`/`packedAt` fica fora do itens/hora (divisor zero → null).
2. `GET merchant/reports/pickers?from&to&storeId` (capability `reports.view`, mesmo guard das
   rotas vizinhas de `merchant-reports.controller`) → linhas por colaborador: nome, mesmas
   métricas. DTOs em `packages/types`.

### Picker app

3. Rota nova `metrics.tsx` (entrada na home, ex. "Meu desempenho"): chips de período, cards
   (tarefas, itens, itens/h) + linhas de taxa de substituição/recusa. React Query, query keys
   centralizadas, estado vazio ("nenhuma separação no período").

### Merchant app

4. Reports: seção nova "Separação por colaborador" — tabela (colaborador, tarefas, itens,
   itens/h, subst. %, recusa %) respeitando o filtro de período/loja já existente na página.

## Validação

- Backend: specs das agregações (período filtra por `readyAt`, itens/hora ignora task sem
  timestamps, taxas com zero itens → 0/null sem NaN, picker só vê o seu, escopo de
  loja/rede no report). `pnpm --filter @markethub/api test`.
- Picker: tela renderiza cards, troca de período, estado vazio.
- Merchant: tabela nova na página Reports com dados mockados.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  picker + merchant ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Ranking/gamificação entre pickers.
- Metas/SLA por picker com alerta.
- Export CSV.
- Métricas de driver no merchant (Finance/admin já cobre gorjetas; entrega fica p/ depois).
