# CLAUDE.md

Guidance de alta prioridade para Claude Code neste repositório. Documenta o que **não** é óbvio pelo código — não repete `package.json`/estrutura. Carregado todo turno: cada linha custa contexto.

---

## Projeto

**MarketHub** — plataforma brasileira de marketplace + delivery de supermercados. App cliente faz pedido; o próprio mercado separa (picking) e entrega (entrega própria ou retirada). Painel admin para operação e curadoria de catálogo.

Monorepo pnpm + Turborepo. Backend NestJS centralizado, apps mobile Expo, painel admin Vite.

```
apps/
  customer/   ← Expo / React Native — app do cliente (expo-router)
  picker/     ← Expo / React Native — separador (picking)
  driver/     ← Expo / React Native — entregador
  admin/      ← Vite + React SPA — painel administrativo
services/
  api/        ← backend NestJS + Prisma + PostgreSQL
packages/
  api-client/ ← cliente HTTP + socket compartilhado (@markethub/api-client)
  types/      ← contratos/tipos compartilhados (@markethub/types)
  ui/         ← componentes RN compartilhados (source; Metro transpila)
infra/        ← docker-compose (Postgres, Redis, MinIO)
stories/      ← roadmap + stories flat (stories/NN-slug.md); concluídas em stories/done/
```

Regra de boundary: `apps/` só frontend; backend em `services/`. Código cruzando workspaces vai em `packages/` — nunca import relativo atravessando o limite de um app/service.

Workspace names: `@markethub/{customer,picker,driver,admin,api,api-client,types,ui}`.

---

## Comandos essenciais

```bash
pnpm install
pnpm infra:up                 # Postgres, Redis, MinIO via docker
pnpm dev                      # todos os apps (turbo)
pnpm dev:api                  # só backend  → http://localhost:3000
pnpm dev:admin                # só admin    → http://localhost:5173 (vite)
pnpm dev:customer             # Expo (QR no terminal)
pnpm dev:picker / dev:driver  # Expo

pnpm --filter @markethub/api prisma:generate   # após mudar schema
pnpm --filter @markethub/api prisma:migrate    # criar migration (dev)
pnpm --filter @markethub/api db:seed           # seed
```

| Validação | Comando |
|---|---|
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Build | `pnpm build` |
| Testes | `pnpm test` |

**Antes de declarar "pronto":** rodar `pnpm typecheck` + `pnpm build`. Se tocou lógica de backend, `pnpm --filter @markethub/api test`. Não confiar só em ler o diff.

> `prisma generate` precisa rodar antes do typecheck quando o schema mudou — o client gerado é importado em todo o backend.

---

## Antes de criar qualquer arquivo

1. **Já existe hook de query/mutation para esse recurso?** Procurar em `src/api/hooks/` (ou `features/<domínio>/hooks/`) antes de criar. Não duplicar chamada HTTP.
2. **Já existe módulo de API tipado?** Front consome via `@markethub/api-client`; chamada nova entra em `apps/<app>/src/api/`, não solta na tela.
3. **Esse tipo é contrato de API consumido pelos apps?** Vai em `packages/types` (re-exportado por `@markethub/api-client`), não duplicado por app. O backend **não** importa `packages/types` — ao mudar uma resposta, atualizar os dois lados.
4. **Essa lógica é service ou controller?** Controller só valida entrada (DTO) e roteia. Regra de negócio no service.
5. **Já existe migration cobrindo a mudança de schema?** Nunca editar migration existente — criar nova.
6. **Componente RN reutilizável entre apps?** Vai em `packages/ui`; específico fica no app.

---

## Arquitetura — backend (`services/api`)

Módulos por domínio em `src/`: `auth · catalog · marketplace · merchant · picking · driver · payment · enrichment · erp · reviews · scheduling · notifications · geocoding · storage · queue · users · admin`.

- **Controller fino:** valida com DTO + `class-validator`, roteia. Sem regra de negócio.
- **DTO de PATCH:** campos `@IsOptional()` → body parcial é esperado. Tratar `undefined` (ausente) ≠ `null`. Padrão de "salvar só o alterado" depende disso (ver `lockedFields`).
- **Erros:** lançar com shape `{ code, message }` — `code` em SCREAMING_SNAKE para o front discriminar (ex.: `PRODUCT_NOT_FOUND`).
- **Prisma:** IDs `cuid`. Acesso a banco só via Prisma na camada do módulo. Nunca editar migration aplicada — nova migration sempre.
- **Integração externa atrás de interface + mock** (ver `payment/payment-provider.interface.ts` + `providers/`). Permite testar sem rede e trocar provedor.
- **Fila/jobs:** BullMQ + Redis (`queue/`). **Realtime:** Socket.IO (gateways nos módulos; cliente em `@markethub/api-client/socket`).

---

## Arquitetura — frontends

**Padrão obrigatório (todos os apps):** server-state via **React Query** (`@tanstack/react-query`); formulários via **react-hook-form + zod**. Código legado que ainda usa `useState`/`useEffect` para fetch ou campos de form **migra ao ser tocado** — não escrever feature nova no padrão antigo.

### Camada de dados

- **Cliente HTTP:** `@markethub/api-client` (`ApiClient`) — injetado via `auth-context.tsx`. Pegar a instância com `useAuth()`, não instanciar solto.
- **Módulos de API tipados:** `apps/<app>/src/api/*.ts` exportam interfaces + funções que recebem `ApiClient`. Toda chamada entra aí, tipada — nunca `request`/`fetch` cru em tela/componente.
- **Hooks de query/mutation:** encapsular cada chamada num hook. Queries e mutations do mesmo recurso no mesmo arquivo. Fetch condicional via `options?: { enabled?: boolean }`.
  ```ts
  // src/api/hooks/useProducts.ts (ou features/<domínio>/hooks)
  export function useProducts() { return useQuery({ queryKey: queryKeys.products.all, queryFn: ... }); }
  export function useProduct(id: string) { ... }
  export function useUpdateProduct(id: string) { return useMutation({ ... }); }
  ```

### Query keys — regra mais violada

NUNCA string literal como query key fora de `src/lib/queryKeys.ts` (criar se não existir).
```ts
useQuery({ queryKey: queryKeys.products.all, queryFn });   // ✅
useQuery({ queryKey: ['products'], queryFn });              // ❌
```

### Telas não fazem fetch

NUNCA importar `useQuery`/`useMutation`/`useForm` direto numa page/route. Tela orquestra hooks + componentes; sem lógica de fetch inline.

### Formulários

SEMPRE `react-hook-form` + `zod` (`zodResolver`). NUNCA `useState` para campo de form.
```ts
const schema = z.object({ name: z.string().min(1) });
const { register, handleSubmit, formState:{errors} } = useForm({ resolver: zodResolver(schema) });
```
Em React Native, SEMPRE `Controller` — `TextInput` não suporta `register`.

### Mobile (`customer`, `picker`, `driver`) — Expo + expo-router

- Roteamento **file-based** em `app/` (`home.tsx`, `cart.tsx`, `product/`, `checkout.tsx`, `_layout.tsx`...). Nova tela = novo arquivo de rota; a route só orquestra.
- `QueryClientProvider` no `_layout.tsx` raiz. Estado de UI/local (carrinho, prefs, location) pode seguir em hooks dedicados (`use-cart.ts`); **server-state** vai pra React Query.
- `prefs`/storage: usar os helpers existentes (fallback localStorage no web) — não acessar storage direto.

### Admin (`apps/admin`) — Vite + react-router-dom

- `QueryClientProvider` no topo (`App.tsx`/`main.tsx`). Telas em `src/pages/`, componentes em `src/components/`, auth em `src/auth/`.
- Page consome hooks de query/mutation; sem `api.request` + `useState`/`useEffect` para fetch.

---

## Domínio — termos-chave

> Invariantes completas (status, cancelamento, reembolso, picking, delivery, lockedFields) em **`BUSINESS_RULES.md`** — conferir antes de tocar nesses fluxos.

- **saleType** (`unit` | `weight`): dirige o input do carrinho. Peso medido em **gramas**.
- **lockedFields**: campos do produto travados contra enriquecimento automático. Só os campos **editados** pelo admin travam — o save manda apenas o diff; o resto segue recebendo enriquecimento.
- **enrichment**: pipeline que completa dados do produto via **Cosmos/Bluesoft (GTIN)** + Claude (mapeamento de categoria). Respeita `lockedFields`.
- **erp**: ingestão de catálogo/preço/estoque das lojas (conector CSV mock em `services/api/src/erp` + fixtures).
- **Entrega own-store:** MVP — o próprio mercado entrega ou cliente retira. Não há marketplace de entregadores; `driver` é entregador da loja.
- **merchant / store:** merchant é a rede; store é a loja física. Catálogo é deduplicado/enriquecido entre lojas.

---

## Identidade e roles

`RoleName` (enum Prisma): `customer · picker · driver · merchant · admin`.
Staff de loja (`StaffRole`): `manager · picker · driver`.

- Auth centralizada em `User` (JWT access + refresh; segredos via env).
- Admin protege rotas com `@Roles("admin")`.

---

## Integrações externas

| Serviço | Uso | Env | Swappable |
|---|---|---|---|
| Pagar.me | PIX | `PAYMENT_PROVIDER`, `PAGARME_SECRET_KEY`, `PAGARME_WEBHOOK_SECRET` | sim — atrás de `PaymentProvider` + mock |
| Cosmos/Bluesoft | enriquecimento GTIN | `COSMOS_TOKEN`, `COSMOS_BASE_URL` | — |
| Google Maps | geocoding/endereço | `GOOGLE_MAPS_API_KEY` | — |

Sem segredos no código. Tudo via env — ver `.env.example`. Nunca commitar `.env`.

---

## Convenções

- **Commits:** Conventional Commits em **pt-BR**, escopo = story/área: `feat(S6.2): ...`, `fix(admin): ...`, `refactor: ...`. Mensagem em português normal.
- **TS:** `strict` na base (`tsconfig.base.json`); cada workspace estende. Não relaxar flag global para calar erro local.
- **Stories:** flat em `stories/NN-slug.md` (numeração sequencial de 2 dígitos); cada story = `.md` com objetivo + checklist. Ler a story antes de codar a feature; registrar arquivos tocados ao concluir. Concluídas vão para `stories/done/` (flat, `git mv`) — **não** agrupar por `phase-NN`. Roadmap: `stories/ROADMAP.md`. (Stories legadas em `stories/phase-*` e `stories/done/phase-*` ficam onde estão.)
- **Commit/push só quando o usuário pedir.** Não misturar mudança não relacionada no mesmo commit.

---

## CI (`.github/workflows/ci.yml`)

`install → prisma generate → lint → typecheck → build → migrate deploy → test`. Filtros usam **nome** do workspace (`--filter @markethub/api`), não path — mover pastas não quebra CI desde que o nome do pacote não mude.

---

## Armadilhas conhecidas

- **Prisma `P1001` no Windows:** port-forward do Docker cai apesar de healthy → `docker restart` do container do Postgres.
- **pnpm + build scripts:** versões novas exigem aprovar scripts no `pnpm-workspace.yaml` (`allowBuilds`: prisma, @prisma/client, @prisma/engines, argon2, msgpackr-extract). Sem isso `pnpm install` falha com `ERR_PNPM_IGNORED_BUILDS`.
- **`packages/types` no mobile:** Metro transpila o source; ao mudar tipos, reiniciar o dev server do app que consome.
- **`prisma generate` antes do typecheck** após mudança de schema (ver acima).

---

## O que NÃO fazer

- Não pôr backend em `apps/` (só frontend) nem lógica de negócio em controller.
- Não espalhar chamada HTTP crua em telas — usar hook (React Query) + módulo tipado em `src/api/`.
- Não fazer fetch com `useState`/`useEffect` nem campo de form com `useState` — React Query e react-hook-form+zod são obrigatórios.
- Não usar query key literal fora de `queryKeys.ts`.
- Não editar migration aplicada — criar nova.
- Não inventar nome de script — conferir `package.json` raiz primeiro.
- Não commitar/push sem o usuário pedir.
