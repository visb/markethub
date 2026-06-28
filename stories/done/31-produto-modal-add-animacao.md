# Plan: Modal de produto — add fecha (sem redirect) + animações slide

## Context

**Bloco BACKLOG `# App customer`** (contexto compartilhado das stories 31–33).

A tela de detalhe do produto (`apps/customer/app/product/[id].tsx`) é, na prática, uma
**rota full-screen** do expo-router (não um componente `Modal`). Hoje:

- Ao clicar **"Adicionar"** (footer, oferta principal) ela chama `mkt.addItem(...)` e em
  seguida **`router.push("/cart")`** (linha 77) — ou seja, **redireciona pro carrinho**. O
  comportamento desejado é: adicionar e **fechar o modal** (animação descendo), sem ir pro
  carrinho.
- A rota é registrada no `Stack` default (`app/_layout.tsx`), então abre/fecha com a animação
  padrão de stack (slide horizontal). O desejado é **abrir de baixo→cima** e **fechar de
  cima→baixo** (apresentação tipo modal).

### Decisões travadas (refinamento)

1. **Feedback pós-add:** criar um **toast leve** reutilizável no customer
   (ex.: `src/components/Toast.tsx` + `useToast`/provider) exibindo "Adicionado ✓"; ao
   confirmar, o modal desce e fecha. Não existe util de toast no app hoje — é novo.
2. **Escopo do "fechar":** **somente a oferta principal** (botão "Adicionar" do footer) passa a
   adicionar + fechar. Os botões "Adicionar" das **outras ofertas** ("Preço em outros
   mercados", linha 192) **mantêm o comportamento atual** (`addFromOffer` → `router.push("/cart")`).
   → `addFromOffer` precisa ser parametrizado para fechar OU navegar conforme a origem.
3. **Migração React Query:** a tela ainda busca `productDetail`/`favorites` via
   `useState`/`useEffect` (legado). Como a story toca o arquivo, **migrar o server-state pra
   React Query** (CLAUDE.md): hooks dedicados + `queryKeys`. Estado de UI local (qty, grams,
   note, prep, outOfStock) segue em `useState`.

### Dependências

- Stories **32** e **33** mexem em outra tela (`/store/:id`) — independentes desta.

## Desenho

### 1. Apresentação tipo modal (animação baixo→cima / cima→baixo)

- Registrar a rota `product/[id]` com `presentation: "modal"` (e, no Android, `animation:
  "slide_from_bottom"`) via `<Stack.Screen name="product/[id]" options={{ presentation:
  "modal", animation: "slide_from_bottom" }} />` no `app/_layout.tsx` (hoje o `Stack` não
  declara screens individuais — adicionar só esta sem quebrar as demais rotas).
- Fechar = `router.back()` (a animação de saída do `presentation: "modal"` desce). Confirmar em
  iOS e Android que a saída é cima→baixo; se o Android não honrar, manter `animation:
  "slide_from_bottom"` (a saída reverte a entrada).

### 2. Add da oferta principal → toast + fecha

- Novo componente `src/components/Toast.tsx` + `ToastProvider`/`useToast` (montado no
  `_layout.tsx` raiz, abaixo do `AuthProvider`). API mínima: `toast.show("Adicionado ✓")`,
  auto-dismiss (~2s), animação de fade/slide simples. Reutilizável pelas próximas telas.
- Parametrizar `addFromOffer(offerId, opts?: { closeAfter?: boolean })`:
  - oferta **principal** (footer): `closeAfter: true` → após `addItem`, `toast.show("Adicionado ✓")`
    e `router.back()`.
  - **outras ofertas**: comportamento atual (`router.push("/cart")`).

### 3. Migração para React Query

- `src/api/hooks/useProductDetail.ts`:
  - `useProductDetail(id)` → `useQuery` com `queryKeys.products.detail(id)` chamando
    `mkt.productDetail(id)`; `enabled: !!id`.
  - `useFavorites()` → `useQuery` (`queryKeys.favorites.all`) e
    `useToggleFavorite()`/`useAddFavorite`/`useRemoveFavorite` → `useMutation` invalidando
    `queryKeys.favorites.all`.
  - `useAddCartItem()` → `useMutation` (`mkt.addItem`) para o add não ficar solto na tela;
    invalida a key do carrinho se houver (ver `use-cart`/`marketplace`).
- `src/lib/queryKeys.ts`: adicionar
  ```ts
  products: { detail: (id: string) => ["products", "detail", id] as const },
  favorites: { all: ["favorites"] as const },
  ```
- A rota `product/[id].tsx` passa a **orquestrar** os hooks (sem `useQuery`/`useMutation`
  inline) — segue a regra "telas não fazem fetch". O `prep`/`outOfStock` default derivado de
  `product.prepOptions` move para `useEffect`/`useMemo` sobre o dado do hook.

## Validação

Frontend-only (app `customer`). **Gate de cobertura: código novo sem teste não fecha a story.**

- `pnpm --filter @markethub/customer test` (Jest/RNTL) cobrindo:
  - **hook `useProductDetail`**: monta query com a key correta; `enabled` desliga sem `id`;
    retorna `product`. (Espelhar `useNearbyStores.test.tsx`.)
  - **`useToggleFavorite`/favoritos**: mutation chama o método certo e invalida
    `queryKeys.favorites.all`.
  - **comportamento do add (oferta principal)**: ao acionar "Adicionar" do footer, chama
    `addItem` e dispara `router.back()` (mock do `expo-router`) — **não** chama `router.push("/cart")`.
  - **outras ofertas**: "Adicionar" de oferta secundária chama `router.push("/cart")` (mantido).
  - **Toast**: `useToast`/`ToastProvider` mostra a mensagem e auto-dismiss (timer fake).
- `pnpm --filter @markethub/customer typecheck`.
- `pnpm test:coverage` do customer sobre os arquivos tocados; sem `skip`/`only`/`xfail`
  injustificado.
- Verificação manual (Expo): abrir produto (slide up), "Adicionar" principal → toast + modal
  desce e fecha (sem ir pro cart); "Adicionar" de outro mercado → vai pro cart.

## Fora de escopo

- Mudar layout/conteúdo do detalhe do produto além do botão/animação.
- Tornar o detalhe um `Modal` RN de verdade (continua rota expo-router com `presentation: modal`).
- Migrar fetch de outras telas — só a rota `product/[id]`.
- Sistema de toast global avançado (filas, tipos de severidade) — toast mínimo reutilizável basta.
