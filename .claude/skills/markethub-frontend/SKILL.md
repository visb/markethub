---
name: markethub-frontend
description: Padrões dos frontends MarketHub — apps mobile customer/picker/driver (Expo Router/React Native) e admin (React/Vite). Arquitetura-alvo em vertical slices (features/) + MVVM (Model = @markethub/types + @markethub/api-client + src/api tipado; ViewModel = hooks React Query/react-hook-form; View = rotas/pages + components), cliente HTTP/socket compartilhado, roteamento file-based (mobile) e react-router (admin), state de carrinho/prefs/location, realtime via socket. Use ao editar apps/customer, apps/picker, apps/driver ou apps/admin.
---

# Guia dos frontends MarketHub para IA

## Apps

- `apps/customer` — Expo Router / React Native — app do cliente (catálogo, carrinho, checkout, tracking).
- `apps/picker` — Expo Router / React Native — separador (picking).
- `apps/driver` — Expo Router / React Native — entregador (entrega própria da loja).
- `apps/admin` — React + Vite (react-router-dom) — painel administrativo e curadoria de catálogo.

Todos consomem `@markethub/types` (contratos), `@markethub/api-client` (HTTP + socket + token-store) e, no mobile, `@markethub/ui` (componentes RN compartilhados — source, Metro transpila).

> **Estado atual ≠ alvo.** O código existente ainda usa `useState`/`useEffect` para fetch e telas flat (admin `pages/`, mobile `app/`). A arquitetura abaixo é **obrigatória para código novo**; o legado **migra ao ser tocado**. React Query + react-hook-form/zod ainda **não estão instalados** nos apps — a primeira feature nova adiciona deps + `QueryClientProvider` + `queryKeys.ts` (ver "Setup base").

---

## Arquitetura: vertical slices + MVVM

Organização em **vertical slices** (uma pasta por domínio, autossuficiente); cada slice segue **MVVM**. O slice é a fatia vertical; o MVVM é como as camadas se dividem **dentro** do slice.

### Vertical slice (fatia por domínio)

```
features/<domínio>/        ← ex.: catalog, cart, checkout, orders, tracking, picking, delivery
  hooks/        ← ViewModel: queries, mutations, estado derivado, lógica de form
  pages/        ← View de orquestração (compõe hooks + componentes; sem fetch)
  components/   ← View de apresentação (dumb; recebe props, emite eventos)
  constants.ts  ← labels, variantes, mapas de exibição do domínio
  lib/          ← helpers puros do domínio (formatadores, cálculos de preço/peso)
```

Regras do slice:

- **Autossuficiente:** um slice não importa `hooks/`, `components/` ou `lib/` internos de **outro** slice. Código compartilhado sobe para `components/shared/`, `src/lib/`, `src/hooks/` ou — se for HTTP — para o módulo de API tipado (`src/api/`).
- **Borda do slice é o ViewModel:** o que sai do slice é um hook ou componente exportado com nome próprio — nunca estado cru.
- Domínio novo = pasta nova em `features/`, não espalhar em `pages/`/`components/` globais.

### MVVM (camadas dentro do slice)

| Camada | É | Onde vive | Regras |
|---|---|---|---|
| **Model** | dados + contrato + domínio | `@markethub/types`, `@markethub/api-client`, `apps/<app>/src/api/*.ts`, `features/<d>/constants.ts`, `features/<d>/lib/` | Sem React. Tipos, chamadas HTTP tipadas, regras puras (ex.: cálculo por `saleType`/gramas). |
| **ViewModel** | estado + lógica + I/O | `features/<d>/hooks/` | Todo `useQuery`/`useMutation`/`useForm`/estado derivado vive aqui. Expõe dados prontos + handlers. Um hook por responsabilidade. |
| **View** | UI | `features/<d>/pages/` (orquestração) + `features/<d>/components/` (apresentação) | **Não** faz fetch, **não** tem regra de negócio. Lê do ViewModel e renderiza. |

Fluxo: **View → hook (ViewModel) → Model (`src/api` / `@markethub/api-client` / types)**. A View nunca pula direto para o Model.

#### O que isso proíbe

- ❌ `useQuery`/`useMutation`/`useForm` numa **page/route**. Page só compõe hooks + componentes.
  ```ts
  // ✅ ViewModel — features/catalog/hooks/useProducts.ts
  export function useProducts(storeId: string) {
    const { api } = useAuth();
    return useQuery({ queryKey: queryKeys.products.byStore(storeId), queryFn: () => listProducts(api, storeId) });
  }

  // ✅ View de orquestração — features/catalog/pages/CatalogPage.tsx
  export function CatalogPage() {
    const { data, isLoading } = useProducts(storeId);   // ViewModel
    if (isLoading) return <LoadingState />;
    return <ProductGrid products={data?.items ?? []} />; // View de apresentação
  }
  ```
- ❌ Fetch/regra dentro de componente de apresentação — recebe props, emite callbacks.
- ❌ Query key como string literal fora de `src/lib/queryKeys.ts`.
- ❌ `useState` para campo de formulário — usar `react-hook-form` + `zod` (no RN sempre `Controller`). Schema/`useForm`/submit são ViewModel; o JSX do form é View.
- ❌ Cast manual de erro de API — usar `getErrorMessage(error, fallback?)` de `src/lib/errors.ts` (criar se não existir; o `@markethub/api-client` expõe `ApiError`).
- ❌ Loading/empty/error ad-hoc — usar componentes de estado compartilhados (`LoadingState`/`EmptyState`/`ErrorState`).
- ❌ Componente > ~150 linhas ou com mais de uma responsabilidade visual — quebrar (extrair item de lista, header, card).

#### Dialogs/sheets autossuficientes

Modal/bottom-sheet é uma View com seu próprio ViewModel: busca seus dados via hook do slice (`{ enabled: open }`), sem prop drilling de dados que só ele usa.

---

## Model: cliente HTTP/socket + módulos de API

`@markethub/api-client` é **transporte fino** (não tem módulos por domínio):

- `client.ts` — `ApiClient` (`request`, auth).
- `socket.ts` — conexão Socket.IO (realtime: tracking de pedido, status de picking/delivery).
- `token-store.ts` — persistência de tokens. Não reimplementar.
- `index.ts` re-exporta tipos de `@markethub/types`.

**Chamadas de domínio ficam no app**, tipadas, em `apps/<app>/src/api/*.ts` (ex.: `customer/src/api/marketplace.ts`): exportam interfaces + funções que **recebem `ApiClient`**. Pegar a instância via `useAuth()`; nunca instanciar solto nem fazer `request` cru numa tela. Antes de criar chamada, ver se já existe no `src/api/` do app.

---

## `apps/admin` (React + Vite)

- Roteamento: `react-router-dom` em `src/App.tsx` (`BrowserRouter` + `ProtectedRoute` + `Layout`). Auth: `src/auth/auth-context.tsx` + `token-store.ts`.
- Alvo: telas em `src/features/<domínio>/pages/`, apresentação em `components/`. (Hoje flat em `src/pages/` — `Catalog`, `Orders`, `ProductDetail`, `Users`, `merchant/`, `merchants/`… — migrar ao tocar.)
- Componentes base/cross-slice em `src/components/`. Estados compartilhados em `components/shared/`.
- `QueryClientProvider` no topo (`App.tsx`/`main.tsx`). Query keys em `src/lib/queryKeys.ts`. Erros em `src/lib/errors.ts`.
- Formulários: `react-hook-form` + `zod` + `@hookform/resolvers` (lógica no hook, JSX na page/component).
- Tela precisa de dado novo → módulo tipado em `src/api/` → hook de query/mutation no slice → page orquestra.

---

## `apps/customer`, `apps/picker`, `apps/driver` (Expo Router / RN)

- Roteamento **file-based** em `app/` (ex. customer: `home.tsx`, `cart.tsx`, `checkout.tsx`, `product/`, `store/`, `track/`, `_layout.tsx`). Nova tela = novo arquivo de rota; a route só orquestra (compõe hooks + componentes do slice).
- Providers no `app/_layout.tsx` raiz: hoje `SafeAreaProvider` + `AuthProvider`; **adicionar `QueryClientProvider`** ao introduzir React Query.
- Auth/sessão: `src/auth-context.tsx` + `src/token-store.ts` por app.
- **Estilo: `StyleSheet.create`** (RN puro — este projeto **não** usa NativeWind/Tailwind). Componentes RN reutilizáveis entre apps vão em `@markethub/ui`.
- **Server-state → React Query.** Estado de **UI/local** segue em hooks dedicados em `src/`:
  - `use-cart.ts` — carrinho (input dirigido por `saleType`: `unit` vs `weight` em gramas).
  - `prefs.ts`, `location.ts` — preferências/endereço (com fallback localStorage no web). Usar os helpers; **não** acessar storage direto.
- **Forms:** `react-hook-form` + `zod`; no RN **sempre** `Controller` (`TextInput` não aceita `register`).
- **Realtime:** tracking de pedido e status de picking/delivery via `@markethub/api-client/socket` — encapsular a subscription num hook do slice (ViewModel), não na tela.

---

## Tipos compartilhados (Model)

`packages/types/src/index.ts` é o contrato comum (backend + frontends). Ao alterar tipos:

1. Atualizar consumidores backend/frontend do contrato.
2. Garantir que `@markethub/api-client` re-exporta os tipos novos se forem públicos.
3. Mobile: Metro transpila `packages/*` do source — reiniciar o dev server do app que consome.

---

## Setup base (primeira adoção de React Query / rhf por app)

Ao tocar o primeiro fluxo de um app ainda não migrado:

1. Adicionar deps no app: `@tanstack/react-query`, `react-hook-form`, `zod`, `@hookform/resolvers`.
2. Envolver a raiz com `QueryClientProvider` (mobile: `app/_layout.tsx`; admin: `App.tsx`/`main.tsx`).
3. Criar `src/lib/queryKeys.ts` (factory de keys) e `src/lib/errors.ts` (`getErrorMessage`).
4. Migrar o fluxo tocado para o padrão MVVM; deixar 1 hook/slice como referência.

---

## Validação recomendada

- Admin: `pnpm --filter @markethub/admin build` (tsc + vite).
- Mobile: sem build de produção no fluxo dev — validar tipos com `pnpm --filter @markethub/customer exec tsc --noEmit` (idem picker/driver) ou subir `pnpm dev:customer`.
- Tipos/cliente compartilhado: `pnpm typecheck` na raiz cobre os workspaces.
