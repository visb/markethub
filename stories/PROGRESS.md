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
| 30 | Explore — barra de endereço + marker da localização do usuário | 29 | todo |
| 31 | Modal de produto — add fecha (sem redirect) + animações slide | — | todo |
| 32 | Página do mercado — remover nome duplicado (AppTitle vazio) | — | todo |
| 33 | Página do mercado — botão "Seguir" no AppBar (no lugar do "?") | — | todo |
| 34 | Seguir loja — backend (StoreFollow) + wiring do botão | 33 | todo |

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

---

# PROGRESS — rodada AUTORUN (stories 14 → 18)

Rodada: veículos (14–15) + RBAC merchant (16–18).
Ordem numérica 14 → 18 (satisfaz todas as deps — ver AUTORUN.md "Ordem e dependências").
Fonte de verdade p/ retomar: **git log + este arquivo**. Story com `feat(story-NN)` = feita; pular.

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 14 | App merchant: cadastro de veículos de entrega (model `Vehicle` por rede) | — | OK |
| 15 | App entregador: seleciona veículo no login + indicador na home | 14 | OK |
| 16 | App merchant: novo `StaffRole admin` + resolução de nível | — | OK |
| 17 | App merchant: gerente restrito à loja atribuída + sem integração | 16 | OK |
| 18 | App merchant: gerente cria só nível inferior (picker, driver) | 16 | OK |

## Log

<!-- [OK|PARCIAL|BLOQUEADO] NN — testes: <resumo> — commit: <hash> — merge: <hash> — <data> — <bloqueio> -->
[OK] 18 — testes: api unit 336/336 (merchant-staff.service.spec +9 da story 18: matriz manager cria picker E driver/NÃO cria manager nem admin; NÃO promove picker a manager/admin; NÃO edita nem desativa vínculo de manager/admin; edita+desativa picker/driver — tudo ROLE_ESCALATION_FORBIDDEN no caminho proibido) coverage gate exit=0; api e2e 102/102 (merchant.e2e +3: manager criar admin → 403 ROLE_ESCALATION_FORBIDDEN; manager cria driver → 201; manager editar vínculo de admin → 403); merchant 164/164 (StaffForm/Staff já cobriam o espelho na UI desde a story 16: gerente só vê picker/driver no seletor e não age sobre vínculo de manager/admin — sem teste novo necessário); typecheck 12/12 + build 9/9 verdes — commit: 15bfba6 — merge: 3c9862b — 2026-06-22 — a regra (manager → picker|driver só) já era imposta no merchant-staff.service pela story 16 (assertCanManageRole generalizado: admin só owner faz; manager bloqueado em manager E admin → ROLE_ESCALATION_FORBIDDEN), aplicada em create/update/remove; story 18 foi só fechar a matriz de testes explícita exigida pela Validação; sem mudança de schema; sem dep externa
[OK] 17 — testes: api unit 329/329 (integration.service.spec +2: gerente sem vínculo admin/sem RoleName merchant → INTEGRATION_FORBIDDEN em getErpConfig; owner com RoleName merchant acessa ERP; admin via vínculo StoreStaff(admin) ativo resolve a rede — fixture adminLink via storeStaff.findFirst) coverage gate exit=0 (integration.service 85% stmts); api e2e 99/99 (+1: gerente real RoleName customer + só vínculo manager → 403 em GET erp/api-keys + POST webhooks; admin/owner já cobertos); merchant 164/164 (escopo de loja e nav já cobertos pela story 16: Layout manager NÃO vê Integração + RequireCapability integration.manage owner/admin-only; permissions manager sem integration.manage e sem stores.create); typecheck 12/12 + build 9/9 verdes — commit: 1ce7bf0 — merge: dbb8d83 — 2026-06-22 — fundação da 16 já impunha o escopo de loja do gerente em pedidos/catálogo/relatórios (managerStoreIds/scopedStores → STORE_NOT_MANAGED/STORE_NOT_IN_SCOPE, backend é a fonte da verdade); a 17 fechou só o bloqueio do gerente na integração (owner+admin) reforçado no service via resolveOwnerMerchantId + testes do recorte; sem mudança de schema; sem dep externa
[OK] 16 — testes: api unit 327/327 (+12: merchant-context.service.spec admin level + hierarquia owner>admin>manager via vínculo; merchant-staff.service.spec admin cria manager|picker|driver no escopo, NÃO cria admin/ROLE_ESCALATION_FORBIDDEN, NÃO escapa do escopo/STORE_NOT_IN_SCOPE, gere manager mas não outro admin, hard delete owner-only; merchant.service.spec admin bloqueado em createStore/NOT_AN_OWNER; integration.service.spec admin resolve a rede) coverage gate exit=0; api e2e 52/52 nos specs tocados (+5: context admin role só a loja do vínculo; staff admin cria manager/NÃO cria admin/NÃO escapa escopo; integration admin acessa ERP) — renomeado CANNOT_MANAGE_MANAGER→ROLE_ESCALATION_FORBIDDEN no e2e existente; api-client 18/18; merchant 164/164 (+5: permissions admin tem integração mas não stores.create; StaffForm allowedRoles; Layout admin vê Integração + rótulo Administrador; Staff admin gere gerente mas não outro admin); typecheck 12/12 + build 9/9 verdes — commit: 9c4ee85 — merge: 7727982 — 2026-06-22 — owner=RoleName merchant SEM vínculo admin; admin tem RoleName merchant (guards) + StoreStaff(admin)→resolveLevel dá precedência ao vínculo; scope sempre no backend (só owner enxerga toda a rede); sem dep externa
[OK] 15 — testes: api unit 317/317 (+10: driver-vehicle.service.spec listAvailable só active da rede/[] sem vínculo, current null/reflete/desativado/fora de escopo, select persiste+VEHICLE_NOT_FOUND/NOT_AVAILABLE outra rede/inativo) coverage gate exit=0; api e2e 93/93 (+8: GET vehicles só active da rede/current null antes/PUT seleciona+persiste+troca/outra rede 403/inativo 403/inexistente 404/401); driver 18/18 (+6: useDriverVehicle hooks chamada certa+enabled=false+invalida queryKeys.vehicles.current, select-vehicle renderiza lista/seleciona dispara mutation+navega, gate pós-login sem sessão→/login, sem veículo→/select-vehicle, com veículo→/home) coverage gate exit=0; api-client 18/18; typecheck 12/12 + build 9/9 verdes — commit: 4a40d0b — merge: ccf67fd — 2026-06-22 — escopo (rede) sempre resolvido pelo vínculo de staff no backend, nunca por id do cliente; activeVehicleId via FK onDelete:SetNull; corrigido WIP do agente anterior: jest.mock factory referenciava vars sem prefixo mock (canGoBack/vehiclesData/...) e mock de Redirect quebrava o assert de href (children split) — sem dep externa
[OK] 14 — testes: api unit 307/307 (+19: merchant-vehicles.service.spec resolve merchantId do contexto/escopo/placa inválida/ambígua, PATCH parcial/soft toggle, hard delete VEHICLE_IN_USE vs sem entregas, VEHICLE_NOT_FOUND; serviço 94% stmts) coverage gate exit=0; api e2e 85/85 (+7: cadastro placa normalizada/INVALID_PLATE/lista escopo da rede/PATCH+soft toggle/VEHICLE_IN_USE/hard delete/401); merchant 159/159 (+17: useVehicles hooks invalidam queryKeys.vehicles, VehicleForm rhf+zod placa/tipo, Vehicles lista/criar/editar/toggle/excluir) coverage gate verde; typecheck+build verdes — commit: 37e08b4 — merge: c6c0838 — 2026-06-22 — Vehicle pertence à rede (merchantId resolvido pelo backend, nunca do body); Delivery.vehicleId adicionado p/ histórico/guard VEHICLE_IN_USE (consumido pela story 15)

## Resumo final da rodada 14 → 18

Todas as 5 stories da rodada (veículos 14–15 + RBAC merchant 16–18) estão **OK**
e mergeadas na `main` local (sem push; branches preservadas). Nenhuma story
BLOQUEADA; nenhum ponto PENDENTE-MANUAL novo nesta rodada (sem dep externa nova —
veículos e RBAC são domínio interno).

Resumo por cadeia:
- **Veículos (14 → 15):** model `Vehicle` por rede (`merchantId` resolvido no
  backend, nunca do body) + enum `VehicleType`; `Delivery.vehicleId` p/ histórico
  e guard `VEHICLE_IN_USE`. A 15 vinculou o veículo ativo ao entregador
  (`activeVehicleId`, FK `onDelete: SetNull`), seleção no login (≤2 cliques) e
  indicador na home, introduzindo a infra React Query só na feature de veículo do
  `apps/driver` (resto da home legada fora de escopo).
- **RBAC merchant (16 → 17 → 18):** a 16 introduziu o `StaffRole admin` e
  generalizou a hierarquia owner > admin > manager no `merchant-staff.service`
  (`assertCanManageRole`) e a resolução de nível no `merchant-context`/
  `merchant.service` — **backend é a fonte da verdade**, escopo/papel nunca vêm do
  cliente. A 17 fechou o gerente restrito à loja atribuída + bloqueio na integração
  (owner+admin acessam; manager 403). A 18 fechou a matriz de testes do gerente
  criando/editando SÓ nível inferior (picker|driver), sem escalar a manager/admin
  (`ROLE_ESCALATION_FORBIDDEN`) — a regra já era imposta pela fundação da 16, então
  a 18 foi puramente a cobertura de teste explícita exigida pela Validação.

Codes RBAC em uso (shape `{ code, message }`, SCREAMING_SNAKE):
`ROLE_ESCALATION_FORBIDDEN`, `STORE_NOT_IN_SCOPE`, `NOT_A_MERCHANT_USER`,
`DELETE_OWNER_ONLY`, `INTEGRATION_FORBIDDEN`, `EMAIL_TAKEN`.

Schema: 14, 15 e 16 criaram migrations novas (nunca editaram aplicada); 17 e 18
não tocaram schema.

Reproduzir os gates por área (infra docker no ar — Postgres :5433/test, Redis, MinIO):
- backend unit + gate: `pnpm --filter @markethub/api test` / `pnpm --filter @markethub/api test:coverage`
- backend e2e: `pnpm --filter @markethub/api test:e2e`
- contratos: `pnpm --filter @markethub/types build && pnpm --filter @markethub/api-client build` (antes dos apps); `pnpm --filter @markethub/api-client test`
- merchant: `pnpm --filter @markethub/merchant test` / `test:coverage`
- driver (story 15): `pnpm --filter @markethub/driver test` / `test:coverage`
- geral antes de pronto: `pnpm typecheck` + `pnpm build`

Commits/merges da rodada: 14 (feat `37e08b4` / merge `c6c0838`), 15 (`4a40d0b` /
`ccf67fd`), 16 (`9c4ee85` / `7727982`), 17 (`1ce7bf0` / `dbb8d83`), 18 (`15bfba6` /
`3c9862b`). Serviços deixados de pé.

**Rodada 14 → 18 ENCERRADA** — 5/5 stories OK e mergeadas na `main`. Loop AUTORUN
pode encerrar (nada reagendar).

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
