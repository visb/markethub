# Plan: Backend — endpoint de mercados por viewport (bounding box)

## Context

Bloco **app customer, aba explore** do BACKLOG. A nova tela de mapa (stories 05 e 06)
precisa listar os mercados visíveis no viewport do mapa, carregados **sob demanda** conforme
o usuário arrasta/zooma. Hoje não existe endpoint geográfico para isso: `catalog.controller`
só expõe `/merchants` e `/merchants/:id/stores` (por merchant, sem geo).

Esta story entrega **só o backend** — o endpoint que as stories de frontend vão consumir.
É a primeira das 3 stories do feature de mapa (04 backend → 05 mapa-base → 06 viewport).

**Fatos do código (já existem):**
- `Store` tem `latitude`/`longitude` (`Float?`) no schema Prisma.
- `services/api/src/common/geo.ts` tem `haversineKm`.
- `CatalogService.listStores`/`storeSections` já são o padrão de leitura de loja com geo;
  `catalog.controller.ts` parseia geo via `parseGeo(lat,lng,radiusKm)`. Endpoints do catalog
  são **públicos** (sem auth) — manter.

**Decisões travadas (refino):**
- **Bounding box** (`north`/`south`/`east`/`west`) como contrato — casa direto com a `region`
  do react-native-maps (centro + deltas → bordas), escolhido para a story 06. Filtro no banco
  por `latitude BETWEEN south..north AND longitude BETWEEN west..east` (descarta lat/lng nulos).
- Endpoint **público** `GET /stores/nearby` no `CatalogController` (mesma convenção dos demais).
- Resposta enxuta para marcadores: `{ id, name, latitude, longitude }` + os campos de card já
  usados em `listStores` (ex.: cidade, avgPrepMinutes) se baratos — sem produtos.
- **Cap de resultados** (ex.: 200) para proteger contra viewport gigante (zoom-out total);
  acima do cap, retorna o teto sem erro. Clustering fica fora de escopo (story futura, se
  necessário).
- Validação de bounds: se faltar algum dos 4 parâmetros ou `north < south` / `east < west`,
  responder `400` com `{ code: "INVALID_BOUNDS", message }`.

## Desenho

- **DTO** (`stores-nearby.dto.ts` ou query params parseados no controller, seguindo o padrão
  atual de `@Query` + parse): `north`, `south`, `east`, `west` (números). Validar presença e
  ordem (n≥s, e≥w).
- **Controller** (`catalog.controller.ts`): `@Get("stores/nearby")` →
  `catalog.listStoresInBounds(bounds)`. Declarar **antes** de `@Get("stores/:id/...")`? Não há
  conflito de rota (`nearby` é segmento estático sob `stores/`, mas `stores/:id` casa `:id=nearby`
  se a ordem for ruim) — **registrar a rota estática `stores/nearby` antes de `stores/:id`**
  para o Nest casar a literal primeiro.
- **Service** (`catalog.service.ts`): `listStoresInBounds({north,south,east,west})` —
  `prisma.store.findMany` com `where` de latitude/longitude no range + `latitude/longitude not null`,
  `take: CAP`. Mapear para o shape enxuto. (Opcional: ordenar por proximidade ao centro do box
  via `haversineKm` — barato e melhora UX; incluir se trivial.)

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/api test:coverage`. Sem `skip`/`only` injustificado.

- **`catalog.service.spec.ts`** — `listStoresInBounds`:
  - Retorna só lojas dentro do box; exclui as fora e as com lat/lng nulos.
  - Respeita o `CAP` (mock com mais que o teto → retorna ≤ CAP).
  - (Se ordenar por proximidade) ordena pela distância ao centro do box.
- **`catalog.controller.spec.ts`** (ou e2e do controller): bounds válidos → 200 com a lista;
  bounds faltando/`north<south` → 400 `INVALID_BOUNDS`.
- Rota `stores/nearby` não é capturada por `stores/:id` (teste de roteamento ou e2e).
- `pnpm --filter @markethub/api test` + `pnpm typecheck` verdes.

## Fora de escopo

- Tela de mapa / lib react-native-maps (story 05).
- Carga sob demanda no viewport + overlay de loading no cliente (story 06).
- Clustering de marcadores e paginação geográfica.
- Mudança nos endpoints existentes (`/merchants`, `/stores/:id/...`).
