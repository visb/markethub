# PROGRESS — rodada AUTORUN (cupons · endereço/geocode · gorjeta · perfil · driver · busca)

Ordem: 73 → 74 → 75 → 76 → 77 → 78 → 79 → 80   |   Branch base: main   |   Merge na main por unidade: sim
Deps rígidas: 73→74 (title/description do cupom)  ·  75→76 (provider Google atrás de GeocodingProvider). Cadeias independentes: 77, 78, 79, 80.
Cuidados da rodada:
- Migrations novas: 73 (coupons.title/description), 77 (TipItem + Tip.driverId nullable + backfill). Nunca editar migration aplicada; `prisma:generate` antes do typecheck.
- Contratos `packages/types` tocados em 73, 74, 75, 76, 77, 79, 80 → rebuild `@markethub/types` + `@markethub/api-client` quando o contrato mudar; backend NÃO importa `packages/types` (manter os dois lados).
- Credencial externa: `GOOGLE_MAPS_API_KEY` (75/76) e PIX Pagar.me (77) — implementar atrás de interface + mock nos testes; marcar PENDENTE-MANUAL a ativação com key real. Nunca chamar API real nem commitar segredo.
- Fronteiras de contexto (eslint): endpoint reverse-geocode (76) cross-context expõe via barrel público.

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 73 | Cupons — título e descrição | — | done |
| 74 | Cupons disponíveis no carrinho (seleção) | 73 | done |
| 75 | Endereço — lat/lng exata ao salvar (provider Google) | — | done |
| 76 | "Usar minha localização" — reverse geocode via backend | 75 | done |
| 77 | Gorjeta individual por alvo (plataforma/entregador/mercado) | — | done |
| 78 | Perfil — "Meus dados" e "Segurança" como itens de menu | — | done |
| 79 | Driver /earnings — histórico respeita o filtro de período | — | done |
| 80 | Busca no customer — sugestões ao digitar + tela de resultado | — | done |

---

## Registro

[OK] 73 — testes: api 1479, admin 188, merchant 323, types 46, api-client 70 — commit: ff845d1 — merge: 8eeefac — 2026-07-17
[OK] 74 — testes: api 1495, customer 315, types 50 — commit: 14a013f — merge: 2e5ab05 — 2026-07-17
[OK] 75 — testes: api 1508, customer 317 — commit: 82670af — merge: 12fc30e — 2026-07-18 — PENDENTE-MANUAL: ativar GEOCODING_PROVIDER=google + GOOGLE_MAPS_API_KEY real (provider mockado nos testes)
[OK] 76 — testes: api 1529, customer 317, api-client 70 — commit: b34f111 — merge: e20ccad — 2026-07-18 — PENDENTE-MANUAL: herda key Google da 75
[OK] 77 — testes: api 1542, customer 332, api-client 70 — commit: d169eb8 — merge: 9cdf8d5 — 2026-07-18 — migration TipItem+backfill aplicada; PIX via mock; +escopo: admin-dashboard/reviews-aggregate migrados a TipItem
[OK] 78 — testes: customer 341 — commit: 030756f — merge: f0ae80b — 2026-07-18 — só customer, sem backend
[OK] 79 — testes: api 1546, driver 166, api-client 70 — commit: c16b694 — merge: fafa78f — 2026-07-18 — bugfix histórico driver
[OK] 80 — testes: api 1553, customer 362, api-client 70 — commit: cf80685 — merge: fd60e97 — 2026-07-18

---

## Resumo final — rodada ENCERRADA (2026-07-18)

**8/8 done. Nenhuma bloqueada.** Todas mergeadas na main (--no-ff) e arquivadas em `stories/done/`.

| # | commit | merge | testes |
|---|--------|-------|--------|
| 73 | ff845d1 | 8eeefac | api 1479, admin 188, merchant 323, types 46, api-client 70 |
| 74 | 14a013f | 2e5ab05 | api 1495, customer 315, types 50 |
| 75 | 82670af | 12fc30e | api 1508, customer 317 |
| 76 | b34f111 | e20ccad | api 1529, customer 317, api-client 70 |
| 77 | d169eb8 | 9cdf8d5 | api 1542, customer 332, api-client 70 |
| 78 | 030756f | f0ae80b | customer 341 |
| 79 | c16b694 | fafa78f | api 1546, driver 166, api-client 70 |
| 80 | cf80685 | fd60e97 | api 1553, customer 362, api-client 70 |

**Migrations aplicadas:** 73 (coupons.title/description), 77 (TipItem + Tip.driverId nullable + backfill dos tips legados como item driver).

**PENDENTE-MANUAL (dep externa sem credencial):**
- **75/76 — Google Geocoding:** provider implementado atrás de `GeocodingProvider` + 100% mockado nos testes. Ativar em prod: `GEOCODING_PROVIDER=google` + `GOOGLE_MAPS_API_KEY=<key real>` (Geocoding API habilitada no Google Cloud). Sem a key, factory cai no Mock (dev) — seguro.
- **77 — PIX Pagar.me:** cobrança da gorjeta rodou via `PaymentProvider` mock; ativação real herda config PIX existente (`PAYMENT_PROVIDER`, `PAGARME_*`).

**Reproduzir gates (na raiz):**
```
pnpm --filter @markethub/api prisma:generate
pnpm --filter @markethub/types build && pnpm --filter @markethub/api-client build
pnpm typecheck && pnpm build
pnpm --filter @markethub/api test:coverage
pnpm --filter @markethub/customer test:coverage
pnpm --filter @markethub/driver test:coverage
pnpm --filter @markethub/admin test:coverage
pnpm --filter @markethub/merchant test:coverage
```

**Sem push, sem PR** (protocolo AUTORUN). Branches `story/73..80` preservadas. Serviços (docker infra) de pé.
Loop encerrado (cron `c8e45020` deletado).
