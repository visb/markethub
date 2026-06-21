# Plan: App merchant — cadastro e edição de lojas (CRUD)

## Context

Bloco **criar app merchant** do BACKLOG, faceta "cadastrar suas lojas". O dono precisa criar
e editar as lojas do seu mercado dentro do app merchant. Depende da **story 07** (scaffold:
app Vite, auth dono/gerente, shell, `merchant/context`, `can(capability)`).

**Fatos do código:**
- Backend `merchant.controller` (`@Roles("merchant","admin")`) hoje só tem `GET merchant/stores`
  → `merchant.service.myStores(userId)`. Não há create/update de loja pelo merchant.
- `merchant.service` já resolve escopo por manager: `managerStoreIds`, `assertStore`.
- `Store` (schema) tem nome, endereço (street/number/district/city/state/zip), `latitude`/
  `longitude`, `avgPrepMinutes` (default 15), `active`, `externalId` (id no ERP).
- Geocoding atrás de interface + provider mock: `services/api/src/geocoding/`
  (`geocoding-provider.interface.ts` + `providers/`).

**Decisões travadas (refino):**
- **Owner-only:** criar e editar loja é só do **dono** (decisão de permissão da sessão). O
  gerente continua com a lista **read-only** (já existe `GET merchant/stores`). Enforced no
  backend usando a determinação owner/manager da story 07 — manager recebe `403`/`FORBIDDEN`
  em create/update.
- **Geocodificação automática:** ao salvar endereço, derivar `latitude`/`longitude` via o
  serviço de geocoding (interface + mock). Permitir override manual de lat/lng (campo
  editável) caso o geocode falhe — não bloquear o save.
- `externalId` (id da loja no ERP) é editável aqui, mas a **configuração de integração**
  (endpoints/webhooks/api-keys) é a **story 09** — não confundir.
- Sem **exclusão** de loja nesta story: usar `active = false` (soft toggle) em vez de delete,
  para não órfãos de pedidos/ofertas. Delete real fica fora de escopo.

## Desenho

- **Backend** (`merchant.controller` + `merchant.service`):
  - `POST merchant/stores` (owner-only) — `CreateStoreDto` (name, endereço, avgPrepMinutes?,
    externalId?, active?). Geocode endereço → lat/lng; cria sob o `merchantId` do dono.
  - `PATCH merchant/stores/:id` (owner-only) — `UpdateStoreDto` parcial (`@IsOptional`); se o
    endereço mudou, re-geocodifica; `assertStore` garante que a loja é do merchant do usuário.
  - Guard owner-only: helper no service (ex.: `assertOwner(userId)`) reusando a lógica da
    story 07 (RoleName merchant sem restrição de StoreStaff). Erros `{code,message}`.
- **Frontend** (`apps/merchant`):
  - `src/api/stores.ts` (tipado) + hooks `useStores`, `useCreateStore`, `useUpdateStore`
    (React Query; invalidam `queryKeys.stores.all`).
  - `pages/Stores.tsx`: lista das lojas (cards/tabela) + ação "Nova loja" (visível só p/ owner
    via `can("manage_stores")`).
  - Form de loja (rhf + zod): nome, endereço, avgPrepMinutes, externalId, active. Submit chama
    a mutation; feedback de erro/sucesso. Gerente vê a lista sem ações de edição.

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/api test:coverage` + `pnpm --filter @markethub/merchant test:coverage`.
Sem `skip`/`only` injustificado.

- **Backend** (`merchant.service.spec`): owner cria loja (geocode chamado, lat/lng gravados);
  manager recebe `403` em create/update; update parcial só altera o enviado; mudança de
  endereço re-geocodifica; geocode falho → salva sem travar (lat/lng nulos ou override).
- **Frontend**: `useCreateStore`/`useUpdateStore` invalidam a lista; form (zod) valida campos
  obrigatórios; botão "Nova loja" oculto para gerente (`can` falso); lista renderiza as lojas.
- `pnpm typecheck` + `pnpm build` verdes.

## Fora de escopo

- Configuração de integração (endpoints/webhooks/api-keys) — story 09.
- Colaboradores (10), catálogo (11), pedidos (12), relatórios (13).
- Exclusão definitiva de loja (apenas `active` toggle aqui).
- Mapa/seletor visual de localização (geocode por endereço basta; pin fica fora de escopo).
