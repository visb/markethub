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
- B02 · services/api/src/users/admin-users.controller.ts:49 · low · query `role` tipada como `RoleName` mas sem validação runtime (sem DTO/`@IsIn`) — role inválida passa direto pro filtro Prisma e retorna lista vazia silenciosa · validar `role` contra o enum `RoleName`. · med · race no register: `findUnique` + `create` sem tratar `P2002` — registros concorrentes do mesmo email viram 500 em vez de 409 · capturar `P2002` no create e lançar `EMAIL_TAKEN`.
- B01 · services/api/src/auth/auth.service.ts:145 · med · sessão criada com `refreshTokenHash: ""` e atualizada depois; crash entre os 2 writes deixa hash vazio e `argon2.verify("")` lança → refresh vira 500 em vez de 401 · criar sessão já com hash (gerar sid antes) ou envolver `verifyHash` em try/catch retornando false.
- B01 · services/api/src/auth/strategies/jwt.strategy.ts:18 · med · `validate` não revalida usuário — conta desativada mantém acesso até o access token expirar · aceitável com TTL curto; para revogação imediata, checar `user.active` no validate.

## low

- B01 · services/api/src/auth/auth.service.ts:54 · low · login sem usuário não roda `argon2.verify` — diferença de timing permite enumeração de email · verificar contra hash dummy quando user não existe.
- B01 · services/api/src/auth/auth.service.ts:114 · low · catch do logout engole também erro de DB do `updateMany` (falha de banco vira no-op silencioso) · restringir try/catch ao `verifyRefresh`.
