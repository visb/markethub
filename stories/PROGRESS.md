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
| 73 | Cupons — título e descrição | — | todo |
| 74 | Cupons disponíveis no carrinho (seleção) | 73 | todo |
| 75 | Endereço — lat/lng exata ao salvar (provider Google) | — | todo |
| 76 | "Usar minha localização" — reverse geocode via backend | 75 | todo |
| 77 | Gorjeta individual por alvo (plataforma/entregador/mercado) | — | todo |
| 78 | Perfil — "Meus dados" e "Segurança" como itens de menu | — | todo |
| 79 | Driver /earnings — histórico respeita o filtro de período | — | todo |
| 80 | Busca no customer — sugestões ao digitar + tela de resultado | — | todo |

---

## Registro
