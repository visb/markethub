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
- Gatilho de recarga: fim do movimento do mapa → derivar `bounds` (north/south/east/west) →
  refazer `useNearbyStores(bounds)`. No nativo é `onRegionChangeComplete` do `MapView` (region
  centro ± deltas → bordas); no web (Leaflet) é o evento `moveend`/`zoomend` (`map.getBounds()`
  já dá north/south/east/west). A interface abstrata do mapa (story 05) expõe um único callback
  de "viewport mudou" com os bounds normalizados, escondendo a diferença de engine.
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
  - Estado `bounds` (controlado) iniciado pelo viewport da story 05; o callback "viewport mudou"
    do mapa abstrato atualiza `bounds` (nativo: `boundsFromRegion`; web: `map.getBounds()`).
  - `useNearbyStores(debouncedBounds, { enabled: !!bounds })` com `keepPreviousData`.
  - Overlay: componente `MapLoadingBadge` (card no rodapé) renderizado quando
    `nearbyQuery.isFetching`. Posicionado absoluto sobre o `MapView`, acima do `BottomTabs`.
- **Hook/util:**
  - `boundsFromRegion(region)` (pura, testável, nativo): converte `{latitude, longitude,
    latitudeDelta, longitudeDelta}` em `{north, south, east, west}`. No web os bounds vêm
    prontos do Leaflet (`map.getBounds()`).
  - `useNearbyStores` (da story 05) ganha `keepPreviousData: true` (ou já vem assim).
- **Debounce dos bounds** antes do fetch (evita fetch a cada frame do gesto, nativo e web).

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/customer test:coverage`. Sem `skip`/`only` injustificado.

- **`boundsFromRegion`**: converte region → bounds corretamente (centro ± metade dos deltas);
  casos de borda (deltas pequenos/grandes).
- **Recarga por viewport**: callback "viewport mudou" (simulado, via mock do mapa abstrato) →
  após o debounce, dispara `storesNearby` com os **novos** bounds; gestos rápidos sucessivos
  resultam em **uma** chamada (debounce) — testar com fake timers.
- **Overlay**: visível enquanto `isFetching`; oculto quando idle. Marcadores antigos
  permanecem durante o refetch (`keepPreviousData`).
- `pnpm typecheck` + `pnpm build` verdes.

## Fora de escopo

- Endpoint `/stores/nearby` (story 04) e mapa-base/pins (story 05).
- Clustering de marcadores, paginação geográfica, animações de marcador.
- Filtro por categoria/raio dentro do mapa (o raio segue na config de entrega da Home).
- Persistir a última região vista entre sessões.
