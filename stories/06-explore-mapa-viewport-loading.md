# Plan: Customer — explore: mercados sob demanda por viewport + overlay de loading

## Context

Bloco **app customer, aba explore** do BACKLOG. Cobre as facetas **2** (mercados carregados
**sob demanda conforme o viewport** do mapa) e **4** (status de **loading por cima do mapa**
enquanto carrega). Fecha o feature de mapa da explore.

Pressupõe a **story 05** (mapa-base: `MapView` full-screen, marcadores de mercado via
`useNearbyStores`, pin do endereço ativo) e a **story 04** (`GET /stores/nearby` por bounding
box). Na 05 a busca é única (bounds do `initialRegion`); aqui ela passa a **acompanhar o
movimento do mapa**.

**Decisões travadas (refino):**
- Gatilho de recarga: `onRegionChangeComplete` do `MapView` → derivar `bounds`
  (north/south/east/west) da `region` (centro ± deltas) → refazer `useNearbyStores(bounds)`.
- **Debounce** (~400ms) entre o fim do gesto e o fetch, para arrastar/zoom contínuo não
  disparar uma rajada de chamadas. (Reusar/replicar o padrão de debounce; se o `useDebouncedValue`
  da story 03 já existir no monorepo, extrair para `packages` ou replicar no customer.)
- **Não piscar marcadores:** `keepPreviousData` na query — os pins atuais ficam enquanto a
  próxima leva carrega.
- **Overlay de loading (faceta 4):** espelhar `briefing/screenshots/delivery/
  Home - Searching Routes.jpg` — **card flutuante no rodapé** sobre o mapa ("Procurando
  mercados nesta área…" + indicador), **não** um spinner que cobre o mapa inteiro. Aparece
  enquanto a query do viewport está `fetching`; some ao concluir.
- Guarda contra viewport gigante: a proteção de volume está no **CAP do backend** (story 04);
  o cliente só renderiza o que vier.

## Desenho

- **`explore.tsx`:**
  - Estado `region` (controlado) iniciado pela região da story 05; `onRegionChangeComplete`
    atualiza `region`.
  - `const bounds = boundsFromRegion(debouncedRegion)` (função pura) → `useNearbyStores(bounds,
    { enabled: !!bounds })` com `keepPreviousData`.
  - Overlay: componente `MapLoadingBadge` (card no rodapé) renderizado quando
    `nearbyQuery.isFetching`. Posicionado absoluto sobre o `MapView`, acima do `BottomTabs`.
- **Hook/util:**
  - `boundsFromRegion(region)` (pura, testável): converte `{latitude, longitude,
    latitudeDelta, longitudeDelta}` em `{north, south, east, west}`.
  - `useNearbyStores` (da story 05) ganha `keepPreviousData: true` (ou já vem assim).
- **Debounce da region** antes de calcular bounds (evita fetch a cada frame do gesto).

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/customer test:coverage`. Sem `skip`/`only` injustificado.

- **`boundsFromRegion`**: converte region → bounds corretamente (centro ± metade dos deltas);
  casos de borda (deltas pequenos/grandes).
- **Recarga por viewport**: `onRegionChangeComplete` (simulado) → após o debounce, dispara
  `storesNearby` com os **novos** bounds; gestos rápidos sucessivos resultam em **uma** chamada
  (debounce) — testar com fake timers.
- **Overlay**: visível enquanto `isFetching`; oculto quando idle. Marcadores antigos
  permanecem durante o refetch (`keepPreviousData`).
- `pnpm typecheck` + `pnpm build` verdes.

## Fora de escopo

- Endpoint `/stores/nearby` (story 04) e mapa-base/pins (story 05).
- Clustering de marcadores, paginação geográfica, animações de marcador.
- Filtro por categoria/raio dentro do mapa (o raio segue na config de entrega da Home).
- Persistir a última região vista entre sessões.
