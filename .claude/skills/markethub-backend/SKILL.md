---
name: markethub-backend
description: Padrões do backend NestJS em services/api — módulos por domínio, controllers finos, DTO+class-validator+ValidationPipe global, persistência via Prisma (não TypeORM), auth JWT com guards globais (@Public/@Roles/@CurrentUser), filtro de exceções e codes, fila BullMQ, realtime Socket.IO, integrações atrás de interface+mock, migrations Prisma. Use ao criar ou editar qualquer coisa em services/api.
---

# Guia do backend MarketHub para IA

## Stack & estrutura

NestJS + **Prisma** + PostgreSQL em `services/api`. (Prisma, **não** TypeORM. IDs `cuid`.)

Entrada/infra:

- `src/main.ts` — bootstrap. Prefixo global (`API_PREFIX`), `ValidationPipe` global (`whitelist + forbidNonWhitelisted + transform`), CORS, pino logger, shutdown hooks.
- `src/app.module.ts` — composição dos módulos + **guards/filtro globais** (ver Auth).
- `src/config/*` — env tipado (`Env`), `AppConfigModule`.
- `src/prisma/*` — `PrismaService` (extends `PrismaClient`) + `PrismaModule`. **Único** ponto de acesso ao banco.
- `src/common/*` — `filters/all-exceptions.filter.ts`, `codes.ts`, `geo.ts`, `logger/`.
- `src/<domínio>/*` — `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`, specs.

Módulos atuais: `auth · users · catalog · marketplace · merchant · picking · driver · payment · enrichment · erp · reviews · scheduling · notifications · favorites · admin · geocoding · storage · queue · health`.

## Padrão de módulo

Ao criar/editar funcionalidade de domínio:

1. Ler o módulo existente mais próximo em `src/<domínio>` e seguir o estilo.
2. **Controller fino:** valida entrada (DTO + `class-validator`) e roteia. **Sem** regra de negócio.
3. **Service:** regra de negócio + orquestração. Acesso a banco **só** via `PrismaService` injetado — nunca instanciar `PrismaClient` solto nem consultar banco fora do service do módulo.
4. **DTO de PATCH:** campos `@IsOptional()` → body parcial é esperado. Tratar `undefined` (ausente) ≠ `null`. Padrão "salvar só o diff" depende disso (ver `lockedFields` em `catalog`).
5. **Integração externa** atrás de **interface + mock** (modelo: `payment/payment-provider.interface.ts` + `providers/`). Permite testar sem rede e trocar provedor por env.

## Auth & autorização

Guards/filtro registrados **globais** em `app.module.ts` (`APP_GUARD`/`APP_FILTER`):

- `JwtAuthGuard` (global) — toda rota exige JWT por padrão.
- `RolesGuard` (global) — RBAC.
- `AllExceptionsFilter` (global) — normaliza resposta de erro.

Decorators (`src/auth/decorators/`):

- `@Public()` — abre rota (pula `JwtAuthGuard`). Usar em login/health/webhooks.
- `@Roles(...RoleName)` — restringe por papel. `RoleName` vem de `@prisma/client`: `customer · picker · driver · merchant · admin`. Ex.: `@Roles("admin")` nos controllers de admin.
- `@CurrentUser()` — injeta o usuário autenticado no handler.

JWT: access + refresh (`auth/token.service.ts`); segredos via env (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`). Tokens/strategies em `auth/strategies/`.

## Erros

- Lançar com shape `{ code, message }` — `code` em SCREAMING_SNAKE para o front discriminar (ex.: `PRODUCT_NOT_FOUND`). `AllExceptionsFilter` padroniza a saída.
- Helpers/códigos compartilhados em `src/common/codes.ts`.

## Banco & migrations (Prisma)

- Schema único: `services/api/prisma/schema.prisma`. Migrations em `services/api/prisma/migrations/`.
- **Nunca editar migration já aplicada** para mudar comportamento — criar nova (`pnpm --filter @markethub/api prisma:migrate`).
- Após mudar o schema: `pnpm --filter @markethub/api prisma:generate` **antes** de typecheck/build (o client gerado é importado em todo o backend).
- Seed: `pnpm --filter @markethub/api db:seed`.
- **Windows:** `P1001` com Docker healthy → `docker restart` do Postgres (port-forward cai).

## Fila & realtime

- **BullMQ + Redis** (`queue/`) — jobs assíncronos (ex.: enriquecimento, sync ERP). `REDIS_URL` via env.
- **Socket.IO** — gateways nos módulos (tracking de pedido, status de picking/delivery). Cliente em `@markethub/api-client/socket`.
- **Scheduling** (`scheduling/`, `@nestjs/schedule`) — sync agendado do ERP (`SYNC_SCHEDULE_ENABLED`, `SYNC_CRON`).

## Domínio — pontos críticos

**Conferir `BUSINESS_RULES.md` (raiz) antes de mexer em status, cancelamento, reembolso, picking, delivery ou lockedFields** — é a fonte canônica das invariantes, com ponteiro pro código de cada regra. Stories da fase em `stories/phase-*` dão o contexto.

- **saleType** (`unit` | `weight`): peso em **gramas**; dirige preço/quantidade.
- **lockedFields** (catalog): campos travados contra enriquecimento automático; só os **editados** travam — o `updateProduct` discrimina por `undefined`, gravando/travando apenas o diff.
- **enrichment**: pipeline GTIN (Cosmos/Bluesoft) + Claude p/ categoria; **respeita** `lockedFields`.
- **erp**: ingestão catálogo/preço/estoque (conector CSV mock + fixtures).
- **picking → delivery**: separação pelo próprio mercado; entrega própria ou retirada (own-store; `driver` = entregador da loja). Códigos curtos de coleta/entrega via `common/codes.ts`.
- **payment**: PIX via Pagar.me atrás de `PaymentProvider` (swappable + mock); `refund` tem pricing testado.

## Tipos compartilhados

O backend é **standalone** — **não** importa `packages/types` (usa tipos do Prisma). `packages/types` é o contrato consumido pelos **apps** via `@markethub/api-client`. Como não há dep compartilhada, o contrato é mantido por convenção: ao mudar uma resposta/payload da API, atualizar **o backend e** `packages/types` juntos, e rodar `pnpm typecheck` na raiz.

## Validação recomendada

- `pnpm --filter @markethub/api prisma:generate` (se schema mudou) → `pnpm --filter @markethub/api typecheck`.
- `pnpm --filter @markethub/api build`.
- `pnpm --filter @markethub/api test` quando tocar lógica (specs em `*.spec.ts`).
- Migration: aplicar em banco local/teste antes de considerar pronto.
