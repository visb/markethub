# 24 Cobertura de testes — usuários admin e endereços

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura
- **Status:** todo
- **Depende de:** 19

## Objetivo

Cobrir `users/admin-users.service` e `marketplace/addresses.service` — gestão de usuário/permissão
e endereço de entrega.

## User story

Como time, quero gestão de usuários admin e endereços de entrega cobertas, para que permissão não
escape e endereço errado não inviabilize entrega.

## Critérios de aceite

- `users/admin-users.service.ts` (hoje **17%**) ≥ 80% linhas: criar/editar/listar usuário, papéis,
  bloqueio de escalonamento (ver stories 16-18 RBAC).
- `users/admin-users.controller.ts` (**0%**) coberto.
- `marketplace/addresses.service.ts` (**0%**) ≥ 80% linhas: CRUD endereço, geocode, default,
  validação de CEP/coordenada.

## Escopo / Fora de escopo

**Dentro:** specs admin-users (service+controller), addresses.service. **Fora:** geocoding
provider (story 28).

## Notas técnicas

Regras de hierarquia RBAC já testadas em `merchant-staff.service.spec` — reaproveitar cenários.
