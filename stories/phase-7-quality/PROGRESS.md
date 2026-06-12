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
| A3 | infra | Mobile jest-expo nos 3 apps + script test | todo | 0 | | |
| A4 | infra | Playwright config + start apps modo web + smoke spec por app | todo | 0 | | |
| A5 | infra | Wiring coverage no turbo + atualizar CI se preciso | todo | 0 | | |

## Grupo B — Review sweep (auto-fix seguro + REVIEW-FINDINGS.md)

| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| B01 | review | services/api/src/auth | todo | 0 | | |
| B02 | review | services/api/src/users | todo | 0 | | |
| B03 | review | services/api/src/catalog | todo | 0 | | |
| B04 | review | services/api/src/erp | todo | 0 | | |
| B05 | review | services/api/src/enrichment | todo | 0 | | |
| B06 | review | services/api/src/marketplace | todo | 0 | | |
| B07 | review | services/api/src/merchant | todo | 0 | | |
| B08 | review | services/api/src/picking | todo | 0 | | |
| B09 | review | services/api/src/driver | todo | 0 | | |
| B10 | review | services/api/src/payment | todo | 0 | | |
| B11 | review | services/api/src/scheduling | todo | 0 | | |
| B12 | review | services/api/src/reviews | todo | 0 | | |
| B13 | review | services/api/src/favorites | todo | 0 | | |
| B14 | review | services/api/src/notifications | todo | 0 | | |
| B15 | review | services/api/src/geocoding | todo | 0 | | |
| B16 | review | services/api/src/storage | todo | 0 | | |
| B17 | review | services/api/src/queue | todo | 0 | | |
| B18 | review | services/api/src/admin | todo | 0 | | |
| B19 | review | services/api/src (common, config, health, prisma, app.module, main) | todo | 0 | | |
| B20 | review | apps/admin (pages, components, auth, api/hooks, queryKeys) | todo | 0 | | |
| B21 | review | apps/customer (app routes, src/api, hooks, components, cart/prefs/location) | todo | 0 | | |
| B22 | review | apps/picker (app routes, src/api, hooks, components) | todo | 0 | | |
| B23 | review | apps/driver (app routes, src/api, hooks, components) | todo | 0 | | |
| B24 | review | packages/types | todo | 0 | | |
| B25 | review | packages/api-client | todo | 0 | | |
| B26 | review | packages/ui | todo | 0 | | |

## Grupo C — Testes (depende de A)

### C-api unit (depende: nenhuma além de jest já existente)
| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| C01 | unit | api auth/token + guards | todo | 0 | | |
| C02 | unit | api catalog service (lockedFields, merge enrichment) | todo | 0 | | |
| C03 | unit | api erp normalize + price/stock sync | todo | 0 | | |
| C04 | unit | api enrichment completeness + category mapping | todo | 0 | | |
| C05 | unit | api marketplace pricing + cart + coupons/fees/shipping | todo | 0 | | |
| C06 | unit | api picking (assignment, substitution, weight-shortfall) | todo | 0 | | |
| C07 | unit | api payment pix + refund pricing | todo | 0 | | |
| C08 | unit | api driver/store-delivery + scheduling capacity | todo | 0 | | |
| C09 | unit | api reviews + favorites + merchant services | todo | 0 | | |

### C-api e2e (depende: A1)
| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| C10 | e2e | auth flow (register/login/refresh/roles guard) | todo | 0 | | |
| C11 | e2e | catalog + admin product PATCH (diff only / lockedFields) | todo | 0 | | |
| C12 | e2e | cart multi-store → checkout → order creation | todo | 0 | | |
| C13 | e2e | pix payment + webhook → order paid | todo | 0 | | |
| C14 | e2e | picking session (pick, substitute, handoff) | todo | 0 | | |
| C15 | e2e | delivery (offer/accept/pickup/confirm) | todo | 0 | | |
| C16 | e2e | reviews + favorites + scheduling slots | todo | 0 | | |

### C-admin (depende: A2 unit, A4 e2e)
| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| C17 | unit | admin hooks (React Query) + queryKeys + api modules | todo | 0 | | |
| C18 | unit | admin ProductDetail form (rhf+zod, PATCH diff) | todo | 0 | | |
| C19 | e2e-web | admin login → catalog → editar produto | todo | 0 | | |
| C20 | e2e-web | admin orders + operations + merchant area | todo | 0 | | |

### C-mobile (depende: A3 unit, A4 e2e-web)
| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| C21 | unit | customer use-cart + prefs + location + zod schemas | todo | 0 | | |
| C22 | unit | customer api modules + hooks (mappers, query keys) | todo | 0 | | |
| C23 | unit | picker hooks/lógica (substitution, task) | todo | 0 | | |
| C24 | unit | driver hooks/lógica (delivery flow) | todo | 0 | | |
| C25 | e2e-web | customer home → produto → carrinho → checkout (web) | todo | 0 | | |
| C26 | e2e-web | picker login → task → pick (web) | todo | 0 | | |
| C27 | e2e-web | driver login → delivery (web) | todo | 0 | | |

### C-packages (depende: nenhuma)
| id | tipo | escopo | status | tent | commit | nota |
|----|------|--------|--------|------|--------|------|
| C28 | unit | packages/api-client (request, socket, error mapping) | todo | 0 | | |
| C29 | unit | packages/types + ui (pure helpers/components) | todo | 0 | | |

---

## Encerramento
Sem `todo`/`in_progress` restante → escrever `FINAL-REPORT.md` (resumo, unidades `blocked` com
motivo, ponteiro pro REVIEW-FINDINGS.md) e **parar** (a tarefa agendada continua disparando mas
cada run sai cedo ao não achar trabalho; remover com `schtasks /delete /tn markethub-sweep /f`).
