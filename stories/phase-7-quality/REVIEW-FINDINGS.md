# REVIEW-FINDINGS — achados arriscados (decisão humana)

Preenchido pelo run durante as unidades `B-*`. NÃO são auto-corrigidos — cada item muda
comportamento, contrato, schema ou não tem teste cobrindo. Revisar e aplicar manualmente.

Formato: `B-id · path:line · <sev> · problema · fix sugerido`
Severidade: `crit` (bug / regra de negócio) · `high` · `med` · `low`.

---

<!-- o run acrescenta itens abaixo, agrupados por severidade -->

## crit

- B01 · services/api/src/auth/dto/register.dto.ts:17 · crit · `/auth/register` é público e aceita `roles` com `admin`/`merchant` — escalação de privilégio por self-registration · restringir DTO a roles auto-registráveis (ex.: só `customer`) e criar staff/admin via rota protegida `@Roles("admin")`.

## high

## med

- B02 · services/api/src/users/admin-users.service.ts:122 · med · race no createStaff: `findUnique` email + `create` sem tratar `P2002` — criações concorrentes do mesmo email viram 500 em vez de 409 · capturar `P2002` no create e lançar `EMAIL_TAKEN` (mesmo padrão do finding B01 no register).
- B02 · services/api/src/users/admin-users.service.ts:26 · med · `page`/`pageSize` vêm como `Number(query)`; valor não-numérico → `NaN`, e `?? 1` não captura NaN (só undefined) → `skip: NaN` quebra a query Prisma com 500 · validar query com DTO (`@IsInt`/`@Min`) ou guardar `Number.isFinite` antes do clamp.
- B03 · services/api/src/catalog/catalog.service.ts:360 · med · mesmo bug de NaN do B02 no `paginate`: controllers passam `page ? Number(page) : undefined`, mas `"abc"`→`NaN` (truthy), `NaN ?? 1`→`NaN`, `Math.max(1, NaN)`→`NaN` → `skip: NaN` quebra Prisma com 500. Afeta `search`, `listStoreProducts`, `categoryFeed` e `admin-catalog.listProducts:28`. · guardar `Number.isFinite` antes do clamp (ou DTO de query com `@IsInt`/`@Min`), centralizado no `paginate`.
- B02 · services/api/src/users/admin-users.controller.ts:49 · low · query `role` tipada como `RoleName` mas sem validação runtime (sem DTO/`@IsIn`) — role inválida passa direto pro filtro Prisma e retorna lista vazia silenciosa · validar `role` contra o enum `RoleName`. · med · race no register: `findUnique` + `create` sem tratar `P2002` — registros concorrentes do mesmo email viram 500 em vez de 409 · capturar `P2002` no create e lançar `EMAIL_TAKEN`.
- B01 · services/api/src/auth/auth.service.ts:145 · med · sessão criada com `refreshTokenHash: ""` e atualizada depois; crash entre os 2 writes deixa hash vazio e `argon2.verify("")` lança → refresh vira 500 em vez de 401 · criar sessão já com hash (gerar sid antes) ou envolver `verifyHash` em try/catch retornando false.
- B01 · services/api/src/auth/strategies/jwt.strategy.ts:18 · med · `validate` não revalida usuário — conta desativada mantém acesso até o access token expirar · aceitável com TTL curto; para revogação imediata, checar `user.active` no validate.

## low

- B01 · services/api/src/auth/auth.service.ts:54 · low · login sem usuário não roda `argon2.verify` — diferença de timing permite enumeração de email · verificar contra hash dummy quando user não existe.
- B01 · services/api/src/auth/auth.service.ts:114 · low · catch do logout engole também erro de DB do `updateMany` (falha de banco vira no-op silencioso) · restringir try/catch ao `verifyRefresh`.
- B03 · services/api/src/catalog/admin-catalog.controller.ts:35 · low · query `status` tipada `EnrichmentStatus` sem validação runtime (sem DTO/`@IsEnum`) — valor inválido cai direto no filtro Prisma de enum e estoura 500 em vez de 400 (mesmo padrão do finding B02 sobre `role`) · validar `status` contra o enum `EnrichmentStatus`.
- B03 · services/api/src/catalog/marketplace-category.service.ts:38 · low · `create` lança `NotFoundException` (404) com code `NAME_REQUIRED` para nome vazio — semântica errada (deveria ser 400). O DTO já tem `@MinLength(1)`, então a guarda é defensiva/morta na rota, mas o status fica errado se o service for reusado · trocar por `BadRequestException`.
- B03 · services/api/src/catalog/marketplace-category.service.ts:50 · low · `update`/`remove`/`assignRaw` fazem `assertExists` + mutate em duas etapas — deleção concorrente entre as duas causa `P2025` (500) em vez de 404 (race pattern-wide no repo) · capturar `P2025` na mutação e mapear para o `notFound` do módulo.
