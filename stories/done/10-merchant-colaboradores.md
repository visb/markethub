# Plan: App merchant — cadastro de colaboradores (StoreStaff)

## Context

Bloco **criar app merchant** do BACKLOG, faceta "cadastrar colaboradores". Dono e gerente
gerenciam a equipe das lojas (manager / picker / driver). Depende da **story 07** (scaffold,
`merchant/context`, `can`) e da **story 08** (lojas existem para vincular).

**Fatos do código (reuso):**
- `StoreStaff` (schema): `userId`, `storeId`, `staffRole` (`manager|picker|driver`), `active`,
  `@@unique([userId, storeId, staffRole])`.
- Já existe a lógica de criar staff no admin: `users/admin-users.service.createStaff` cria o
  `User` + role e o vínculo, usando `STAFF_TO_ROLE = { manager: "merchant", picker: "picker",
  driver: "driver" }`. `admin-merchants.service` atualiza/deleta StoreStaff. **Essas rotas são
  `@Roles("admin")`** — não servem ao app merchant.
- `merchant.service` já tem `managerStoreIds`/`assertStore` (escopo por loja do usuário).

**Decisões travadas (refino):**
- **Acesso:** dono e gerente gerenciam colaboradores (decisão de permissão da sessão). **Escopo
  do gerente** = só as lojas onde ele é manager (`managerStoreIds`); o dono abrange todas as
  lojas do merchant.
- **Quem pode criar qual papel:** o **dono** cria/edita/remove qualquer papel (manager, picker,
  driver). O **gerente** gerencia **picker e driver** das suas lojas, mas **não** cria/remove
  outro **manager** (evita escalonamento). Enforced no backend.
- **Reuso, não duplicação:** extrair a lógica de criação de staff para um método compartilhado
  (ou chamar um serviço comum) em vez de duplicar `createStaff`. O endpoint merchant valida o
  escopo (loja pertence ao merchant / ao gerente) antes de delegar.
- Confirma o modelo de auth da story 07: `manager` tem RoleName `merchant` + StoreStaff; owner =
  RoleName `merchant` sem restrição de StoreStaff.
- **Remoção** = desativar vínculo (`active=false`) por padrão; delete real do StoreStaff só pelo
  dono. Não apagar o `User` (pode ter histórico de pedidos/picking).

## Desenho

- **Backend** (`merchant.controller` + `merchant.service`, possivelmente submódulo `staff`):
  - `GET merchant/staff?storeId=` — lista colaboradores das lojas no escopo do usuário
    (gerente: só as dele; dono: todas). Inclui papel + loja + status.
  - `POST merchant/staff` — cria colaborador (`CreateStaffDto`: name, email, password|convite,
    staffRole, storeId). Valida escopo (loja do merchant; gerente só nas dele) e regra de papel
    (gerente não cria manager). Delega à lógica compartilhada de createStaff.
  - `PATCH merchant/staff/:id` — ativar/desativar / trocar papel dentro das regras.
  - `DELETE merchant/staff/:id` — desativa (owner pode deletar de fato).
  - Guards: reusar `assertStore`/`managerStoreIds`; `assertOwner` (story 07) p/ ações
    restritas a manager.
- **Frontend** (`apps/merchant`):
  - `src/api/staff.ts` + hooks `useStaff`, `useCreateStaff`, `useUpdateStaff`, `useRemoveStaff`
    (React Query; invalidam `queryKeys.staff.byStore`).
  - `pages/Staff.tsx`: lista por loja + form (rhf+zod) de novo colaborador; opção de papel
    limitada conforme `can` (gerente não vê "manager"). Ações de editar/desativar.
  - Item de nav "Colaboradores" visível p/ dono e gerente.

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/api test:coverage` + `pnpm --filter @markethub/merchant test:coverage`.
Sem `skip`/`only` injustificado.

- **Backend:**
  - Dono cria manager/picker/driver em qualquer loja do merchant; vínculo + role corretos
    (`STAFF_TO_ROLE`).
  - Gerente cria picker/driver **só** nas suas lojas; criar **manager** → `403/FORBIDDEN`;
    criar em loja fora do escopo → `403`.
  - Email duplicado / vínculo duplicado (`@@unique`) → erro `{code}` tratado.
  - Desativar vs deletar: PATCH `active=false` mantém o User; delete só p/ dono.
  - Lista respeita o escopo (gerente não vê colaboradores de loja alheia).
- **Frontend:** form valida (zod); opção "manager" oculta p/ gerente; mutations invalidam a
  lista; lista filtra por loja.
- `pnpm typecheck` + `pnpm build` verdes.

## Fora de escopo

- Fluxo de convite por e-mail / definição de senha pelo próprio colaborador (criar com senha
  direta basta no MVP; convite é story futura).
- Edição de perfil/permissões finas além de papel + ativo.
- Catálogo (11), pedidos (12), relatórios (13).
