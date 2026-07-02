# MarketHub — Roadmap

Plataforma brasileira de marketplace + delivery de supermercados (PT-BR, R$, PIX). Cinco frentes:
marketplace (cliente), delivery (entregador), picking (separador), integração ERP e enriquecimento
de dados.

Esta pasta é o **ponto de controle** do projeto. Cada story é um arquivo `.md` versionável.

## Visão de arquitetura

Monorepo (Turborepo + pnpm). Backend NestJS + Prisma + PostgreSQL. Apps React Native (Expo):
`customer`, `picker`, `driver`. Admin e merchant Vite + React (SPA). Real-time Socket.IO. Filas
BullMQ + Redis. PIX via gateway. Rotas via Google Maps Platform. Storage S3-compatível (MinIO em
dev). Auth JWT+refresh com RBAC (`customer`, `picker`, `driver`, `merchant`, `admin`).

```
apps/        customer · picker · driver · admin · merchant
services/    api (NestJS + Prisma)
packages/    types · api-client · ui
infra/       docker-compose (Postgres, Redis, MinIO), CI
stories/     este roadmap + stories flat
briefing/    screenshots de referência
```

## Fluxo de trabalho atual (stories flat)

- **Formato canônico** de story: ver skill **`issue`** (`.claude/skills/issue/SKILL.md`) —
  `stories/NN-slug.md` flat, `# Plan:` + Context / Desenho / Validação (com gate de cobertura) /
  Fora de escopo.
- **Criar** story: `/issue` (uma) ou `/planning` (sessão sobre `BACKLOG.md`).
- **Implementar** em lote autônomo: `/autorun` (protocolo em `AUTORUN.md`, ledger em `PROGRESS.md`).
- **Concluída** = `git mv` para `stories/done/` (flat). Rodadas encerradas do ledger ficam em
  `stories/done/PROGRESS-NN-MM.md`.

Stories 01–44 (flat) já concluídas — ver `stories/done/` e os ledgers arquivados.

## Histórico — fases 0–7 (formato legado, encerradas)

As fases abaixo foram o modelo original de organização (pastas `phase-*`, ids `SN.N`). **Todas
encerradas**; os arquivos vivem em `stories/done/phase-*/`. Não usar esse formato para story nova.

| Fase | Tema |
|------|------|
| 0 | Fundação (monorepo, backend skeleton, DB/Prisma, auth/RBAC, packages, shells dos apps, infra/CI) |
| 1 | Catálogo + ERP + Enriquecimento (modelo de catálogo, conectores, sync preço/estoque, pipeline, API, admin) |
| 2 | Marketplace cliente (pedido/carrinho/endereço, cupons/frete, checkout, PIX, vitrine/busca) |
| 3 | Picking + gestão merchant (sessão de separação, substituição, empacotamento, handoff, realtime) |
| fix | Correções de domínio pré-fase-4 (pickupCode/deliveryCode, reembolso único) |
| 4 | Delivery — **SUPERSEDED**: marketplace de entregadores substituído por entrega própria da loja + retirada (MVP); entregador virou `StoreStaff` role driver |
| 5 | Rastreio, avaliações, agendamento, dashboard admin, push, polish |
| 6 | Refinamento do app cliente (endereço/CEP, cobertura Curitiba, favoritos, preparo) |
| 7 | Qualidade (review sweep + cobertura de testes) |

Ordem de construção seguida: **base → catálogo/ERP/enriquecimento → cliente → picking → delivery → polish**.
