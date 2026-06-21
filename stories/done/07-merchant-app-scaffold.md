# Plan: App merchant — scaffold (Vite SPA + auth + shell)

## Context

Bloco **criar app merchant** do BACKLOG. App novo onde o **dono do mercado** (RoleName
`merchant`) e o **gerente da loja** (StoreStaff `manager`) administram lojas, integração,
colaboradores e catálogo. Esta story entrega a **fundação** do app — as features entram nas
stories 08–11 (lojas, integração, colaboradores, catálogo).

**Fatos do código:**
- Apps hoje: `customer`, `picker`, `driver` (Expo) e `admin` (Vite). Não há `apps/merchant`.
- `admin` é Vite + React 18 + react-router-dom 6, consome `@markethub/api-client`. **Porém o
  admin é legado** (sem React Query/rhf/zod). O app novo deve nascer no padrão do CLAUDE.md.
- Backend já tem módulo `merchant` com guard `@Roles("merchant","admin")` (catálogo:
  offers/stocks/products). Auth central em `User` (JWT access+refresh).
- `RoleName` = `customer · picker · driver · merchant · admin` — **não existe "manager"**;
  gerente é `StoreStaff.staffRole = manager` (vínculo usuário↔loja).

**Decisões travadas (refino):**
- **Plataforma: Vite web SPA**, espelhando a stack do admin (Vite + React + react-router-dom),
  workspace `@markethub/merchant`. Dev em porta própria (ex.: 3002).
- **Padrão CLAUDE.md desde o início:** React Query (server-state), react-hook-form + zod
  (forms), query keys centralizadas em `src/lib/queryKeys.ts`, chamadas tipadas em `src/api/`.
  Não repetir o débito do admin.
- **Auth/acesso ao app:** aceitar login de usuário com RoleName `merchant` (dono) **ou** com
  vínculo ativo `StoreStaff(staffRole = manager)` (gerente). Como o `/me` hoje só devolve
  `RoleName[]`, esta story **estende o contexto de identidade**: expor se o usuário é
  owner/manager e em quais lojas — via campo novo no `/me` **ou** endpoint `GET /merchant/context`
  (lojas + papel efetivo). Decisão: `GET /merchant/context` (não poluir o `/me` global).
- **Matriz de permissão (base p/ 08–11):** dono = tudo; gerente = colaboradores + catálogo da(s)
  sua(s) loja(s), **sem** integração e **sem** criar lojas. Esta story só estabelece o
  `can(capability)` no front a partir do `merchant/context`; a aplicação fina por tela é das
  stories seguintes (e **sempre** reforçada no backend).
- **Não** reaproveitar componentes do admin agora (admin é legado); se surgir reuso real,
  extrair para `packages/ui` depois.

## Desenho

- **Scaffold `apps/merchant`** (espelha `apps/admin`): `package.json`
  (`@markethub/merchant`, scripts dev/build/test/test:coverage com Vite+Vitest), `vite.config`,
  `tsconfig` estendendo a base, `index.html`, `src/main.tsx`, `src/App.tsx`, `styles.css`.
- **Provider raiz:** `QueryClientProvider` + `AuthProvider` no topo (`App.tsx`/`main.tsx`).
- **Auth** (`src/auth/`): `auth-context.tsx` + `token-store.ts` no padrão do admin, mas
  resolvendo o **papel efetivo** via `GET /merchant/context`. Login (`pages/Login.tsx`) com
  rhf+zod. Redireciona para login se não autenticado / sem papel merchant|manager.
- **Backend:** `GET /merchant/context` no `merchant.controller` (guard aceitando merchant +
  manager): retorna `{ role: "owner" | "manager", merchantId, stores: [{id,name}] }`. Ajustar
  o guard/escopo para permitir manager (hoje é `@Roles("merchant","admin")`): introduzir uma
  verificação de StoreStaff manager (decorator/guard ou checagem no service).
- **Shell/navegação:** layout com nav lateral (Lojas, Integração, Colaboradores, Catálogo) —
  itens visíveis conforme `can(capability)`. Rotas placeholder para as 4 áreas (telas reais
  nas stories 08–11).
- **Camada de dados base:** `src/lib/queryKeys.ts`, `src/api/` (cliente tipado p/
  `merchant/context`), hook `useMerchantContext`.

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/merchant test:coverage` e `pnpm --filter @markethub/api test:coverage`
(backend tocado). Sem `skip`/`only` injustificado.

- **Backend** (`merchant.service`/controller spec): `GET /merchant/context` retorna `owner`
  p/ RoleName merchant e `manager` p/ usuário com StoreStaff manager ativo; nega usuário sem
  vínculo (403/`FORBIDDEN`); manager só vê as lojas dos vínculos dele.
- **Frontend**: `useMerchantContext` popula papel/lojas; guard de rota redireciona não
  autenticado; `can(capability)` esconde itens de nav (ex.: gerente não vê Integração/Criar loja).
  Login (rhf+zod) valida e chama o client.
- `pnpm typecheck` + `pnpm build` verdes (novo workspace entra no turbo/CI por **nome**).
- Ajustar CI/turbo se necessário para o novo workspace `@markethub/merchant`.

## Fora de escopo

- Telas reais de lojas (08), integração (09), colaboradores (10), catálogo (11).
- Qualquer schema novo de integração/webhook/api-key (story 09).
- Reuso de componentes do admin / extração para `packages/ui`.
- i18n, tema avançado, responsividade fina (shell funcional já basta).
