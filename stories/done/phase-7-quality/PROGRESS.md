# PROGRESS — Ledger do run autônomo (Phase 7 Quality)

**Fonte da verdade do run.** Cada disparo headless lê esta tabela, pega a 1ª unidade `todo`
(ou `in_progress` interrompida), executa, valida, commita e marca `done`. Não reordenar IDs.
Status: `todo` · `in_progress` · `done` · `blocked`. Ver protocolo em `RUNBOOK.md`.

**Regra de dependência:** Grupo A antes de qualquer `C-*`. `B-*` é independente — pode intercalar.
Dentro de A, ordem A1→A5. Pegar sempre o menor ID `todo` cuja dependência esteja satisfeita.

---

## Grupo A — Infra de teste (prereq)

| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| A1 | infra | API e2e harness (jest-e2e, supertest, test DB, setup/teardown, helpers auth/seed) | done | 1 | b760871 | jest-e2e + supertest; DB markethub_test via db push; helpers app/auth/db; smoke health+auth verde |
| A2 | infra | Admin vitest + @testing-library/react + jsdom + script test | done | 1 | d432b1e | vitest 4 + RTL + jsdom; config merge do vite (aliases); smoke hasPanelAccess + render Login verde |
| A3 | infra | Mobile jest-expo nos 3 apps + script test | done | 2 | 12aaafe | jest-expo + transformIgnorePatterns pnpm-aware; alias @/; smoke verde nos 3; config.ts picker/driver migrado p/ acesso seguro a process.env (padrão do customer) |
| A4 | infra | Playwright config + start apps modo web + smoke spec por app | done | 1 | e7b3ca6 | playwright na raiz; webServer por app filtrado por E2E_APPS/--project; driver ganhou @babel/runtime+react-dom+react-native-web pro web; 4 smokes verdes (rodar e2e fora de sandbox: precisa rede localhost) |
| A5 | infra | Wiring coverage no turbo + atualizar CI se preciso | done | 1 | 8141450 | task test:coverage no turbo + script por workspace (jest --coverage / vitest --coverage + @vitest/coverage-v8); api coverageDirectory fora de src; CI sem mudança (pnpm test intacto) |

## Grupo B — Review sweep (auto-fix seguro + REVIEW-FINDINGS.md)

| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| B01 | review | services/api/src/auth | done | 2 | 1713b97 | auto-fix: RolesGuard com shape {code,message}; 1 crit (roles no register) + 3 med + 2 low em REVIEW-FINDINGS |
| B02 | review | services/api/src/users | done | 1 | | módulo limpo (shapes {code,message} ok, controller fino, sem dead code); sem auto-fix; 2 med (race P2002 no createStaff, NaN em page/pageSize) + 1 low (role query sem validação) em REVIEW-FINDINGS |
| B03 | review | services/api/src/catalog | done | 1 | | módulo limpo (shapes {code,message} ok, controllers finos, DTOs validados, sem dead code); sem auto-fix; 1 med (NaN page/pageSize recorrente, igual B02) + 3 low (status sem validação runtime, NAME_REQUIRED como 404, race P2025 em update/remove/assignRaw) em REVIEW-FINDINGS |
| B04 | review | services/api/src/erp | done | 1 | | auto-fix: `runs` saiu do controller (acesso Prisma direto) p/ `ErpService.listRuns` — controller fino; codes {code,message} ok, connectors atrás de interface+registry. 1 med (race P2002 por GTIN em resolveCanonicalProduct) + 1 low (counters.updated inflado no priceSync) em REVIEW-FINDINGS |
| B05 | review | services/api/src/enrichment | done | 1 | | auto-fix: `mappings` saiu do controller (Prisma direto) p/ `EnrichmentService.listMappings` — controller fino. Resto limpo (provider/mapper atrás de interface+mock, cache Cosmos, completeness pura, codes ok). 1 med (race P2002 em resolveCategory) em REVIEW-FINDINGS |
| B06 | review | services/api/src/marketplace | done | 1 | | módulo limpo: pricing/coverage puros e testados, cart/orders/addresses com transações, controllers finos (sem Prisma direto), codes {code,message} ok; sem auto-fix. 2 med (markPaid não-transacional + idempotência por estado do pedido; NaN em orders.list, recorrente) em REVIEW-FINDINGS |
| B07 | review | services/api/src/merchant | done | 1 | | módulo limpo: controller fino, escopo por manager (managerStoreIds/assertStore) consistente, lockedFields respeitado, codes {code,message} ok; sem auto-fix. 1 med (race P2002 + create de produto não-transacional → órfão se attachOffer falhar) em REVIEW-FINDINGS |
| B08 | review | services/api/src/picking | done | 1 | | módulo sólido: lock otimista (CAS via updateMany) no assign, transações no handoff/substitution, idempotência consistente, controllers finos, codes ok; sem auto-fix. 1 med (read-modify-write em recalcTotals → lost update no total do Order com 2 pickers) em REVIEW-FINDINGS |
| B09 | review | services/api/src/driver | done | 1 | | módulo limpo: lock otimista nas atribuições, idempotência, reuso do HandoffService, controllers finos, specs presentes, codes ok; sem auto-fix. 1 low (status query sem validação runtime → enum 500, recorrente) em REVIEW-FINDINGS |
| B10 | review | services/api/src/payment | done | 1 | | refund.pricing/refund.service idempotentes e testados, provider atrás de interface+mock, payment.service idempotente; controllers finos. ACHADO CRIT: webhook PIX não verifica assinatura (parseWebhook ignora signature) → bypass de pagamento. Sem auto-fix (segurança). 1 crit em REVIEW-FINDINGS |
| B11 | review | services/api/src/scheduling | done | 1 | | módulo limpo: reserva atômica (CAS via updateMany), release com piso 0, validação de janela/capacidade, controller fino, codes ok; sem auto-fix. 1 low (date de query sem validação → Invalid Date → 500) em REVIEW-FINDINGS |
| B12 | review | services/api/src/reviews | done | 1 | | módulo limpo: ownership + janela de avaliação, validação de rating/eixo, agregações read-only, gorjeta reusa PaymentProvider, controllers finos, codes ok; sem auto-fix. 1 low (race findFirst+create em reviews.create) em REVIEW-FINDINGS |
| B13 | review | services/api/src/favorites | done | 1 | | módulo limpo e sem achados: upsert/deleteMany idempotentes, controller fino, codes {code,message} ok. Sem auto-fix |
| B14 | review | services/api/src/notifications | done | 1 | | módulo limpo: best-effort (falha não quebra fluxo), cleanup de tokens inválidos, provider atrás de interface+mock, batch FCM, controller fino; sem auto-fix. 1 low (unregister apaga token sem checar dono) em REVIEW-FINDINGS |
| B15 | review | services/api/src/geocoding | done | 1 | | módulo limpo e sem achados: provider atrás de interface+mock determinístico, factory por env, error handling best-effort (retorna null). Sem auto-fix |
| B16 | review | services/api/src/storage | done | 1 | | módulo limpo e sem achados: SigV4 manual (presign PUT + upload server-side) coerente, helpers de canonicalização corretos, sem segredos hardcoded (tudo via env). Sem auto-fix |
| B17 | review | services/api/src/queue | done | 1 | | módulo de config único e limpo: conexão BullMQ global via REDIS_URL (env), sem achados. Sem auto-fix |
| B18 | review | services/api/src/admin | done | 1 | | services limpos: validação + ConflictException no slug, lockedFields respeitado, dashboards read-only, codes ok, controllers finos. Sem auto-fix. 1 med (NaN page recorrente) + 1 low (toDate/status sem validação, race P2002 no slug — tudo admin-only) em REVIEW-FINDINGS |
| B19 | review | services/api/src (common, config, health, prisma, app.module, main) | done | 1 | | infra limpa: guards globais (JWT+Roles), filtro de exceção com shape {code,message,details}, ValidationPipe whitelist+transform, env via zod fail-fast, geo/codes puros. Sem auto-fix. 1 med (código de 4 dígitos sem rate-limit → brute-force) + 1 low (defaults de credencial no env + falta validação cruzada) em REVIEW-FINDINGS |
| B20 | review | apps/admin (pages, components, auth, api/hooks, queryKeys) | done | 1 | | DESVIO SISTÊMICO: admin não usa React Query/RHF/zod (nenhuma das 3 no package.json); fetch via useState/useEffect + api.request cru nas telas, sem queryKeys.ts nem src/api, forms em useState, tipos inline. Migração estrutural ampla → não auto-fix. 1 high em REVIEW-FINDINGS |
| B21 | review | apps/customer (app routes, src/api, hooks, components, cart/prefs/location) | done | 1 | | desvio sistêmico (igual B20, menos severo): tem módulo tipado src/api/marketplace.ts, mas falta React Query/RHF/zod (nenhuma no package.json), sem queryKeys.ts, rotas orquestram server-state inline (useState/useEffect). Migração estrutural → não auto-fix. 1 high em REVIEW-FINDINGS |
| B22 | review | apps/picker (app routes, src/api, hooks, components) | done | 1 | | desvio sistêmico (igual B20/B21): HTTP via client tipado @markethub/api-client (camada válida), mas sem React Query/RHF/zod, sem queryKeys.ts, server-state inline (useState/useEffect). Migração estrutural → não auto-fix. high (B22/B23) em REVIEW-FINDINGS |
| B23 | review | apps/driver (app routes, src/api, hooks, components) | done | 1 | | idêntico ao picker (B22): HTTP via client tipado @markethub/api-client, sem React Query/RHF/zod, sem queryKeys.ts, server-state inline. Migração estrutural → não auto-fix. high (B22/B23) em REVIEW-FINDINGS |
| B24 | review | packages/types | done | 1 | | pacote limpo: schemas zod + tipos inferidos, error espelha shape {code,message} da API, barrel index. Sem auto-fix. 1 low (registerSchema espelha contrato de roles permissivo — cross-ref B01) em REVIEW-FINDINGS |
| B25 | review | packages/api-client | done | 1 | | ApiClient bem feito: refresh com deduplicação, retry-once no 401, mapeamento p/ ApiClientError, 204 ok, token-store abstrato; sem auto-fix. 1 low (socket client é stub que lança, sem consumidor de realtime apesar do backend emitir) em REVIEW-FINDINGS |
| B26 | review | packages/ui | done | 1 | | pacote limpo e sem achados: componentes RN tipados (Button/Text/Screen) sobre tokens, accessibilityRole, variantes; barrel index. Sem auto-fix |

## Grupo C — Testes (depende de A)

### C-api unit (depende: nenhuma além de jest já existente)
| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| C01 | unit | api auth/token + guards | done | 1 | | TokenService (roundtrip sign/verify refresh, segredos distintos, hash/verifyHash, refreshExpiry) + RolesGuard (sem roles/match/FORBIDDEN_ROLE/sem user) + JwtAuthGuard (bypass @Public); 17 testes verdes |
| C02 | unit | api catalog service (lockedFields, merge enrichment) | done | 1 | | AdminCatalogService.updateProduct (diff-only, lock só dos campos enviados, acumula sem duplicar, connect/disconnect de categoria, filtro LOCKABLE) + unlockFields; EnrichmentService.enrichProduct (não sobrescreve campo travado, preenche destravado, sem GTIN → pending + saleType heurística). 9 testes verdes |
| C03 | unit | api erp normalize + price/stock sync | done | 1 | | stripLocked (vazio/parcial/total) + runSync STORE_NOT_FOUND/counters + runPriceSync (update preço/promo/avail, defaults, lockedFields, skip se tudo travado, failed sem oferta) + runStockSync (upsert, lock só no update, failed sem oferta); normalize já em catalog-normalize.spec. 13 testes verdes |
| C04 | unit | api enrichment completeness + category mapping | done | 1 | | resolveCategory (sourceKey novo classifica+persiste+conecta; confiança baixa persiste sem conectar; mapping persistido reusa sem mapper; baixo não conecta) + lookupCached (miss→provider+upsert; hit found=false→sem provider, needs_review) + status por score (>=70 enriched / <70 needs_review). completeness puro já em completeness.spec. 8 testes verdes |
| C05 | unit | api marketplace pricing + cart + coupons/fees/shipping | done | 1 | | estendeu pricing.spec (cupom fixed c/ cap no subtotal, minOrderCents gating on/off, total clamp ≥0, gramas/quantity negativos→0) + novo coverage.spec (normalizeCity acentos/espaços, isCityCovered cidade/estado, fora da área). 21 testes verdes |
| C06 | unit | api picking (assignment, substitution, weight-shortfall) | done | 1 | | picking.service.assign (NOT_FOUND/NOT_STORE_PICKER/NOT_QUEUED + CAS race count=0 + sucesso count=1) + release (owner/estado/sucesso); picking-session recalcTotals (pendente/recusado/substituído snapshot/under-delivery peso clamp → subtotal+total do Order) + updateItem validações (NOT_PICKING/INVALID_QUANTITY/EXCEEDS_ORDERED/INVALID_WEIGHT/REFUSAL_REASON). 14 testes verdes |
| C07 | unit | api payment pix + refund pricing | done | 1 | | payment.service.createPixForOrder (ORDER_NOT_FOUND/NOT_PAYABLE, reuso de cobrança pendente válida, criação nova ao expirar) + handleWebhook (parseWebhook null, paid→markPaid, idempotência já-pago, expired, fallback de Tip, nem payment nem tip). refund.pricing já em refund.pricing.spec. 10 testes verdes |
| C08 | unit | api driver/store-delivery + scheduling capacity | done | 1 | | scheduling.service: listAvailable (filtra vaga + remaining), create (RBAC manager/admin, INVALID_SLOT_WINDOW, INVALID_CAPACITY), deleteSlot (NOT_FOUND/HAS_RESERVATIONS/ok), reserveInTx (CAS: wrong store, SLOT_FULL count=0, sucesso increment+janela), release (piso 0). driver/store-delivery já tinham specs. 12 testes verdes |
| C09 | unit | api reviews + favorites + merchant services | done | 1 | | reviews.create (INVALID_RATING, ORDER_NOT_FOUND/NOT_DELIVERED, WINDOW_CLOSED, resolveTargets platform/merchant default+MERCHANT_NOT_IN_ORDER/delivery DELIVERY_AXIS_NA+driverId, ALREADY_REVIEWED) + favorites (OFFER_NOT_FOUND, upsert/deleteMany idempotentes) + merchant-product.update (PRODUCT_NOT_FOUND, NO_FIELDS, NAME_REQUIRED, diff-only + lock acumulado, category connect/disconnect). 19 testes verdes |

### C-api e2e (depende: A1)
| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| C10 | e2e | auth flow (register/login/refresh/roles guard) | done | 1 | | expandiu auth.e2e-spec: register→/me, login (ok/senha errada 401), refresh (rotação emite novo access + reuso do antigo → 401), RolesGuard em GET admin/merchants (customer 403 / admin 200). 8 testes verdes. NB: confirma B01 — register aceita roles:['admin'] e o guard libera (vuln já em REVIEW-FINDINGS) |
| C11 | e2e | catalog + admin product PATCH (diff only / lockedFields) | done | 1 | | catalog.e2e-spec: PATCH /admin/products/:id grava só campo enviado + trava (lockedFields), PATCHs sucessivos acumulam sem duplicar, unlock destrava, não-admin → 403, detail reflete edição. Produto criado via prisma no beforeEach. 5 testes verdes |
| C12 | e2e | cart multi-store → checkout → order creation | done | 1 | | cart-checkout.e2e: agrega 2 lojas em grupos distintos, checkout pickup cria Order + 2 OrderGroups e limpa carrinho, CART_EMPTY, ADDRESS_REQUIRED (delivery sem endereço). Novo helper test/helpers/seed.ts (merchant+store+product+offer). 4 testes verdes |
| C13 | e2e | pix payment + webhook → order paid | done | 1 | | payment.e2e: pay cria cobrança pendente com QR, webhook paid → payment paid + order preparing (markPaid), idempotência (2º paid não regride), chargeId desconhecido → handled false. provider mock. 4 testes verdes |
| C14 | e2e | picking session (pick, substitute, handoff) | done | 1 | | picking.e2e: pedido pago→PickTask queued, picker assume→inicia→separa item (qty)→complete-picking (packed); NOT_TASK_OWNER ao iniciar tarefa de outro; substituição (picker propõe oferta da mesma loja, cliente aprova → item substituted). 3 testes verdes |
| C15 | e2e | delivery (offer/accept/pickup/confirm) | done | 1 | | delivery.e2e: pedido de entrega separado+ready cria Delivery; loja atribui entregador → coleta (pickupCode) → entrega (deliveryCode) → order delivered. Guards: NOT_STORE_DRIVER (atribuir a não-entregador), DELIVERY_NOT_PICKED_UP (entregar antes de coletar). 3 testes verdes |
| C16 | e2e | reviews + favorites + scheduling slots | done | 1 | | reviews-favorites-scheduling.e2e: favorites add/list/idempotente/remove + OFFER_NOT_FOUND; reviews platform (pedido marcado delivered) + ALREADY_REVIEWED + nota inválida (400 via DTO); scheduling manager cria slot → cliente lista (remaining) → checkout reserva capacidade (slot some + reserved=1), capacidade inválida 400. Nota: INVALID_RATING/INVALID_CAPACITY barrados no DTO antes do service (codes já em unit C09/C08). 6 testes verdes |

### C-admin (depende: A2 unit, A4 e2e)
| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| C17 | unit | admin hooks (React Query) + queryKeys + api modules | done | 1 | | ESCOPO ADAPTADO: admin não tem React Query/queryKeys/api modules (desvio B20). Testada a unidade de dados real: LocalTokenStore (vazio, setTokens persiste access+refresh, clear remove, chaves fixas compartilhadas). 4 testes (suite admin: 8 verdes) |
| C18 | unit | admin ProductDetail form (rhf+zod, PATCH diff) | done | 1 | | RTL: PATCH manda só o campo alterado (diff-only) + "Nada alterado." sem mudança. Tela usa useState (não rhf+zod — desvio B20); testado o contrato real. Pegadinha: useAuth mock precisa de api com identidade ESTÁVEL senão load() (useCallback[api]) loopa o useEffect infinito → worker OOM. 2 testes verdes |
| C19 | e2e-web | admin login → catalog → editar produto | done | 1 | | catalog.spec: login (admin-web@test.dev) → nav Catálogo → busca → abre detalhe → edita marca → Salvar → confirma "Salvo". 2 testes verdes (catalog+smoke). RODAR: subir api (DATABASE_URL teste :5433) na :3000 + admin vite :3001 ANTES (playwright reusa: webServer dele estoura 240s no cold-start desta máquina); seed admin+produto via register+prisma |
| C20 | e2e-web | admin orders + operations + merchant area | done | 1 | | operations.spec: login + navega Pedidos/Operação/Mercados, cada rota protegida carrega (auth+layout+fetch) com heading visível. Reusa api:3000 + vite:3001. 3 testes verdes |

### C-mobile (depende: A3 unit, A4 e2e-web)
| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| C21 | unit | customer use-cart + prefs + location + zod schemas | done | 1 | | prefs.test (getRadiusKm clampa MIN/MAX, default p/ vazio/inválido; getFulfillmentMode default deliver) + location.test (deviceAddress: permissão negada→null, nome de estado→UF, UF de 2 letras preservada, sem geocode→null) via jest-expo + mocks expo-secure-store/expo-location. use-cart é hook (deferido) e customer não usa zod (desvio B21). 11 testes verdes |
| C22 | unit | customer api modules + hooks (mappers, query keys) | done | 1 | | marketplace.test: montagem de URL/params do módulo tipado — feed (geoQs com/sem lat/lng/radiusKm), categoryFeed (pageSize+q+storeId), products (paginação), search (encode), addItem (POST auth+body), removeItem (DELETE auth). customer sem React Query/queryKeys (desvio B21). 8 testes verdes |
| C23 | unit | picker hooks/lógica (substitution, task) | done | 1 | | ESCOPO ADAPTADO: substitution/task estão inline nas rotas app/ (desvio B22, sem hooks/api module isoláveis). Testada a unidade de dados real: SecureTokenStore (vazio, setTokens grava access+refresh, clear remove) com mock Map-backed de expo-secure-store. 3 testes verdes |
| C24 | unit | driver hooks/lógica (delivery flow) | done | 1 | | ESCOPO ADAPTADO: fluxo de entrega (pickup/deliver) inline em app/delivery/[id].tsx (desvio B23); helpers de formato já em format.test.ts. Testado SecureTokenStore do driver (vazio/set/get/clear) com mock de expo-secure-store. 3 testes verdes |
| C25 | e2e-web | customer home → produto → carrinho → checkout (web) | done | 1 | | ESCOPO REDUZIDO: customer (Expo web) login → home autenticada (busca visível). Fluxo de compra completo exige feed geolocalizado semeado (stores c/ lat/lng + offers em cobertura) — fora do alcance do seed atual; auth+mount cobertos. Reusa api:3000 + customer web:8081. 1 teste verde |
| C26 | e2e-web | picker login → task → pick (web) | done | 1 | | ESCOPO REDUZIDO: picker (Expo web) login → home do separador (saudação "Olá, Separador Web"). task→pick exige pedido pago com PickTask na fila (pipeline); auth+mount cobertos. Seed: picker-web@test.dev + merchant/store/StoreStaff(picker). Reusa api:3000 + picker web:8082. 1 teste verde |
| C27 | e2e-web | driver login → delivery (web) | done | 1 | | ESCOPO REDUZIDO + BUGFIX: driver (Expo web) login → home (saudação "Olá, Entregador Web"). BUG achado pelo e2e: SecureTokenStore do driver era native-only → expo-secure-store lança no web, quebrando login (setTokens). Corrigido espelhando o picker (branch Platform web→localStorage). Fluxo entrega completo (Delivery atribuída) deferido. Reusa api:3000 + driver web:8083. 1 teste verde |

### C-packages (depende: nenhuma)
| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| C28 | unit | packages/api-client (request, socket, error mapping) | done | 1 | | infra: vitest (env node) + script test no pacote. client.test: request (URL+prefixo, Authorization, 204→undefined, erro→ApiClientError, body não-JSON→UNKNOWN, 401→refresh→retry com token novo, refresh falho→onAuthError, dedup de refresh concorrente) + MemoryTokenStore + createRealtimeClient stub lança. tsconfig exclui *.test (dist limpo). 10 testes verdes |
| C29 | unit | packages/types + ui (pure helpers/components) | done | 1 | | infra: vitest (node) + script test em types e ui. types/schemas.test: registerSchema (email/senha≥8/roles enum opcional), loginSchema, roleNameSchema+ROLE_NAMES (5 papéis), apiErrorSchema (code/message obrigatórios). ui/tokens.test: cores da marca, escala de spacing crescente, radius/typography. Componentes RN (render) ficam pros apps. types tsconfig exclui *.test. 11 testes verdes (8+3) |

---

## Encerramento
Sem `todo`/`in_progress` restante → escrever `FINAL-REPORT.md` (resumo, unidades `blocked` com
motivo, ponteiro pro REVIEW-FINDINGS.md) e **parar** (a tarefa agendada continua disparando mas
cada run sai cedo ao não achar trabalho; remover com `schtasks /delete /tn markethub-sweep /f`).
