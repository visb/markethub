# Plan: admin — dashboard real (KPIs + alertas operacionais)

## Context

`Dashboard.tsx` do admin tem 29 linhas: "Olá, {user}". A home do operador da plataforma não
mostra nada — KPIs e problemas vivem espalhados em Operations/Finance/ErpRuns, e situações
anômalas (outbox acumulando, sync ERP parado, pedido esquecido na fila) só aparecem se alguém
for procurar.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- Endpoint agregador novo `GET admin/dashboard` (uma chamada; evita N queries do front) no
  módulo `admin`, reusando os services internos de operations/finance (mesmo módulo).
- Comparação hoje × ontem nos KPIs (delta %), timezone America/Sao_Paulo.
- Alertas com thresholds fixos em constantes (env fica p/ depois).
- Auto-refresh no front (`refetchInterval` 60s).

## Desenho

### Backend (`services/api/src/admin`)

1. `GET admin/dashboard` → shape:
   - `kpis`: pedidos pagos hoje (+delta vs ontem), GMV hoje em cents (+delta), ticket médio,
     lojas ativas (e pausadas — story 57, se já mergeada; senão omitir).
   - `queues`: picking em `queued` há > 15 min (count), entregas `unassigned` há > 15 min,
     retiradas aguardando, entregas `failed` aguardando decisão (story 61, se presente).
   - `alerts[]` (`{ severity, code, message, count }`):
     `OUTBOX_BACKLOG` (OutboxEvent sem `publishedAt` há > 5 min),
     `ERP_SYNC_STALE` (último `SyncRun` failed ou nenhum run em 24h, por merchant com conector),
     `PAYMENTS_STUCK` (Payment `pending` além da janela do PIX).
2. DTO em `packages/types` (admin já consome types compartilhados? seguir padrão das páginas
   vizinhas — onde o admin tipa local, tipar local).

### Admin app

3. `Dashboard.tsx` vira dashboard de verdade (mantém saudação no topo):
   - Linha de cards KPI (valor grande + delta colorido ↑↓).
   - Painel "Filas" (4 contadores com link: picking → Operations, entregas → Operations,
     retiradas, falhas).
   - Painel "Alertas": lista por severidade (vermelho/amarelo) com link pra página
     correspondente (ErpRuns, Orders, Finance); vazio → "tudo em ordem ✓".
   - Hook `useAdminDashboard` (React Query, `refetchInterval: 60_000`), query key
     centralizada.
4. Conferir que a rota index do admin (RoleHome) leva o admin a este Dashboard.

## Validação

- Backend: specs do agregador — janelas hoje/ontem (borda de meia-noite SP), deltas com
  divisor zero, cada alerta dispara/não-dispara nos thresholds, queues contam só acima do
  limiar. `pnpm --filter @markethub/api test`.
- Admin: página renderiza KPIs/filas/alertas de fixture, estado "tudo em ordem", links
  corretos. `pnpm --filter @markethub/admin test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  admin ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Gráficos/séries temporais (cards e contadores só).
- Thresholds configuráveis por env/UI.
- Notificação ativa de alerta (e-mail/push pro admin).
- Dashboard do merchant (Reports já cobre).
