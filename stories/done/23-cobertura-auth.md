# 23 Cobertura de testes — auth.service

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura
- **Status:** todo
- **Depende de:** 19

## Objetivo

Cobrir `auth/auth.service.ts` (hoje **0%**) — login, refresh, hash de senha. Segurança crítica.

## User story

Como time, quero o serviço de autenticação coberto, para que um bug não deixe login passar
indevidamente nem quebre refresh de token.

## Critérios de aceite

- `auth/auth.service.ts` ≥ 80% linhas.
- Casos: login válido, senha errada, usuário inexistente, refresh válido/expirado/revogado,
  emissão de access+refresh, hash/verify (argon2).
- Erros no shape `{ code, message }` (ex.: `INVALID_CREDENTIALS`).

## Escopo / Fora de escopo

**Dentro:** spec de `auth.service`. **Fora:** guards (já cobertos: `jwt-auth.guard.spec`,
`roles.guard.spec`) e `token.service` (já coberto).

## Notas técnicas

`token.service.spec.ts` já existe — reusar mocks. Não logar segredos no teste.
