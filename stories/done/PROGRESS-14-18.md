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

