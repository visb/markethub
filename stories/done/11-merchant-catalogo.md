# Plan: App merchant — visualizar e gerenciar catálogo

## Context

Bloco **criar app merchant** do BACKLOG, faceta "visualizar e gerenciar catálogo de produtos".
Dono e gerente veem e editam ofertas, estoque e produtos das suas lojas no app merchant.
Depende da **story 07** (scaffold, `merchant/context`, `can`) e da **story 08** (lojas).

**Fatos do código — backend já existe (é faceta majoritariamente frontend):**
- `merchant.controller` (`@Roles("merchant","admin")`):
  - Ofertas: `GET merchant/offers` (filtros storeId/categoryId/search/available), `PATCH
    merchant/offers/:id`, `DELETE merchant/offers/:id/locks/:field`.
  - Estoque: `GET merchant/stocks`, `PATCH merchant/stocks/:id`, `DELETE
    merchant/stocks/:id/locks/:field`.
  - Produtos (S3.10): `POST merchant/products/upload-url`, `POST merchant/products`, `PATCH
    merchant/products/:id`.
- `merchant.service` aplica escopo por loja (`requireStores`/`assertStore`) → gerente já fica
  restrito às suas lojas no backend.
- `lockedFields`: ao editar manualmente um campo, ele **trava** contra enriquecimento/sync ERP;
  o save manda só o **diff**; `DELETE .../locks/:field` destrava. Regra em `BUSINESS_RULES.md`.

**Decisões travadas (refino):**
- **Escopo só frontend** (consumir o que já existe). Só criar endpoint novo se faltar algo
  pontual (ex.: listagem paginada/contagem) — não reescrever o backend de catálogo.
- **Acesso:** dono e gerente (decisão de permissão). O escopo de loja já é garantido pelo
  backend; o front filtra por loja selecionada.
- **lockedFields na UI:** ao editar um campo, salvar só o diff (PATCH parcial); indicar
  visualmente os campos travados e oferecer "destravar" (chama o `DELETE .../locks/:field`).
- **Upload de imagem de produto** via fluxo `upload-url` (presigned) já existente — não subir
  binário pelo backend.

## Desenho

- **Frontend** (`apps/merchant`):
  - `src/api/catalog.ts` (tipado) + hooks React Query:
    `useOffers(filters)`, `useUpdateOffer`, `useUnlockOfferField`,
    `useStocks(storeId)`, `useUpdateStock`, `useUnlockStockField`,
    `useCreateProduct`, `useUpdateProduct`, `useProductUploadUrl`.
    Mutations invalidam as query keys do recurso (`queryKeys.catalog.*`).
  - `pages/Catalog.tsx`: seletor de loja + busca + filtros (categoria, disponibilidade);
    tabela/lista de ofertas com preço, disponibilidade, estoque. Edição inline ou modal
    (rhf+zod) salvando **só o diff**; badge de campo travado + ação "destravar".
  - `pages/ProductForm` (ou modal): cadastrar/editar produto local (S3.10) com upload de
    imagem via `upload-url`.
  - Reaproveitar **padrões** do admin (`pages/Catalog.tsx`/`ProductDetail.tsx`) como referência
    visual, mas reescrevendo no padrão React Query+rhf+zod do app merchant (admin é legado).
  - Item de nav "Catálogo" visível p/ dono e gerente.

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/merchant test:coverage` (+ `pnpm --filter @markethub/api test:coverage`
se algum endpoint novo for necessário). Sem `skip`/`only` injustificado.

- **Frontend:**
  - `useOffers` aplica filtros (storeId/search/available) na chamada.
  - Editar oferta envia **só o diff** (PATCH parcial); campos não tocados não vão no body.
  - "Destravar" chama `DELETE .../locks/:field` e invalida a lista.
  - Estoque: update reflete na lista após invalidação.
  - Produto: criação usa `upload-url` (mock do fluxo presigned) + `POST products`; validação zod.
  - Seletor de loja restringe os dados exibidos.
- `pnpm typecheck` + `pnpm build` verdes.

## Fora de escopo

- Reescrever a lógica de enriquecimento/lockedFields no backend (já existe).
- Importação em massa / edição em lote de catálogo.
- Pedidos (12) e relatórios (13).
- Curadoria de categorias do marketplace (é do admin).
