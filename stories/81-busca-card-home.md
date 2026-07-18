# Plan: busca — card do resultado igual ao da home

## Context

Bloco "Busca, app customer" do BACKLOG. Hoje o resultado da busca global (story 80,
`apps/customer/app/search.tsx`) renderiza `ProductCard` "pelado" com um badge caseiro em cima
mostrando `storeName` + distância. Problemas relatados:

1. Mostra o nome da **loja** (`storeName`), mas o cliente pensa em **mercado** (rede/merchant).
2. Não mostra informação de entrega (taxa e tempo).
3. Deve exibir o **mesmo card da home** — na home (`apps/customer/app/home.tsx:128-136`) o
   `ProductCard` recebe a prop `header` (merchant, logoUrl, eta, distanceKm, deliveryFeeCents)
   e os estados `closed`/`paused`.

Decisões travadas (planning 2026-07-18):

- **Layout mantém grid de 2 colunas** da busca; o card da home com header se adapta à largura
  da célula.
- **Lojas fechadas/pausadas aparecem com estado visual** (mesmo comportamento da home), não são
  filtradas do resultado.

Estado atual do contrato: o item da busca (`apps/customer/src/api/marketplace.ts:160-175`) já
traz `merchantId`, `merchantName`, `merchantLogoUrl`, `distanceKm` — faltam `deliveryEta`,
`deliveryFeeCents`, `openNow`, `paused`. No backend, a busca global
(`services/api/src/catalog/catalog.service.ts:678-689`) só anexa `storeId`/`storeName`; o
builder do feed (`catalog.service.ts:705-740`) já monta o shape completo — reaproveitar.

Relação com a story 82 (busca por mercado): independentes; esta muda só o card/contrato do
item de produto.

## Desenho

Backend (`services/api/src/catalog`):

- Estender o item da busca global para carregar os mesmos campos de entrega do item do feed:
  `merchant` (nome da rede), `merchantLogoUrl`, `deliveryFeeCents` (com override da loja:
  `store.deliveryFeeCents ?? merchant.deliveryFeeCents`), `deliveryEta`, `openNow`, `paused`.
  Reaproveitar/extrair o builder existente do feed em vez de duplicar cálculo de ETA/fee.
- Manter `storeId` no item (necessário pro carrinho); `storeName` pode permanecer no payload,
  mas a UI deixa de exibi-lo.

Contrato (`apps/customer/src/api/marketplace.ts`):

- Atualizar o tipo do item de busca com os novos campos (mesmo shape do item do feed — se
  possível unificar os dois tipos num só).

Frontend (`apps/customer/app/search.tsx`):

- Remover o badge caseiro (`store-badge`).
- Renderizar `ProductCard` com `header={{ merchant, logoUrl, eta, distanceKm, deliveryFeeCents }}`
  + `closed={!item.openNow}` + `paused={item.paused}`, igual à home.
- Manter `numColumns={2}`, paginação e fluxo de carrinho intactos.

## Validação

- Backend: `pnpm --filter @markethub/api test` — casos novos em `catalog.service.spec.ts`:
  - busca global inclui `merchant`, `deliveryFeeCents` (com override da loja), `deliveryEta`,
    `openNow`, `paused` no item;
  - loja fechada/pausada **continua** no resultado com flags corretas (decisão: não filtrar);
  - regressão: busca dentro da loja (com `storeId`) não muda de shape.
- Frontend: teste de `search.tsx` — card renderiza header com nome do mercado + fee/eta; badge
  antigo (`store-badge`) não existe mais.
- Gates: `pnpm typecheck` + `pnpm build`.
- **Cobertura:** código novo sem teste não fecha a story — `pnpm --filter @markethub/api
  test:coverage` e `pnpm --filter @markethub/customer test:coverage` verdes (piso 80%, diff ≥ 90%);
  sem `skip`/`only` injustificado.

## Fora de escopo

- Busca por nome de mercado na barra (story 82).
- Mudanças na home ou no `ProductCard` em si (só consumo via props existentes).
- Ordenação/ranking do resultado.
