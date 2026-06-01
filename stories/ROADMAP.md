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
| 2 | Marketplace (cliente) | `phase-2-marketplace-customer/` |
| 3 | Picking (separador) + gestão merchant | `phase-3-picking/` |
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

### Fase 2 — Marketplace (cliente)
- S2.1 Modelo de pedido, carrinho e endereço
- S2.2 Endereços do cliente
- S2.3 Carrinho multi-loja
- S2.4 Cupons, frete e taxas
- S2.5 Checkout: entrega e agendamento
- S2.6 Pagamento PIX (QR dinâmico + webhook)
- S2.7 Pedido: criação, status e histórico
- S2.8 App cliente: vitrine, busca e carrinho
- S2.9 App cliente: checkout, PIX e pedidos

### Fase 3 — Picking (separador)
- S3.1 Modelo de domínio de picking
- S3.2 Atribuição de tarefa ao separador
- S3.3 Sessão de separação item a item — selecionado / recusado / substituído (ref: `Picking.jpg`)
- S3.4 Substituição de item e ruptura de estoque
- S3.5 Empacotamento em caixas com QR/serial (ref: `Receive.jpg`)
- S3.6 Handoff para entregador
- S3.7 App separador (picker)
- S3.8 Eventos e tempo real da separação
- S3.9 Gestão de ofertas e estoque pelo merchant (API)
- S3.10 Cadastro de produto canônico pelo merchant (API)
- S3.11 Admin SPA: área do merchant (manager)

### Fase 4 — Delivery (entregador)
- S4.1 Modelo de domínio de entrega (rota multi-stop, paradas, perfil do entregador)
- S4.2 Disponibilidade e localização do entregador (ref: `Home - Pressing Status toggle.jpg`)
- S4.3 Motor de rotas + matching multi-stop coleta+entrega (ref: `Home - Route found.jpg`)
- S4.4 Oferta de rota e aceite/recusa com timer
- S4.5 Coleta: chegada + retirada por QR (ref: `Coleta*.jpg`)
- S4.6 Entrega: chegada + confirmação por QR/senha de caixa (ref: `Entrega*.jpg`)
- S4.7 Ganhos do dia / rotas finalizadas (ref: `Home.jpg`)
- S4.8 App entregador (driver)

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
