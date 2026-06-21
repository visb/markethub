# MarketHub

Plataforma brasileira de marketplace + delivery de supermercados. Monorepo com backend NestJS,
apps mobile React Native (Expo) e painel admin Vite + React.

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **Backend:** NestJS + Prisma + PostgreSQL (`services/api`)
- **Mobile:** React Native / Expo — cliente, separador, entregador (`apps/customer|picker|driver`)
- **Admin:** Vite + React SPA (`apps/admin`)
- **Compartilhado:** `packages/types`, `packages/api-client`, `packages/ui`
- **Infra dev:** Docker (Postgres, Redis, MinIO)

## Estrutura

```
apps/        customer · picker · driver · admin
services/    api
packages/    types · api-client · ui
infra/       docker-compose, CI
stories/     roadmap e stories (flat: NN-slug.md; concluídas em done/)
briefing/    screenshots de referência
```

## Setup do zero

Pré-requisitos: Node >= 22, pnpm 11 (via corepack), Docker.

```bash
corepack enable
pnpm install
pnpm infra:up          # sobe Postgres, Redis, MinIO
cp .env.example .env   # ajustar variáveis
pnpm build
pnpm dev
```

## Scripts raiz

| Script | Ação |
|--------|------|
| `pnpm dev` | roda os apps em dev (Turbo) |
| `pnpm build` | build de todos os pacotes |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | checagem de tipos |
| `pnpm test` | testes |
| `pnpm format` | Prettier write |
| `pnpm infra:up` / `infra:down` | sobe/derruba serviços de infra |

## Roadmap

Ver `stories/ROADMAP.md`. Cada story em `stories/NN-slug.md` (flat); concluídas em `stories/done/`.
