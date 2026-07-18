# Plan: Perfil — "Meus dados" e "Segurança" como itens de menu

## Context

A tela de conta do customer (`app/account.tsx`, story 70) renderiza "Meus dados" (ProfileForm) e
"Segurança" (ChangePasswordForm) **inline**, acima do menu de navegação. Fica uma tela longa,
com dois formulários abertos que quase nunca são usados. A story move os dois para **itens de
menu**, cada um com tela própria — a conta vira um hub de navegação limpo.

Decisões (interpretação direta do item, sem ambiguidade):

- Rotas novas `app/account/profile.tsx` ("Meus dados") e `app/account/security.tsx`
  ("Segurança"); expo-router aceita `account.tsx` + `account/` coexistindo.
- Menu na ordem: Meus dados · Segurança · Minhas compras · Favoritos · Endereços · Sair.
- Reuso total: `ProfileForm`, `ChangePasswordForm` e hooks de `useAccount` movem de tela sem
  mudança de lógica; toasts de sucesso e erros inline preservados.

## Desenho

- `app/account.tsx`: remove as seções inline e os usos de `useMe`/`useUpdateMe`/
  `useChangePassword` (header mantém `useMe` para nome/e-mail); adiciona as duas linhas novas no
  array `rows` (ícones ex.: `person-outline`, `shield-checkmark-outline`).
- `app/account/profile.tsx` nova: header com voltar, orquestra `useMe` + `useUpdateMe` +
  `ProfileForm` (mesmo comportamento atual: nome/telefone editáveis, e-mail read-only, toast ✓).
- `app/account/security.tsx` nova: orquestra `useChangePassword` + `ChangePasswordForm`
  (toast ✓, erro inline).
- Rotas só orquestram — fetch/mutation permanecem nos hooks, forms nos componentes (padrão do
  repo). Sem mudança de backend, contratos ou `packages/types`.

## Validação

- `pnpm --filter @markethub/customer test:coverage` — casos: account renderiza as 6 linhas e
  navega para `/account/profile` e `/account/security`; tela de perfil salva patch e mostra
  toast; tela de segurança troca senha e exibe erro da API; forms não renderizam mais inline na
  conta. Ajustar testes existentes da account screen que cobrem os forms inline.
- `pnpm typecheck` + `pnpm build`.
- **Gate:** código novo sem teste não fecha a story (diff ≥ 90%); sem `skip`/`only` injustificado.

## Fora de escopo

- Campos novos de perfil (avatar, CPF etc.) e qualquer mudança de backend.
- 2FA/sessões ativas na tela de segurança — só a troca de senha existente.
- Perfil nos apps picker/driver/merchant.
