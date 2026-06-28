# Plan: Seguir loja — backend + wiring do botão

## Context

Deriva da **story 33** (bloco BACKLOG `# App customer`): lá o botão "Seguir" foi posicionado no
AppBar da página do mercado (`apps/customer/app/store/[id].tsx`), mas com `onPress` **placeholder
no-op** — **não existe** funcionalidade de seguir no backend (confirmado: nenhum `follow`/`seguir`
em `services/api/src`). Esta story cria a **funcionalidade completa**: persistência + endpoints +
estado seguido/não-seguido + wiring do botão.

### Decisões travadas (refinamento)

- **Segue a LOJA** (`storeId`), não o merchant/rede. Casa com a rota `/store/:id` e espelha o
  padrão de `Favorite` (que é per-store via offer). Seguir a rede inteira fica como evolução
  futura, fora de escopo.
- **Espelhar o módulo `favorites`** (`services/api/src/favorites/*`) — mesmo shape de controller
  fino + service + DTO + `@Roles("customer")` + erros `{ code, message }` em SCREAMING_SNAKE.
- **Estado `following` vem junto do `sections`** (`StoreMeta` da resposta de
  `GET` que alimenta `store/[id]`), evitando uma chamada extra ao abrir a tela. Toggle usa
  POST/DELETE dedicados.
- **Migração React Query da tela `store/[id]`**: como esta story passa a ter server-state real
  do follow (estado + mutations), wirar via **hook React Query** (`queryKeys`), sem
  `useQuery`/`useMutation` inline. (A story 33 deixou a tela com fetch legado; aqui o follow entra
  no padrão correto. Migrar o resto do fetch da tela permanece dívida separada se não for tocado.)

### Dependências

- **Depende da story 33** (botão já posicionado no AppBar). Aqui só wira o `onPress`/estado.

## Desenho

### Backend (`services/api`)

1. **Schema/migration** — novo model `StoreFollow` (espelha `Favorite`):
   ```prisma
   model StoreFollow {
     id        String   @id @default(cuid())
     user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
     userId    String
     store     Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
     storeId   String
     createdAt DateTime @default(now())
     @@unique([userId, storeId])
     @@index([userId])
     @@map("store_follows")
   }
   ```
   - Adicionar relações inversas em `User` (`storeFollows StoreFollow[]`) e `Store`
     (`followers StoreFollow[]`).
   - **Nova migration** (`prisma:migrate`) — nunca editar migration aplicada. Rodar
     `prisma:generate` antes do typecheck.
2. **Módulo `store-follows`** (`services/api/src/store-follows/`), espelhando `favorites`:
   - `StoreFollowsService`: `follow(userId, storeId)` (valida store existe → `STORE_NOT_FOUND`;
     `upsert` na unique `userId_storeId`), `unfollow(userId, storeId)` (`deleteMany` →
     `{ storeId, removed: true }`), `list(userId)` (lojas seguidas, com merchant name/logo),
     `isFollowing(userId, storeId)` (boolean) — reutilizado pelo `sections`.
   - `StoreFollowsController` `@Roles("customer")` `@Controller("store-follows")`:
     `GET` (list), `POST` (`{ storeId }` DTO `@IsString @MinLength(1)`),
     `DELETE :storeId`.
   - Registrar `StoreFollowsModule` em `app.module.ts`.
3. **`sections` (marketplace)**: incluir `following: boolean` no `StoreMeta` retornado para
   `store/[id]` — calculado via `StoreFollowsService.isFollowing(user.id, storeId)` (injetar o
   service no marketplace ou consultar prisma direto no service que monta as sections).

### Tipos compartilhados

- `packages/types`: adicionar `following: boolean` ao tipo do `StoreMeta`/resposta de sections (e
  tipo de item de loja seguida, se exposto). Atualizar os **dois lados** (backend não importa
  `packages/types`, então espelhar o shape na resposta do service e no tipo do app — ver
  `apps/customer/src/api/marketplace.ts` `StoreMeta`).

### Frontend (`apps/customer`)

- `src/api/marketplace.ts`: métodos `followStore(storeId)`, `unfollowStore(storeId)`,
  `followedStores()`; `StoreMeta` ganha `following`.
- `src/lib/queryKeys.ts`: `storeFollows: { all, status: (storeId) => [...] }` conforme uso.
- `src/api/hooks/useStoreFollow.ts`: `useToggleStoreFollow(storeId)` (`useMutation` →
  follow/unfollow, invalida a key e/ou faz update otimista do `following`). O estado inicial
  `following` vem do `sections` já carregado.
- `store/[id].tsx`: o `FollowButton` (criado na story 33) passa a refletir `following` e chamar a
  mutation no `onPress` (remover o TODO/no-op). Feedback visual: estado seguido (coração
  preenchido) vs não-seguido (contorno).

## Validação

Full-stack (backend `api` + app `customer`). **Gate de cobertura: código novo sem teste não
fecha a story.**

### Backend
- `pnpm --filter @markethub/api test` (espelhar `favorites.service.spec.ts` — service
  instanciado com **prisma fake** via `jest.fn()`, sem DB):
  - `follow`: cria/idempotente (upsert) na unique; store inexistente → `STORE_NOT_FOUND`.
  - `unfollow`: remove; idempotente quando não seguia.
  - `list`: retorna lojas seguidas do usuário, ordenadas por `createdAt desc`.
  - `isFollowing`: true/false correto; `sections` reflete `following` do usuário.
  > Nota: o espelho `favorites.service.spec.ts` cobre **apenas** `add`/`remove` (NOT_FOUND,
  > upsert, deleteMany). `follow`/`unfollow` mapeiam 1:1 nesse molde; **`list` e `isFollowing`
  > são casos novos** — o prisma fake ganha `storeFollow.findMany`/`findUnique` (ou `count`)
  > além de `upsert`/`deleteMany`. Não há espelho pronto para esses dois.
- `pnpm --filter @markethub/api prisma:generate` antes do typecheck.
- `pnpm --filter @markethub/api test:coverage` cobrindo service/controller novos.

### Frontend
- `pnpm --filter @markethub/customer test`:
  - `useToggleStoreFollow`: mutation chama follow/unfollow correto e invalida/atualiza o estado.
  - `store/[id]`: botão "Seguir" reflete `following` inicial e alterna ao acionar (mock da API).
- `pnpm --filter @markethub/customer typecheck` + `test:coverage` dos arquivos tocados.

Global: `pnpm typecheck` + `pnpm build`; sem `skip`/`only`/`xfail` injustificado. Verificação
manual (Expo): seguir/deixar de seguir persiste ao reabrir a tela.

## Fora de escopo

- Seguir o **merchant/rede** inteira (só loja por enquanto).
- Tela de "lojas que sigo" / feed de seguidos — só persistência + estado na página da loja
  (endpoint `list` fica pronto para consumo futuro).
- Notificações/realtime de novidades da loja seguida.
- Migrar o restante do fetch legado de `store/[id]` além do follow.
