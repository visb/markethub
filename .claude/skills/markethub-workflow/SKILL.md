---
name: markethub-workflow
description: Fluxo de trabalho do monorepo MarketHub — comandos pnpm/turbo por tipo de mudança, o que rodar para validar antes de declarar pronto (typecheck/build/test, prisma generate/migrate), como subir cada app em dev, convenção de commits (Conventional Commits pt-BR com escopo de story) e fluxo de stories (flat em stories/NN-slug.md). Use ao rodar comandos, validar mudanças, decidir o que testar ou escrever commits neste repo.
---

# Fluxo de trabalho MarketHub para IA

Monorepo Turborepo + pnpm. Tudo a partir da **raiz**; filtra workspace com `--filter @markethub/<pkg>`. Nomes: `@markethub/{customer,picker,driver,admin,api,api-client,types,ui}`.

## Subir em dev

```bash
pnpm infra:up                 # Postgres, Redis, MinIO (docker) — antes de subir a API
pnpm dev                      # todos (turbo)
pnpm dev:api                  # backend  → http://localhost:3000
pnpm dev:admin                # admin    → http://localhost:5173 (vite)
pnpm dev:customer             # Expo (QR no terminal)
pnpm dev:picker / dev:driver  # Expo
pnpm infra:down               # derruba infra
```

## Validação por tipo de mudança

Rodar **antes** de declarar pronto. Não confiar só em ler o diff.

| Mudou… | Rodar |
|---|---|
| **Schema Prisma** | `pnpm --filter @markethub/api prisma:generate` → `prisma:migrate` (cria migration) → `pnpm --filter @markethub/api typecheck` |
| **Backend** (lógica/módulo) | `pnpm --filter @markethub/api typecheck` + `pnpm --filter @markethub/api build` + `pnpm --filter @markethub/api test` (se tocou lógica) |
| **Admin** (`apps/admin`) | `pnpm --filter @markethub/admin build` (tsc + vite) |
| **Mobile** (`customer/picker/driver`) | `pnpm --filter @markethub/<app> exec tsc --noEmit` ou subir `pnpm dev:<app>` (sem build de produção no fluxo dev) |
| **`packages/types`** | consumidores backend+front; `pnpm typecheck` na raiz. Mobile: reiniciar dev server (Metro transpila do source) |
| **`packages/api-client`** | garantir re-export dos tipos públicos; `pnpm typecheck` |
| **Cross-cutting / não sei** | `pnpm typecheck && pnpm build` na raiz (turbo cobre os workspaces) |

Ordem de ouro p/ backend após schema: **`prisma:generate` SEMPRE antes** de typecheck/build — o client gerado é importado em todo o backend.

## Scripts da API (`@markethub/api`)

`build` (nest build) · `dev` (nest start --watch) · `start` · `lint` · `typecheck` (tsc --noEmit) · `test` (jest) · `prisma:generate` · `prisma:migrate` (migrate dev) · `prisma:seed` / `db:seed` (ts-node prisma/seed.ts).

## Validação raiz

`pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm test` · `pnpm format` (prettier write) / `format:check`.

## Migrations (Prisma)

- Criar: `pnpm --filter @markethub/api prisma:migrate` (nomear pela mudança). Migrations em `services/api/prisma/migrations/`.
- **Nunca editar migration já aplicada** — criar nova.
- Aplicar em banco local/teste antes de considerar pronto. CI roda `prisma migrate deploy`.
- Seed após reset: `pnpm --filter @markethub/api db:seed`.

## Commits

**Conventional Commits, em pt-BR**, escopo = story ou área:

```
feat(S6.2): endereço automático no boot da Home + skeletons do feed
fix(admin): PATCH só de campos alterados no ProductDetail
refactor: move api de apps/api para services/api
docs(S6): fase 6 — refinamento do app cliente
```

- Tipos: `feat · fix · refactor · docs · chore · test`.
- Escopo: código da story (`S6.4`), app/área (`admin`, `S5.8`) ou vazio p/ mudança ampla.
- Assunto curto e imperativo; corpo só quando o "porquê" não é óbvio.
- **Commit/push só quando o usuário pedir.** Não misturar mudança não relacionada no mesmo commit.
- Histórico do repo commita direto em `main` — confirmar antes de assumir branch/PR.

## Fluxo de stories

- Stories flat em `stories/NN-slug.md` (numeração sequencial de 2 dígitos); cada story = `.md` com objetivo + checklist. Concluídas vão para `stories/done/` (flat, `git mv`) — **não** agrupar por `phase-NN`. Roadmap: `stories/ROADMAP.md`. (Stories legadas em `stories/phase-*` / `stories/done/phase-*` ficam onde estão.)
- Antes de codar a feature: ler a story correspondente. Ao concluir: marcar checklist + registrar arquivos tocados na story.
- Regra de domínio (status, cancelamento, reembolso, picking, delivery, lockedFields): conferir **`BUSINESS_RULES.md`** antes de mexer.

## CI (`.github/workflows/ci.yml`)

`install → prisma generate → lint → typecheck → build → migrate deploy → test`. Filtros usam **nome** do workspace (`--filter @markethub/api`), não path — mover pastas não quebra CI desde que o nome do pacote não mude.

## Armadilhas

- **`P1001` (Prisma) no Windows:** Docker healthy mas port-forward cai → `docker restart` do Postgres.
- **pnpm + build scripts:** aprovar no `pnpm-workspace.yaml` (`allowBuilds`: prisma, @prisma/client, @prisma/engines, argon2, msgpackr-extract). Sem isso `pnpm install` falha com `ERR_PNPM_IGNORED_BUILDS`.
- **Mudou `packages/*` e o mobile não reflete:** reiniciar o dev server do app (Metro transpila do source).
