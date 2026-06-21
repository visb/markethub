# PROGRESS — rodada AUTORUN (stories 01 → 13)

Rodada: picker (01–03) + explore mapa (04–06) + app merchant (07–13).
Ordem numérica 01 → 13 (satisfaz todas as deps — ver AUTORUN.md "Ordem e dependências").
Fonte de verdade p/ retomar: **git log + este arquivo**. Story com `feat(story-NN)` = feita; pular.

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 01 | Picker: pedidos `queued` no topo da fila | — | OK |
| 02 | Picker: fila atualiza em tempo real (`subscribe:store`) | 01* | OK |
| 03 | Picker: autocomplete de substituto + migração da tela p/ React Query | 02 | OK |
| 04 | Backend: `GET /stores/nearby` por viewport (bbox) | — | OK |
| 05 | Customer: aba explore vira mapa de mercados (base) | 04 | OK |
| 06 | Customer: explore — mercados sob demanda por viewport + loading | 05, 04 | OK |
| 07 | App merchant: scaffold (Vite SPA + auth + shell + `merchant/context` + `can`) | — | OK |
| 08 | App merchant: CRUD de lojas | 07 | OK |
| 09 | App merchant: configuração de integração (ERP, api-keys, webhooks) | 07 | TODO |
| 10 | App merchant: cadastro de colaboradores (StoreStaff) | 07 | TODO |
| 11 | App merchant: visualizar e gerenciar catálogo | 07, 08 | TODO |
| 12 | App merchant: pedidos e status em tempo real | 07 | TODO |
| 13 | App merchant: relatórios | 07 | TODO |

\* 02 só toca a mesma fila da 01 (dep fraca); 03 depende rígido da 02.

## Log

<!-- [OK|PARCIAL|BLOQUEADO] NN — testes: <resumo> — commit: <hash> — merge: <hash> — <data> — <bloqueio> -->
[OK] 01 — testes: picking.service.spec (12/12, suite api 199/199, coverage gate verde) — commit: 5f85276 — merge: 3904eac — 2026-06-21 —
[OK] 02 — testes: api-client 18/18 (+subscribeStore), picker 16/16 (usePickQueue realtime/polling/cleanup; coverage usePickQueue 97%), typecheck+build verdes — commit: 24c756d — merge: fc6711b — 2026-06-21 —
[OK] 03 — testes: picker 34/34 (useDebouncedValue fake-timers, useSubstituteSearch gate≥2/debounce, todas as mutations invalidam pick.task; novos arquivos 100% cov), typecheck+build verdes — commit: f75e836 — merge: 1338577 — 2026-06-21 —
[OK] 04 — testes: api unit 206/206 (+7: catalog.service.spec bbox/cap/order, catalog.controller.spec INVALID_BOUNDS), e2e 38/38 (+4: nearby in-box/null/inativa, routing, 400), coverage gate exit=0, typecheck+build verdes — commit: c6da560 — merge: 5a68159 — 2026-06-21 —
[OK] 06 — testes: customer 67/67 (+9: mapRegion deltas pequenos/grandes, MapLoadingBadge render+pointerEvents, useExploreMap.viewport recarga por bounds/debounce uma chamada/fetching/keepPreviousData; coverage gate exit=0, hooks+useDebouncedValue+MapLoadingBadge 100%), typecheck+build verdes — commit: f39e403 — merge: 60df9f2 — 2026-06-21 — mapa nativo onRegionChangeComplete e web Leaflet moveend/zoomend (ViewportWatcher) nao exercitados em jest (mesmo gap da story 05); sem chamada a API real
[OK] 07 — testes: merchant 27/27 (coverage gate verde, ~90% stmts; can()/Layout/RequireCapability nav gating, useMerchantContext enabled, auth-context owner/manager/forbidden, Login rhf+zod), api 210/210 (+4 getContext) + e2e 42/42 (+4 /merchant/context owner/manager/403/401), typecheck+build verdes — commit: 35061d6 — merge: ce6609c — 2026-06-21 — lint pre-existente vermelho em reviews/merchant-product .spec (BadRequestException unused; nao tocado por mim)
[OK] 08 — testes: merchant 41/41 (coverage gate exit=0; useStores invalida stores/create/update, StoreForm rhf+zod validacao+toStorePayload, Stores list/can gating/criar/editar+erro), api unit 224/224 (+14: merchant.service.spec store CRUD owner/manager/geocode/override/soft-toggle), e2e 48/48 (+6: POST/PATCH/detail/403/401), typecheck+build verdes — commit: 983f974 — merge: 5261b6b — 2026-06-21 — geocode via MockGeocodingProvider (mock dev, sem chamada externa)
[OK] 05 — testes: customer 58/58 (+30: mapRegion centro GPS→endereço→padrão/bounds/endereço ativo, useNearbyStores bounds+enabled, useExploreMap orquestração+pin destino, StoreMap nativo coords, marketplace bbox; coverage gate exit=0, novos hooks+mapRegion 100%), typecheck+build verdes — commit: de39764 — merge: 6ebb650 — 2026-06-21 — mapa nativo react-native-maps usa GOOGLE_MAPS_API_KEY do ambiente (sem key commitada); web usa Leaflet/OSM (sem key) — sem chamada a API real

## Resumo final da rodada

_(preencher ao encerrar — ver AUTORUN.md "Ao terminar")_
