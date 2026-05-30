# MarketHub — Roadmap

Plataforma brasileira de marketplace + delivery de supermercados (PT-BR, R$, PIX). Cinco frentes:
marketplace (cliente), delivery (entregador), picking (separador), integração ERP e enriquecimento
de dados.

Esta pasta é o **ponto de controle** do projeto. Cada story é um arquivo `.md` versionável. Edite,
reordene e ajuste critérios a qualquer momento — é assim que se corrige a direção a cada ciclo.

## Visão de arquitetura

Monorepo (Turborepo + pnpm). Backend NestJS + Prisma + PostgreSQL. Apps React Native (Expo):
`customer`, `picker`, `driver`. Admin Vite + React (SPA). Real-time Socket.IO. Filas BullMQ + Redis. PIX via
gateway. Rotas via Google Maps Platform. Storage S3-compatível (MinIO em dev). Auth JWT+refresh com
RBAC (`customer`, `picker`, `driver`, `merchant`, `admin`).

```
apps/        api · customer · picker · driver · admin
packages/    types · api-client · ui
infra/       docker-compose (Postgres, Redis, MinIO), CI
stories/     este roadmap
briefing/    screenshots de referência
```

## Fases

| Fase | Tema | Pasta |
|------|------|-------|
| 0 | Fundação | `phase-0-foundation/` |
| 1 | Catálogo + ERP + Enriquecimento | `phase-1-catalog-erp-enrichment/` |
| 2 | Marketplace (cliente) | _detalhar ao iniciar_ |
| 3 | Picking (separador) | _detalhar ao iniciar_ |
| 4 | Delivery (entregador) | _detalhar ao iniciar_ |
| 5 | Rastreio, avaliações, admin, polish | _detalhar ao iniciar_ |

Ordem de construção: **Base → catálogo/ERP/enriquecimento → cliente → picking → delivery → polish**.

### Fase 0 — Fundação
- S0.1 Monorepo + tooling
- S0.2 Backend skeleton (NestJS)
- S0.3 DB + Prisma
- S0.4 Auth & RBAC
- S0.5 Pacotes compartilhados (types, api-client, ui)
- S0.6 Shells dos apps mobile (Expo)
- S0.7 Shell admin web (Vite + React)
- S0.8 Infra dev & CI

### Fase 1 — Catálogo + ERP + Enriquecimento
- S1.1 Modelo de domínio de catálogo
- S1.2 Framework de conector ERP
- S1.3 Conector mock/CSV
- S1.4 Sync de preço & estoque
- S1.5 Pipeline de enriquecimento
- S1.6 API de catálogo
- S1.7 Admin de catálogo

### Fase 2 — Marketplace (cliente) _(epics, detalhar ao iniciar)_
- Home de merchant + browse por categoria (ref: `briefing/.../Merchant Home.jpg`)
- Busca (produto, marca, departamento)
- Carrinho multi-loja com quantidades e variações de peso (ref: `Cart.jpg`)
- Cupons e cálculo de frete/taxas por merchant
- Checkout: endereço, método de entrega (portaria/porta), janela/agendamento (ref: `Shipping Settings.jpg`)
- Pagamento PIX (QR dinâmico + webhook) (ref: `Payment.jpg`, `Confirmed.jpg`)
- Criação de pedido + histórico (ref: `Order Created.jpg`, `Orders.jpg`)

### Fase 3 — Picking (separador) _(epics, detalhar ao iniciar)_
- Atribuição de pedido ao separador
- Fluxo de separação item a item: selecionado / recusado / substituído (ref: `Picking.jpg`)
- Empacotamento em caixas com QR/serial (ref: `Receive.jpg`)
- Handoff para entregador

### Fase 4 — Delivery (entregador) _(epics, detalhar ao iniciar)_
- Disponibilidade / toggle de status (ref: `delivery/Home*.jpg`)
- Motor de rotas + matching multi-stop coleta+entrega (ref: `Home - Route found.jpg`)
- Coleta: chegada + retirada de pedidos (ref: `Coleta*.jpg`)
- Entrega: chegada + confirmação por QR de caixa (ref: `Entrega*.jpg`)
- Ganhos do dia / rotas finalizadas

### Fase 5 — Rastreio, avaliações, admin, polish _(epics, detalhar ao iniciar)_
- Rastreio em tempo real do pedido (cliente) — confirmado/comprando/a caminho
- Avaliações multi-eixo (plataforma, entrega, merchant) + gorjeta (ref: `Order Completed.jpg`)
- Agendamento de entrega
- Dashboard admin (pedidos, operações, financeiro)
- Enriquecimento avançado + métricas de qualidade de catálogo

## Convenção de status

Cada story tem campo `Status: todo | in-progress | done`. Ao implementar: marque `in-progress`,
implemente, marque `done`. Ao concluir uma fase, crie os arquivos de story da próxima.

## Template de story

```markdown
# [ID] Título
- **Fase:** N
- **Epic:** <nome>
- **Status:** todo | in-progress | done
- **Depende de:** [IDs]

## Objetivo
## User story
## Critérios de aceite
## Escopo / Fora de escopo
## Notas técnicas
```
