# SR.2 Cobertura de testes — unit + e2e
- **Fase:** 7
- **Epic:** Qualidade
- **Status:** todo
- **Depende de:** infra de teste (unidades A do PROGRESS.md)

## Objetivo
Levar o projeto de "só backend com 8 specs unitários, zero e2e" a uma suíte real: unit nos
caminhos críticos de todos os workspaces + e2e de backend (supertest) e dos frontends em
**modo web** (admin nativo; mobile via Expo web + Playwright).

## User story
Como mantenedor, quero rede de testes nos fluxos que importam (pricing, refund, picking,
checkout, auth, pix, mappers) para refatorar e evoluir sem medo de regressão.

## Estratégia de cobertura (pragmática)
Sem % global rígido. Priorizar:
- **Backend services** — regra de negócio: pricing, refund, weight-shortfall, picking,
  substitution, scheduling/capacity, auth/token, erp normalize, enrichment completeness.
- **Mappers / schemas zod / funções puras** em todos os workspaces.
- **Fluxos e2e** ponta a ponta nos caminhos de receita e operação.
- UI puramente apresentacional fica de fora.

## Infra (unidades A — fazer primeiro)
- [ ] A1 — API e2e: `jest-e2e.config.js` + `test/` (supertest, app bootstrap, test DB via
      Prisma, setup/teardown, helpers de auth/seed). Não tocar DB de dev.
- [ ] A2 — Admin: `vitest` + `@testing-library/react` + jsdom + `test` script no package.json.
- [ ] A3 — Mobile: `jest-expo` (preset) em customer/picker/driver + `test` script.
- [ ] A4 — Playwright: `playwright.config.ts` + start dos apps em modo web (admin + Expo web)
      + smoke spec por app.
- [ ] A5 — Wiring de coverage no turbo (`test` já existe; adicionar reporte por workspace).

## Critérios de aceite
- [ ] Cada unidade `C-*` do `PROGRESS.md` entregue com specs verdes e commit próprio.
- [ ] `pnpm test` (turbo) passa em todos os workspaces; e2e roda via script dedicado.
- [ ] Caminhos críticos da estratégia acima cobertos (unit + e2e).
- [ ] CI atualizado se necessário (sem quebrar o pipeline existente).

## Escopo / Fora de escopo
- Fora: e2e nativo mobile (Detox/Maestro) — fica para outra story; testes de carga; visual
  regression.

## Notas técnicas
- API e2e precisa de Postgres de teste — usar banco separado (env `DATABASE_URL` de teste) ou
  schema dedicado; nunca o banco de dev. Subir via `pnpm infra:up` se preciso.
- Mobile e2e roda contra `expo start --web`; Playwright aponta pro localhost do web build.
- Validação por unidade: `pnpm --filter <pkg> test` (+ `typecheck`). E2e api: script jest-e2e.
