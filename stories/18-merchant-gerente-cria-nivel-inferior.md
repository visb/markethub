# Plan: gerente cria apenas usuários de nível inferior (picker e entregador)

## Context

O gerente (`StoreStaff manager`) só pode criar/editar usuários de nível **inferior** ao dele —
picker e driver (entregador). Não pode criar/editar/promover manager nem o novo administrador
(`StaffRole admin`, story **16**), evitando escalonamento de privilégio.

Bloco do BACKLOG (RBAC): "gerente só pode criar usuarios de nivel inferior ao dele (picker e
entregador)."

**Depende da story 16** (papel `admin`) e fecha o bloco RBAC junto com a **17**.

### Situação atual (apurada)

- `merchant-staff.service.assertCanManageRole` já bloqueia o manager de mexer em **manager**
  ("gerente não escala outro"). Falta: estender o bloqueio ao novo papel **admin** e cobrir a
  regra completa com teste explícito, além de refletir na UI (o `StaffForm` não deve oferecer
  manager/admin pro manager).

### Decisões travadas

- Hierarquia de criação/edição de equipe (final do bloco RBAC):
  - **owner** → qualquer papel (admin | manager | picker | driver), todas as lojas da rede.
  - **admin** → manager | picker | driver, no escopo das lojas dele.
  - **manager** → **picker | driver apenas**; nunca admin nem manager.
- Vale para criar **e** editar/promover: manager não pode promover ninguém a manager/admin nem
  rebaixar um manager/admin. A regra é imposta no **backend** (fonte da verdade); a UI só
  espelha pra UX.
- Tentativa fora da hierarquia → erro `{ code, message }` (`ROLE_ESCALATION_FORBIDDEN` ou o code
  já usado hoje), nunca silenciosa.

## Desenho

### Backend (`services/api` — `merchant-staff.service.ts`)

- Generalizar `assertCanManageRole` para uma tabela/regra de hierarquia: dado o nível do ator
  (owner/admin/manager — resolvido como na story 16) e o `staffRole` alvo, permitir só os papéis
  estritamente inferiores. Manager → {picker, driver}; admin → {manager, picker, driver}; owner →
  todos.
- Aplicar a checagem em **todos** os caminhos: `create`, `update` (incl. mudança de `staffRole`)
  e remoção/desativação. Manager não desativa/edita vínculo de manager nem admin.
- Sem mudança de schema esperada.

### Frontend (`apps/merchant` — `StaffForm` / página Staff)

- O seletor de papel no `StaffForm` oferece apenas os papéis que o ator pode criar (manager vê
  só picker/driver; admin vê manager/picker/driver; owner vê tudo). Reusar o nível do
  contexto (story 16).
- Esconder/desabilitar ações de editar/remover sobre vínculos de papel igual ou superior ao do
  ator. UI defensiva; backend continua sendo o gate real.

## Validação

> **Gate de cobertura — código novo sem teste não fecha a story.** Rodar
> `pnpm --filter @markethub/api test:coverage` e `pnpm --filter @markethub/merchant test:coverage`.
> Sem `skip`/`only`/`xfail` injustificado. Antes de "pronto": `pnpm typecheck` + `pnpm build`.

- **Backend (`merchant-staff.service.spec.ts`):** matriz da hierarquia — manager cria
  picker/driver (ok) e é bloqueado ao criar manager/admin (`ROLE_ESCALATION_FORBIDDEN`); manager
  não promove/edita/desativa manager nem admin; admin cria manager/picker/driver mas não cria
  admin acima de si (definir: admin não cria outro admin); owner cria todos. Cobrir create,
  update e remove.
- **Frontend (`StaffForm.test.tsx`, `Staff.test.tsx`):** seletor de papel oferece só os papéis
  permitidos por nível; ações sobre papéis iguais/superiores ficam ocultas/desabilitadas.

## Fora de escopo

- Definição do papel admin (story **16**) e escopo de loja / gate de integração (story **17**).
- Veículos (stories 14/15).
