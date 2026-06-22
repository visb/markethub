# PROGRESS — rodada AUTORUN (stories 14 → 18)

Rodada: veículos (14–15) + RBAC merchant (16–18).
Ordem numérica 14 → 18 (satisfaz todas as deps — ver AUTORUN.md "Ordem e dependências").
Fonte de verdade p/ retomar: **git log + este arquivo**. Story com `feat(story-NN)` = feita; pular.

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 14 | App merchant: cadastro de veículos de entrega (model `Vehicle` por rede) | — | OK |
| 15 | App entregador: seleciona veículo no login + indicador na home | 14 | — |
| 16 | App merchant: novo `StaffRole admin` + resolução de nível | — | — |
| 17 | App merchant: gerente restrito à loja atribuída + sem integração | 16 | — |
| 18 | App merchant: gerente cria só nível inferior (picker, driver) | 16 | — |

## Log

<!-- [OK|PARCIAL|BLOQUEADO] NN — testes: <resumo> — commit: <hash> — merge: <hash> — <data> — <bloqueio> -->
[OK] 14 — testes: api unit 307/307 (+19: merchant-vehicles.service.spec resolve merchantId do contexto/escopo/placa inválida/ambígua, PATCH parcial/soft toggle, hard delete VEHICLE_IN_USE vs sem entregas, VEHICLE_NOT_FOUND; serviço 94% stmts) coverage gate exit=0; api e2e 85/85 (+7: cadastro placa normalizada/INVALID_PLATE/lista escopo da rede/PATCH+soft toggle/VEHICLE_IN_USE/hard delete/401); merchant 159/159 (+17: useVehicles hooks invalidam queryKeys.vehicles, VehicleForm rhf+zod placa/tipo, Vehicles lista/criar/editar/toggle/excluir) coverage gate verde; typecheck+build verdes — commit: 37e08b4 — merge: c6c0838 — 2026-06-22 — Vehicle pertence à rede (merchantId resolvido pelo backend, nunca do body); Delivery.vehicleId adicionado p/ histórico/guard VEHICLE_IN_USE (consumido pela story 15)

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
| 09 | App merchant: configuração de integração (ERP, api-keys, webhooks) | 07 | OK |
| 10 | App merchant: cadastro de colaboradores (StoreStaff) | 07 | OK |
| 11 | App merchant: visualizar e gerenciar catálogo | 07, 08 | OK |
| 12 | App merchant: pedidos e status em tempo real | 07 | OK |
| 13 | App merchant: relatórios | 07 | OK |

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
[PENDENTE-MANUAL] 09 — testes: merchant 61/61 (coverage gate exit=0, ~91% stmts; Integration abas, ApiKeysPanel/WebhooksPanel/ErpConfigPanel rhf+zod+modais revelação 1x, useIntegration hooks invalidam queryKeys), api unit 253/253 (+29: integration.crypto vetor HMAC/hash, integration.service ERP mascarado/merge-segredo/api-key hash/webhook CRUD/emit best-effort/deliver retry, owner-only) + e2e 58/58 (+10: ERP put/get mascarado/PATCH preserva segredo/400, api-key revela 1x só hash/revoga, webhook revela secret 1x/mascara/evento inválido/testar, manager 403, 401), typecheck+build verdes — commit: 3c56321 — merge: d25cb19 — 2026-06-21 — disparo HTTP real de webhook em produção é PENDENTE-MANUAL (sem endpoint externo): lógica+assinatura HMAC+entrega via BullMQ testadas com WebhookSender mockado, sem chamada a URL real
[OK] 10 — testes: merchant 82/82 (coverage gate exit=0, ~91% stmts; +StaffForm rhf+zod validação/papel manager oculto p/ gerente, useStaff hooks invalidam queryKeys.staff, página Staff lista/filtro por loja/manager não gere gerente/owner hard delete/toggle), api unit 268/268 (+15: merchant-staff.service escopo owner/manager/papel/soft-vs-hard/NotFound; serviço 92% cov) + e2e 67/67 (+8: owner cria picker/manager, manager picker mas manager→403, fora de escopo→403, EMAIL_TAKEN, lista escopo, PATCH active=false mantém User, owner hard delete, manager hard→403, 401), typecheck+build verdes — commit: 6e2524b — merge: 355babb — 2026-06-22 — completei: nada implementado faltava no core, mas (a) movi as rotas de staff p/ MerchantStaffController dedicado SEM @Roles de classe (estavam em MerchantController @Roles("merchant","admin") → manager era 403 antes de chegar no service; 4 e2e falhavam) e (b) adicionei os testes de frontend que faltavam (StaffForm/useStaff/Staff)
[OK] 11 — testes: merchant 116/116 (coverage gate exit=0, ~89% stmts; useCatalog hooks aplicam filtros/storeId e mutations salvam só o diff + invalidam queryKeys.catalog.{offers,stocks}, buildOfferDiff/toCreateProductInput puros, OfferForm/ProductForm rhf+zod+validação+upload presigned, página Catalog abas Ofertas/Estoque, filtro loja/busca/disponibilidade, edição PATCH parcial, badge lockedFields + destravar offer/stock), typecheck+build verdes — commit: e9cd4f2 — merge: bc29448 — 2026-06-22 — faceta só frontend (backend merchant/offers,stocks,products + api-client já existiam de S3.9/S3.10); upload de imagem usa fluxo presigned (StorageService/MinIO) sem chamada externa
[OK] 12 — testes: api unit 280/280 (+12: order.events.spec, picking.gateway.spec canAccessStore dono/staff/nega, merchant-orders.service.spec escopo owner/manager/filtro/403, handoff.spec emite status_changed) coverage gate exit=0; api e2e 71/71 (+4: GET merchant/orders owner snapshot/filtro status/manager fora de escopo 403/401); merchant 127/127 (+11: useMerchantOrders snapshot/subscribe:store/invalida no evento/fallback/cleanup/enabled, Orders board+filtro+vazio+reconectando, groupByStatus) coverage gate exit=0; api-client 18/18; typecheck+build verdes — commit: 1eff2cf — merge: 8151b63 — 2026-06-22 — realtime reusa contratos de packages/types (order.created/status_changed) emitidos pelo MESMO ponto do webhook (story 09); GET merchant/orders em controller dedicado sem @Roles de classe (manager alcança a rota, escopo reforçado no service); socket testado com fake client (sem rede)
[OK] 05 — testes: customer 58/58 (+30: mapRegion centro GPS→endereço→padrão/bounds/endereço ativo, useNearbyStores bounds+enabled, useExploreMap orquestração+pin destino, StoreMap nativo coords, marketplace bbox; coverage gate exit=0, novos hooks+mapRegion 100%), typecheck+build verdes — commit: de39764 — merge: 6ebb650 — 2026-06-21 — mapa nativo react-native-maps usa GOOGLE_MAPS_API_KEY do ambiente (sem key commitada); web usa Leaflet/OSM (sem key) — sem chamada a API real
[OK] 13 — testes: api unit 288/288 (+8: merchant-reports.service.spec sales escopo/período/ticket/payout/reembolso-failed, operations contagens, top-products ordem/limit, reviews média+escopo merchant) coverage gate exit=0 (reports.service 96% stmts/100% funcs); api e2e 78/78 (+7: sales agrega pagos/período filtra/operations/top-products/reviews/manager alcança rota+loja fora 403/401); merchant 142/142 (+15: useReports repassa filtros/query key/enabled, reportPeriod presets+dayToIso, Reports renderiza 4 seções/troca loja/custom/gerente 1 loja sem seletor/vazio) coverage gate exit=0; api-client 18/18; typecheck+build verdes — commit: 433486a — merge: 6755ca7 — 2026-06-22 — relatórios são agregação de leitura (sem schema); reviews escopadas por targetMerchantId das redes do usuário (Review não tem store); reusa a forma das agregações do admin-dashboard.service sem chamada externa

## Resumo final da rodada

Todas as 13 stories da rodada (picker 01–03, explore mapa 04–06, app merchant
07–13) estão **OK** e mergeadas na `main` local (sem push, branches preservadas).
A 09 ficou **OK com ponto PENDENTE-MANUAL**: disparo HTTP real de webhook em
produção depende de endpoint externo (lógica + assinatura HMAC + entrega via
BullMQ testadas com sender mockado). Nenhuma story BLOQUEADA.

Pontos sem credencial resolvidos via mock/interface (não bloquearam): Pagar.me,
Cosmos/Bluesoft, Google Maps (mapa nativo usa env; web usa Leaflet/OSM), push
FCM/APNs, MinIO (upload presigned), webhooks. Nenhuma chave commitada, nenhuma
chamada a API externa real.

Reproduzir os gates por área:
- backend: `pnpm --filter @markethub/api test` + `test:e2e` (gate `test:coverage`)
- api-client: `pnpm --filter @markethub/api-client test`
- picker/customer/merchant: `pnpm --filter @markethub/<app> test` (gate `test:coverage`)
- geral antes de pronto: `pnpm typecheck` + `pnpm build`

Lint do `@markethub/api` agora **verde**: removidos os unused imports em
`services/api/src/{reviews/reviews.service.spec, merchant/merchant-product.service.spec,
merchant/merchant-staff.service.spec}.ts` (commit `78b1f7f` na main; 2 eram
pré-existentes, 1 introduzido pela story 10).

Serviços de pé: docker infra (Postgres :5433/test, Redis, MinIO).
