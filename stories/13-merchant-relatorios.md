# Plan: App merchant — relatórios

## Context

Bloco **criar app merchant** do BACKLOG (escopo adicionado na sessão): o app merchant deve
**ter relatórios**. Depende da **story 07** (scaffold, `merchant/context`, `can`) e usa dados de
pedidos/ofertas já existentes.

**Fatos do código (reuso):**
- `admin-dashboard.service` já calcula, **admin-wide**:
  - `orders`: contagem + `statusCounts` por status.
  - `operations`: picking/delivery por status, contagem por loja.
  - `finance`: `salesCents`, `platformFeeCents`, `refundsCents`, tips,
    `estimatedMerchantPayoutCents` (período).
  - `driverTips`, `reviews`.
- Métricas escopam por `where` (storeId/período) — dá para reusar a forma, trocando o escopo
  para as lojas do merchant.
- **Top produtos** não existe ainda — é agregação nova sobre `OrderItem`.

**Decisões travadas (refino):**
- **4 relatórios no MVP** (escolha da sessão): **Vendas/faturamento**, **Operacional**,
  **Top produtos**, **Avaliações** — todos **escopados às lojas do usuário**.
- **Filtro de período + por loja** (escolha da sessão): intervalo (hoje / 7d / 30d / custom) e
  loja (uma ou todas do escopo). Agregação sob demanda no backend.
- **Acesso/escopo:** dono vê todas as lojas do merchant; **gerente** vê só as suas
  (`managerStoreIds`) — inclusive faturamento da(s) loja(s) dele. (Se depois o financeiro for
  considerado sensível p/ gerente, restringir via `can` — decisão default registrada para
  revisão.)
- **Reuso, não duplicação:** extrair as agregações do `admin-dashboard.service` para um serviço
  comum (ou parametrizar por escopo de lojas) em vez de copiar. Admin segue com escopo global;
  merchant injeta o escopo das suas lojas.

## Desenho

- **Backend** (`merchant` + serviço de relatórios, reusando agregações):
  - `GET merchant/reports/sales?from&to&storeId` — faturamento, nº pedidos, ticket médio, taxas,
    payout estimado (escopo das lojas do usuário).
  - `GET merchant/reports/operations?from&to&storeId` — pedidos por status, picking/delivery,
    (tempo médio de picking / entregas no prazo se barato com os dados atuais).
  - `GET merchant/reports/top-products?from&to&storeId&limit` — agregação nova sobre `OrderItem`
    (quantidade + receita), ordenada desc.
  - `GET merchant/reports/reviews?from&to&storeId` — notas/contagem por eixo
    (platform/delivery/merchant), reusando reviews.
  - Todas escopadas via `requireStores`/`managerStoreIds`; período parseado (default: 30d).
- **Frontend** (`apps/merchant`):
  - `src/api/reports.ts` + hooks (`useSalesReport`, `useOperationsReport`, `useTopProducts`,
    `useReviewsReport`) com React Query; `queryKeys.reports.*` incluindo período+loja.
  - `pages/Reports.tsx`: seletor de período (presets + custom) + seletor de loja; 4 seções/abas
    com cards/tabelas/gráficos simples. Visível p/ dono e gerente.

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/api test:coverage` + `pnpm --filter @markethub/merchant test:coverage`.
Sem `skip`/`only` injustificado.

- **Backend:**
  - Cada relatório respeita o **escopo de lojas** (gerente só as dele; dono todas; sem vínculo
    `403`) e o **período** (from/to filtram corretamente).
  - `sales`: totais/ticket médio/payout conferem com dados de fixture conhecidos.
  - `top-products`: agrega quantidade/receita por produto e ordena desc; respeita `limit`.
  - `operations`/`reviews`: contagens por status/eixo conferem.
- **Frontend:** seletor de período/loja altera as query keys e refaz a busca; abas renderizam
  os números; gerente não vê lojas fora do escopo.
- `pnpm typecheck` + `pnpm build` verdes.

## Fora de escopo

- Exportação (CSV/PDF) e agendamento de relatórios por e-mail.
- Gráficos avançados/BI; comparação entre períodos.
- Métricas que exijam novo tracking não disponível hoje (ex.: funil de conversão do cliente).
- Pedidos em tempo real (story 12) — relatórios são agregação histórica.
