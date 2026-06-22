# Plan: role "administrador" no app merchant (acima de gerente)

## Context

O dono do mercado precisa de um nível **administrador** no app merchant que não fique no mesmo
patamar que o gerente. Hoje o backend tem dois níveis: **owner** (`RoleName merchant` — dono da
rede, acesso a todas as lojas e qualquer papel) e **manager** (`StoreStaff manager` — só as
lojas dele, gere picker/driver, não cria outro manager). Falta um papel **administrador** de
loja, explícito, acima do gerente.

Bloco do BACKLOG (RBAC): "para o dono do mercado, precisamos criar uma role 'administrador' no
app merchant, nao podemos mante-lo no mesmo nivel q gerente."

Esta é a **primeira** das 3 stories do bloco RBAC. As stories **17** (gerente restrito à loja +
sem integração) e **18** (gerente cria só nível inferior) **dependem** do novo papel definido
aqui.

### Decisões travadas

- **Novo `StaffRole admin`** (nível de loja), adicionado ao enum, **acima de manager**. Não é o
  mesmo que o owner: o owner (`RoleName merchant`) continua sendo o topo, dono da rede, com
  acesso a todas as lojas; o `admin` é o administrador **da loja** (vínculo `StoreStaff`), com
  acesso total àquela loja, incluindo integração, e poder de gerir manager/picker/driver.
- **Hierarquia de gestão de equipe (final do bloco):**
  - owner → qualquer papel, todas as lojas da rede (mantém o atual).
  - admin → manager | picker | driver, dentro do escopo das lojas dele.
  - manager → picker | driver apenas (story **18**).
- O app merchant passa a reconhecer o nível do usuário (owner / admin / manager) e ajustar
  login + navegação (detalhe de gate fica nas stories 17/18; aqui entra o reconhecimento do
  novo papel e a base de UI).

## Desenho

### Backend (`services/api`)

- **Schema/migration:** adicionar `admin` ao enum `StaffRole` em `prisma/schema.prisma`.
  **Nova migration**; `prisma generate` antes do typecheck. Conferir todos os `switch`/checagens
  de `StaffRole` no código (TS `strict` aponta os exaustivos que faltarem tratar).
- **`merchant-staff.service.ts`:** estender o escopo para o papel `admin`:
  - `assertCanManageRole`: além de "só owner mexe em manager", permitir que **admin** crie/edite
    manager|picker|driver dentro do escopo das lojas dele. Manager segue sem poder mexer em
    manager nem em admin (detalhado na story 18).
  - Resolver o nível efetivo do usuário (owner via `RoleName`, senão maior `StaffRole` ativo nas
    lojas em escopo).
- **`merchant-context`:** expor o nível do usuário (ex: `level: "owner" | "admin" | "manager"`)
  para o app decidir UI. Tipo de resposta em `packages/types` + `@markethub/api-client`.

### Frontend (`apps/merchant`)

- Ler o nível do usuário a partir do contexto (`merchant-context`) via hook React Query
  existente; expor no auth/context do app.
- Base de UI: o menu/nav e o rótulo do usuário refletem o nível. Os gates específicos
  (integração, escopo de loja, criação de papéis) vêm nas stories 17/18, mas a leitura do nível
  e o ponto de decisão entram aqui.
- Atualizar `StaffForm` para permitir selecionar `admin` quando o ator tem direito (owner/admin).

## Validação

> **Gate de cobertura — código novo sem teste não fecha a story.** Rodar
> `pnpm --filter @markethub/api test:coverage` e `pnpm --filter @markethub/merchant test:coverage`.
> Sem `skip`/`only`/`xfail` injustificado. Antes de "pronto": `pnpm typecheck` + `pnpm build`
> (e `prisma generate` após o schema mudar).

- **Backend (`merchant-staff.service.spec.ts`, `merchant-context.service.spec.ts`):** admin cria
  manager|picker|driver no escopo dele; admin NÃO escapa do escopo de loja; owner segue podendo
  tudo; nível efetivo resolvido corretamente (owner > admin > manager). Cobrir o enum novo nas
  checagens exaustivas.
- **Frontend:** hook/context expõe o nível; `StaffForm` oferece `admin` só pra quem pode; teste
  de que a nav reflete o nível (base — gates detalhados testados em 17/18).

## Fora de escopo

- Gate da página de Integração e restrição de escopo do gerente (story **17**).
- Regra "gerente cria só picker/driver" detalhada + bloqueio de escalonamento (story **18**).
- Veículos (stories 14/15).
