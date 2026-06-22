# Plan: gerente restrito à loja atribuída e sem acesso à integração

## Context

O gerente (`StoreStaff manager`) deve enxergar e operar **apenas** a(s) loja(s) à(s) qual(is)
foi atribuído, e **não** ter acesso à área de integração (config de ERP, api-keys, webhooks —
hoje owner-only). O administrador (StaffRole `admin`, story **16**) e o owner mantêm acesso
amplo, incluindo integração.

Bloco do BACKLOG (RBAC): "gerentes só tem acesso à loja a qual foram atribuídos e nao tem acesso
a integração."

**Depende da story 16** (papel `admin` e resolução de nível owner/admin/manager). Faz par com a
story **18** (gerente cria só nível inferior).

### Situação atual (apurada)

- **Integração já é owner-only**: `IntegrationService` reforça por `merchantId` e a rota do app
  merchant já é escondida de não-owner. Falta: incluir o novo `admin` (story 16) como autorizado
  e garantir que o **manager** continue bloqueado (backend + UI), com teste explícito.
- **Equipe (staff) já é escopada** ao manager em `merchant-staff.service`. Falta auditar as
  **demais** áreas do app merchant (pedidos, catálogo, relatórios, lojas) para garantir o mesmo
  escopo de loja pro manager — esse é o trabalho principal da story.

### Decisões travadas

- Escopo de loja do manager vale em **todas** as áreas do app merchant: pedidos, catálogo,
  relatórios, lista de lojas, equipe. Manager nunca vê dados de loja fora do vínculo dele.
- Integração: **owner + admin** acessam; **manager** bloqueado (backend retorna erro
  `{ code, message }` e UI esconde a entrada de nav). Reusar a resolução de nível da story 16.
- Resolver o escopo de lojas **sempre no backend** pelo vínculo do usuário — nunca confiar em
  `storeId`/`merchantId` vindos do cliente.

## Desenho

### Backend (`services/api`)

- **Auditar e escopar por loja** os endpoints consumidos pelo app merchant para o manager:
  `merchant-orders`, `merchant-product`/catálogo, `merchant-reports`, `merchant` (lojas). Onde
  já houver helper de "lojas em escopo" (ver `merchant-staff.service` / `merchant.myStores`),
  reusar; senão, centralizar a resolução de escopo num ponto único e aplicar em cada service.
  Manager fora do escopo → erro `STORE_OUT_OF_SCOPE` (ou equivalente já existente).
- **Integração:** estender a autorização para incluir o `admin` da story 16 (owner + admin),
  mantendo o reforço por `merchantId` no service. Garantir que manager recebe `FORBIDDEN`.
- Sem mudança de schema esperada (reuso do vínculo `StoreStaff`). Se precisar de migration,
  criar nova.

### Frontend (`apps/merchant`)

- Nav/rotas refletem o nível (base criada na story 16): entrada **Integração** e **Lojas**
  (criar/editar) ocultas pro manager; visíveis pra owner/admin.
- Seletor de loja / listagens já filtram pelo escopo retornado do backend — o app não deve
  depender de filtro client-side pra segurança, só pra UX.
- Mensagens claras quando uma ação está fora do escopo (defensivo; o backend é a fonte da
  verdade).

## Validação

> **Gate de cobertura — código novo sem teste não fecha a story.** Rodar
> `pnpm --filter @markethub/api test:coverage` e `pnpm --filter @markethub/merchant test:coverage`.
> Sem `skip`/`only`/`xfail` injustificado. Antes de "pronto": `pnpm typecheck` + `pnpm build`.

- **Backend:** para cada service auditado (orders/catalog/reports/stores), teste de que o
  manager só acessa dados das lojas em escopo e recebe erro ao tentar fora dele; owner/admin
  veem amplo. Integração: manager → `FORBIDDEN`; owner e admin → ok (`integration.service.spec`).
- **Frontend:** teste de que a nav esconde Integração/Lojas pro manager e mostra pro owner/admin;
  listagens consomem o escopo do backend. Espelhar os testes de página existentes
  (`Integration.test.tsx`, etc.).

## Fora de escopo

- Criação de papéis pelo gerente e bloqueio de escalonamento (story **18**).
- Definição do papel admin em si (story **16**).
- Veículos (stories 14/15).
