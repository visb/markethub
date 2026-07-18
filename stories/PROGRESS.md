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
| 76 | "Usar minha localização" — reverse geocode via backend | 75 | todo |
| 77 | Gorjeta individual por alvo (plataforma/entregador/mercado) | — | todo |
| 78 | Perfil — "Meus dados" e "Segurança" como itens de menu | — | todo |
| 79 | Driver /earnings — histórico respeita o filtro de período | — | todo |
| 80 | Busca no customer — sugestões ao digitar + tela de resultado | — | todo |

---

## Registro

[OK] 73 — testes: api 1479, admin 188, merchant 323, types 46, api-client 70 — commit: ff845d1 — merge: 8eeefac — 2026-07-17
[OK] 74 — testes: api 1495, customer 315, types 50 — commit: 14a013f — merge: 2e5ab05 — 2026-07-17
[OK] 75 — testes: api 1508, customer 317 — commit: 82670af — merge: 12fc30e — 2026-07-18 — PENDENTE-MANUAL: ativar GEOCODING_PROVIDER=google + GOOGLE_MAPS_API_KEY real (provider mockado nos testes)
