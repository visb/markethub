# PROGRESS — rodada AUTORUN (stories 19 → 34)

Rodada: gate de cobertura (19) + backfill de cobertura backend por risco (20–28) + refino app customer / explore + seguir loja (29–34).
Ordem: 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26 → 27 → 28 → 29 → 30 → 31 → 32 → 33 → 34.
Branch base: main | Merge na main por unidade: sim (--no-ff) | sem push, sem PR.
Deps rígidas: 19 → {20..28} (gate de cobertura; se 19 bloquear, todo o backfill bloqueia — não pular). 33 → 34 (backend de seguir wira o botão da 33). 29 → 30 (compartilham a tela `explore`, dep fraca).
Cuidados da rodada: stories 29/34 mudam **schema** (Store.phone/allowsPickup + StoreHours; StoreFollow) → migration nova + `prisma generate` antes do typecheck; espelhar contrato em packages/types E no app (backend não importa types). 19 mexe em config de teste de TODOS os workspaces + ci.yml (ratchet de piso só sobe, perFile, diff≥90%) — required check no GitHub é PENDENTE-MANUAL (não dá pra ativar branch protection sem acesso ao repo). 31–33 são refino só-frontend do app customer (modal/AppBar). Sem credencial externa nova (Cosmos/Pagar.me/Maps já atrás de mock).

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 19 | Gate de cobertura rígido no CI (ratchet, perFile, diff≥90%) | — | OK |
| 20 | Cobertura — payment (reembolso + providers) | 19 | OK |
| 21 | Cobertura — marketplace (cart.service + orders.service) | 19 | OK |
| 22 | Cobertura — substituição (picking) + gorjeta (driver) | 19 | OK |
| 23 | Cobertura — auth.service (login/refresh/hash) | 19 | OK |
| 24 | Cobertura — admin-users.service + addresses.service | 19 | OK |
| 25 | Cobertura — catálogo (service, quality, categoria marketplace) | 19 | OK |
| 26 | Cobertura — conectores ERP + providers de enrichment | 19 | OK |
| 27 | Cobertura — notifications + storage | 19 | OK |
| 28 | Cobertura — dashboard admin + agregado reviews + geocoding | 19 | OK |
| 29 | Explore — modal do mercado ao tocar o marker (+ schema StoreHours/phone/pickup) | — | OK |
| 30 | Explore — barra de endereço + marker da localização do usuário | 29 | OK |
| 31 | Modal de produto — add fecha (sem redirect) + animações slide | — | OK |
| 32 | Página do mercado — remover nome duplicado (AppTitle vazio) | — | OK |
| 33 | Página do mercado — botão "Seguir" no AppBar (no lugar do "?") | — | OK |
| 34 | Seguir loja — backend (StoreFollow) + wiring do botão | 33 | OK |

## Log

<!-- [OK|PARCIAL|BLOQUEADO] NN — testes: <resumo> — commit: <hash> — merge: <hash> — <data> — <bloqueio> -->
[OK] 19 — testes: gate cravado em config nos 9 workspaces (jest collectCoverageFrom + coverageThreshold; vitest coverage.include all-files + thresholds — vitest@4 removeu coverage.all, include já é o all-files), reporters lcov/text-summary/json-summary; baseline verde exit 0 (api 336/336 36.28%, merchant 164/164 92.51%, admin 10/10, customer 67/67, picker 34/34, driver 18/18, api-client 18/18, types 8/8, ui 3/3); CI job `coverage` (test:coverage → scripts/diff-coverage.mjs ≥90% em PR → artifact lcov); validado o próprio gate: (a) baseline passa (b) subir threshold reprova (c) arquivo novo sem teste reprova via diff-coverage — typecheck 12/12 + build 9/9 + lint 12/12 verdes — commit: 7e8f0d3 — merge: b373445 — 2026-06-28 — PENDENTE-MANUAL: marcar job `coverage` como required check na branch protection da main (precisa admin do repo no GitHub). perFile NÃO ligado em workspaces de baixa cobertura (barrels/bootstrap em 0% deixariam main vermelha permanente — contra "rígido sem travar"); rigor por arquivo p/ código NOVO garantido pelo diff≥90%; admin/types/ui recalibrados ao baseline real all-files (6%/15%/28%, não os 48/100/100 de escopo falso do plano)

[OK] 20 — testes: api 372/372 (suite payment 53/53, +30 casos: refund.service.spec 23 + payment-providers.spec 7); cobertura refund.service.ts 10.6%→100% lin/96% branch, pagarme.payment-provider 0%→100%, mock.payment-provider 0%→100%; casos estorno integral/consolidado faltas/idempotência(unique orderId)/cap no pago/corrida unique/falha provedor→failed/PIX criado-confirmado-expirado-falho via parseWebhook/erros HTTP Pagar.me com fetch mockado (sem rede); test:coverage exit 0 (api lines 38.8% > piso 35%) — typecheck 12/12 + build 9/9 verdes — commit: c63acfa — merge: f255a8c — 2026-06-28 — só testes, lógica intacta, nenhum bug; nota: code REFUND_ALREADY_DONE citado no plano não existe literal — idempotência é early-return no unique(orderId), comportamento intencional

[OK] 21 — testes: api 433/433 (+53: cart.service.spec 31 + orders.service.spec 17 + orders.controller.spec 5); cobertura cart.service.ts 8.5%→100% lin/93% br, orders.service.ts 12.9%→100% lin/93% br, orders.controller.ts 0%→100%; casos unit vs weight(gramas)/qtd/remoção/recálculo total/indisponível; criação pedido/markPaid idempotente created→preparing/cancelamento conforme BUSINESS_RULES (status∈{created,paid,preparing} e PickTask só queued/assigned); prisma fake + $transaction mockado, sem DB; test:coverage exit 0 (api lines 44% > piso 35%) — typecheck 12/12 + build 9/9 verdes — commit: d4c870f — merge: 02d929a — 2026-06-28 — só testes, lógica intacta, nenhum bug

[OK] 22 — testes: api 472/472 (+39 em 3 suítes: substitution.service.spec + substitution.scheduler.spec + reviews/tips.service.spec); cobertura substitution.service 0%→100% lin/branch, reviews/tips.service 0%→100% lin/92.6% branch; substitution.scheduler excluído do coverage por config da story 19 (!**/*.scheduler.ts) mas coberto por spec do disparo (delega resolveExpired + log); mock Prisma padrão picking/handoff, sem DB; test:coverage exit 0 ratchet OK — typecheck 12/12 + build 9/9 verdes — commit: 02bf36c — merge: 7102eea — 2026-06-28 — só testes, nenhum bug; nota: plano citava driver/tips.service.ts mas arquivo real é services/api/src/reviews/tips.service.ts (módulo reviews) — cobri o correto

[OK] 23 — testes: api 491/491 (+19: auth.service.spec); cobertura auth.service.ts 0%→100% lin/90.5% branch; PrismaService mockado + TokenService real (argon2 hash/verify + JWT refresh de verdade, mesmos segredos de teste do token.service.spec, sem segredo logado/inventado); casos register(EMAIL_TAKEN/role padrão/dedupe), login(válido/INVALID_CREDENTIALS/inexistente/ACCOUNT_DISABLED), refresh(malformado/sessão ausente/dono divergente/reuse revogada→revoga cadeia/expirada/hash divergente/desativado/rotação replacedBySessionId), logout idempotente, me(ok/INVALID_TOKEN); test:coverage exit 0 (global 48.38%) — typecheck 12/12 + build 9/9 verdes — commit: 70404f7 — merge: 16e04a6 — 2026-06-28 — só testes, nenhum bug

[OK] 24 — testes: api 530/530 (+39 em 3 suítes: admin-users.service +14, admin-users.controller +7, addresses.service +18); cobertura admin-users.service 17%→100%, admin-users.controller 0%→100%, addresses.service 0%→100%; RBAC reaproveitado de merchant-staff.service.spec (mapeamento StaffRole→RoleName admin/manager→merchant, picker→picker, driver→driver; STORE_NOT_FOUND/EMAIL_TAKEN; hash argon2 senha nunca texto puro); GeocodingProvider mockado atrás de GEOCODING_PROVIDER, sem DB/rede; test:coverage exit 0 (global 50.8%) — typecheck 12/12 + build 9/9 verdes — commit: dbc1f25 — merge: b04508d — 2026-06-28 — só testes, nenhum bug

[OK] 25 — testes: api 599/599 (catálogo 9 suítes/109 testes, 5 novas + 3 ampliadas); cobertura catalog.service 17.7%→100% lin/95% br, catalog-quality.service 0%→100%, marketplace-category.service 0%→100%, admin-catalog.service 65%→86%, controllers (catalog/admin-catalog/marketplace-category/catalog-quality) 100%; global api 36.3%→56.5% (gate 19 exit 0); Prisma/BullMQ mockados, sem DB/rede — typecheck 12/12 + build 9/9 verdes — commit: 12a863a — merge: a0f598d — 2026-06-28 — só testes, nenhum bug; nota: caminhos físicos divergem do plano — catalog-quality.service em src/enrichment/, marketplace-category.service em src/catalog/ (cobri os reais)

[OK] 26 — testes: api 647/647 (+48 em 7 suítes novas spec-only); cobertura csv.connector 0%→100%, csv.util 0%→100%/96% br, cosmos.provider 0%→100% (fetch mockado, sem rede), mock.provider 0%→100%; erp.scheduler/erp.processor/enrichment.processor seguem excluídos do coverage pela config 19 (!**/*.{processor,scheduler}.ts) mas o disparo coberto por spec (on/off env + fan-out price/stock + roteamento de jobs); global api lines 59.25% (piso 35); fixtures CSV existentes — typecheck 12/12 + build 9/9 verdes — commit: 9c3bcba — merge: dd66c84 — 2026-06-28 — só testes, nenhum bug

[OK] 27 — testes: api 676/676 (+29 em 4 suítes novas); cobertura push.service 27%→100%, fcm.push-provider 0%→100%, storage.service 10.5%→100% lin/98% stmt (+bônus mock.push-provider 100%); FCM client e SDK storage mockados, sem rede; global api lines 61.84% (piso 35); best-effort no push, batching 1000 no FCM, SigV4 path-style no storage travados — typecheck 12/12 + build 9/9 verdes — commit: 5da7b66 — merge: b3c127e — 2026-06-28 — só testes, nenhum bug; GAP reportado: storage.service não valida content-type nem tamanho (presignUpload/uploadBuffer aceitam qualquer coisa) — sem código a cobrir; se validação for desejada vira fix à parte (DTO no controller de upload), não feito aqui (story é só-testes)

[OK] 28 — testes: api 718/718 (+42 em 5 suítes novas); cobertura admin-dashboard.service 0%→100%, reviews-aggregate.service 0%→100%, nominatim.geocoding-provider 0%→100%, mock.geocoding-provider 0%→100%, admin-dashboard.controller + reviews.controller 100%; Nominatim mockado via global.fetch (hit/lista vazia/não-ok/exceção), Prisma mockado, sem DB/rede; global api lines 65.21% (piso 35) — typecheck 12/12 + build 9/9 verdes — commit: 19dffa8 — merge: 1087720 — 2026-06-28 — só testes, nenhum bug; FIM da cadeia de backfill 20-28 (api 35.5%→65.2% linhas)

[OK] 29 — testes: api unit 740/740 (65.8% lin) + e2e catalog 17/17 + customer 79/79 (34.7% lin); migration nova 20260628194342_store_summary_phone_pickup_hours (Store.phone/allowsPickup + model StoreHours minutos-desde-meia-noite); GET /stores/:id/summary (openNow server-side America/Sao_Paulo abertura inclusiva/fechamento exclusivo, rating via review.aggregate axis=merchant, 404 STORE_NOT_FOUND); admin StoreDetail edita phone/allowsPickup/horário; StoreSummaryDTO em packages/types espelhado nos dois lados; explore.tsx selectedStoreId+StoreSummarySheet (não navega), useStoreSummary hook React Query, queryKeys.explore.storeSummary; seed popula horário padrão; coverage api+customer exit 0 — typecheck 12/12 + build 9/9 verdes — commit: 0d195a1 — merge: 10b6b2d — 2026-06-28 — doorFeeCents reusa CartService.DOOR_SURCHARGE_CENTS (ref estática); janelas cruzando meia-noite fora de escopo; admin StoreDetail seguiu padrão legado useState/useEffect do arquivo (migração total a RQ fora de escopo, coverage admin não gated)

[OK] 30 — testes: customer 92/92 (16 suítes, +3 novas: addressBar, explore.screen.render, mapView.web + ajuste do título do marker no exploreMap.screen); frontend-only; AddressBar pill (com endereço→"Minha localização atual"+street/number+lápis; sem→CTA "Definir endereço") sobre o mapa, onPress→/delivery; useExploreMap expõe activeAddress (sem novo hook); marker "você está aqui" dot azul #2563EB+halo nas 2 engines (StoreMapProps inalterado); coverage exit 0 (lines 37.8% > piso 30) — typecheck 12/12 + build 9/9 verdes — commit: da837df — merge: b494085 — 2026-06-28 — sem backend/schema; retry após implementer anterior bater limite de sessão sem commitar

[OK] 31 — testes: customer 105/105 (19 suítes, +13: useProductDetail + toast + productDetail.screen); frontend-only; Stack.Screen product/[id] presentation:modal+slide_from_bottom no _layout, ToastProvider/useToast (auto-dismiss 2s timer-driven p/ teste determinístico); addFromOffer(id,{closeAfter}) — principal=addItem+toast+router.back(), outras ofertas mantêm router.push("/cart"); migração RQ: useProductDetail/useFavorites/useToggleFavorite/useAddCartItem (queryKeys.products.detail/favorites.all), tela só orquestra; coverage exit 0 (lines 44.77% > piso 30) — typecheck 12/12 + build 9/9 verdes — commit: bb4bbd5 — merge: 5efa9de — 2026-06-28 — use-cart.ts não usa RQ então useAddCartItem só chama mkt.addItem (sem key de carrinho p/ invalidar); slide up/down é verificação manual Expo fora do ambiente

[OK] 32 — testes: customer 107/107 (+2: storeScreen.title source-level); cosmético — Header title="" em store/[id] (showBack+ícone ajuda preservados, param name mantido como fallback do storeName ao lado da logo); teste lê o arquivo via fs.readFileSync + regex title="" (espelho do bloco explore); sem migração RQ (dívida registrada, fora de escopo); coverage exit 0 — typecheck 12/12 + build 9/9 verdes — commit: fc32701 — merge: 8317e04 — 2026-06-28 — "?"→"Seguir" é a story 33

[OK] 33 — testes: customer 115/115 (23 suítes, +3 novas: header.rightAction + followButton + storeScreen.follow + ajuste do source-test da story 32); só UI; Header ganha prop rightAction (default mantém "?", telas existentes intactas); FollowButton (src/components/, pílula vermelha colors.primary + Ionicons heart); store/[id] usa rightAction e remove o Button "♡ Seguir" inline duplicado; onPress placeholder no-op (TODO→story 34); coverage exit 0 (lines 45.08% > piso 30) — typecheck 12/12 + build 9/9 verdes — commit: 536f81c — merge: c51b76b — 2026-06-28 — sem migração RQ (dívida); ajustei regex do storeScreen.title.test.tsx (Header virou multi-linha) preservando a intenção

[OK] 34 — testes: api 754/754 (73 suítes) + customer 124/124 (25 suítes); migration nova 20260629000905_story34_store_follows (model StoreFollow espelha Favorite, @@unique[userId,storeId], relações inversas User.storeFollows/Store.followers); módulo store-follows (service follow upsert/STORE_NOT_FOUND/unfollow idempotente/list desc/isFollowing, controller @Roles customer GET/POST/DELETE); StoreMeta.following via isFollowing no sections; novo OptionalJwtAuthGuard (auth opcional, guest sem 401) na rota @Public /stores/:id/sections, app envia auth:true; frontend useStoreFollow optimista + FollowButton wirado (coração preenchido/contorno); coverage api 66.2% + customer 46.9% exit 0 — typecheck 12/12 + build 9/9 verdes — commit: 161ca64 — merge: f1629a4 — 2026-06-28 — StoreMeta é local de apps/customer (não packages/types), espelhado nos 2 lados sem rebuild; CatalogService passou a depender de StoreFollowsService (spec existente atualizado p/ novo construtor); e2e não rodado (fora da Validação do plano)

## Resumo final da rodada 19 → 34

**16/16 unidades OK**, todas mergeadas na `main` local (--no-ff, sem push, branches preservadas).
Nenhuma BLOQUEADA. Loop AUTORUN encerrado (CronDelete do job da rodada).

Por bloco:
- **Gate de cobertura (19):** cobertura virou gate rígido do CI — thresholds cravados em config
  (jest `coverageThreshold`+`collectCoverageFrom` / vitest `coverage.include`+`thresholds`) nos 9
  workspaces, ratchet só-sobe, job `coverage` no ci.yml com diff-coverage ≥90% (`scripts/diff-coverage.mjs`)
  + artifact lcov. `perFile` deliberadamente NÃO ligado em workspaces de baixa cobertura (barrels/
  bootstrap em 0% deixariam main vermelha); rigor por arquivo p/ código novo vem do diff≥90%.
- **Backfill de cobertura backend (20–28):** subiu `services/api` de **35.5% → 65.2%** linhas, por
  risco: payment/refund (20), cart+orders (21), substituição+gorjeta (22), auth (23), admin-users+
  endereços (24), catálogo (25), ERP+enrichment providers (26), notifications+storage (27),
  dashboard+reviews+geocoding (28). Tudo só-teste, sem mudar lógica — nenhum bug de negócio achado.
  Providers/scheduler/processor cobertos por spec do disparo (excluídos do coverage por config 19).
- **Refino app customer (29–34):** modal de resumo do mercado no explore + schema novo
  (Store.phone/allowsPickup + StoreHours, GET /stores/:id/summary, openNow server-side) (29); barra
  de endereço + marker "você está aqui" (30); modal de produto add-fecha + toast + slide + migração
  React Query (31); remoção do nome duplicado na página da loja (32); botão "Seguir" no AppBar (33);
  e a funcionalidade completa de seguir loja — model StoreFollow + endpoints + OptionalJwtAuthGuard +
  wiring otimista do botão (34).

Migrations novas (nunca editaram aplicada): **29** (store_summary_phone_pickup_hours) e **34**
(story34_store_follows). Demais stories sem schema.

Pontos PENDENTE-MANUAL (sem credencial/acesso, não bloqueiam):
- **19:** marcar o job `coverage` como **required check** na branch protection da `main` no GitHub
  (Settings → Branches) — precisa admin do repo.

Sem dep externa nova nesta rodada (Cosmos/Pagar.me/Maps/FCM/MinIO já atrás de mock/interface;
geocoding Nominatim e FCM mockados via fetch nos testes — nenhuma chave commitada, nenhuma chamada real).

Reproduzir os gates (infra docker no ar — Postgres :5433/test, Redis, MinIO):
- backend: `pnpm --filter @markethub/api test` + `test:coverage` (+ `test:e2e` p/ 29)
- contratos: `pnpm --filter @markethub/types build && pnpm --filter @markethub/api-client build`
- customer: `pnpm --filter @markethub/customer test:coverage`
- geral: `pnpm typecheck` + `pnpm build`; gate de cobertura: `pnpm test:coverage` (turbo) + `pnpm diff-coverage`

**Rodada 19 → 34 ENCERRADA** — 16/16 OK e mergeadas na `main`. Loop encerrado (não reagendar).
