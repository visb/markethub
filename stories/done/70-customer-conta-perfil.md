# Plan: customer — conta/perfil (editar dados + trocar senha)

## Context

`account.tsx` do customer só tem logout. Não existe endpoint de self-profile (o módulo `users`
só expõe rotas admin), não existe troca de senha, e `User` não tem telefone — campo que o
suporte (story 67) e a comunicação de entrega precisam.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- `User.phone String?` novo (formato BR, validação no DTO; único NÃO — telefone compartilhado
  em família é real).
- Trocar senha exige senha atual e **revoga as outras sessões** (mantém a corrente) — model
  `Session` já existe.
- E-mail **não** editável (é a identidade de login; troca de e-mail com verificação fica
  fora).
- Preferências de notificação ficam **fora** — on/off de push já é coberto por
  permissão do device + registro/remoção de token (story 50).

## Desenho

### Schema

1. Migration: `User.phone String?`.

### Backend (`services/api/src/users` + `auth`)

2. `GET users/me` → `{ id, name, email, phone, roles }` (se `auth` já tiver um "me",
   estender; não duplicar).
3. `PATCH users/me { name?, phone? }` — DTO `@IsOptional` (PATCH parcial padrão do repo);
   phone validado (10–11 dígitos BR, normalizado só-dígitos).
4. `POST users/me/password { currentPassword, newPassword }` — verifica argon2 da atual
   (`INVALID_CURRENT_PASSWORD`), política mínima da senha nova (mesma do registro), rehash,
   revoga demais sessões do user (mantém a corrente).
5. Expor `phone` na busca do suporte (story 67 — `q` também casa telefone agora que existe).

### Customer app

6. `account.tsx` build-out (tela orquestra; lógica nos hooks):
   - Seção "Meus dados": nome, telefone (editáveis — form RHF+zod com `Controller`), e-mail
     read-only.
   - Seção "Segurança": trocar senha (atual + nova + confirmação; sucesso → toast).
   - Entradas de navegação: "Endereços" (story de endereços) e "Sair" (existente).
7. Hooks `useMe`/`useUpdateMe`/`useChangePassword` em `src/api/hooks/`, query keys
   centralizadas; máscara de telefone no input.

## Validação

- Backend: specs do me/patch (parcial: `undefined` não toca, phone inválido nega), troca de
  senha (atual errada nega, sessões alheias revogadas, corrente sobrevive, rehash valida
  login novo). Migration limpa. `pnpm --filter @markethub/api test`.
- Customer: forms (validação zod, máscara, submit feliz/erro), e-mail não editável.
  `pnpm --filter @markethub/customer test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  customer ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm --filter @markethub/api prisma:generate` antes do typecheck; `pnpm typecheck` + build.

## Fora de escopo

- Troca de e-mail (verificação por link/código).
- Reset de senha esquecida (fluxo sem login — story própria futura).
- Preferências de notificação granulares.
- Deletar conta (LGPD — story própria futura).
- Telas de conta de picker/driver/merchant (padrão replicável depois).
