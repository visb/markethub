# Plan: Customer — aba explore vira mapa de mercados (base)

## Context

Bloco **app customer, aba explore** do BACKLOG. Cobre as facetas **1** (mapa centralizado na
localização do usuário mostrando mercados próximos) e **3** (ícone do **endereço de entrega
ativo** no mapa). A carga sob demanda por viewport + overlay de loading é a **story 06**.

Hoje `apps/customer/app/explore.tsx` é uma **tela de busca de produtos** (lista + search),
em fetch legado `useState`/`useEffect`. O BACKLOG pede transformar a aba explore num **mapa**.

**Decisões travadas (refino):**
- A aba explore passa a ser o **mapa** — o conteúdo de busca de produtos sai (já há busca na
  Home/feed; não duplicar). A `BottomTabs active="explore"` e o `CartFab` permanecem.
- **Lib: react-native-maps** (decisão do usuário). Provider Google; usa `GOOGLE_MAPS_API_KEY`
  (já no projeto). Suporte web é fraco — se a explore rodar no web, exibir fallback simples
  (lista/aviso) em vez de quebrar (detalhe de implementação, não bloqueia mobile).
- **Centro inicial = localização do dispositivo** (GPS via `expo-location`/`deviceAddress`
  helper já existente em `src/location.ts`). Se a permissão for negada, **fallback = endereço
  de entrega ativo**; se também faltar, centro padrão (cidade da loja seed) — sem travar a tela.
- **Pin do endereço ativo (faceta 3):** marcador distinto centrado em
  `addresses().find(isDefault) ?? [0]` (`latitude`/`longitude`). É **separado** do centro do
  mapa (GPS) — pode haver dois pontos: onde o usuário está e onde vai receber.
- **Visual (briefing):** espelhar `briefing/screenshots/delivery/Home - Searching Routes.jpg`
  — mapa full-screen, **pin vermelho** para marcadores. Marcador do endereço ativo com ícone
  distinto (ex.: casa/destino) para diferenciar dos mercados.
- **Depende da story 04** (`GET /stores/nearby`) para a fonte dos marcadores. Nesta story a
  carga pode ser uma busca **única** (bounds do `initialRegion`); a recarga conforme o usuário
  move o mapa é da **story 06**.

## Desenho

- **Deps:** add `react-native-maps` ao `apps/customer/package.json` (versão compatível com o
  SDK Expo); config do provider Google (app config/plugin) com a key de ambiente.
- **Camada de dados (React Query — fundação já existe no customer):**
  - `src/lib/queryKeys.ts`: `queryKeys.explore.nearby(bounds)`.
  - `src/api/marketplace.ts`: `storesNearby({north,south,east,west})` →
    `GET /stores/nearby` (tipado `NearbyStore[]`).
  - `src/api/hooks/useNearbyStores.ts`: `useNearbyStores(bounds, { enabled })`.
  - Endereço ativo: reusar `mkt.addresses()` (já existe) via hook/`useQuery`; selecionar o
    default. (Se não houver hook de addresses, criar `useAddresses` no padrão.)
- **Tela `explore.tsx` (reescrita):**
  - `<MapView>` full-screen com `initialRegion` derivada do GPS (ou fallbacks acima).
  - Permissão de localização via `expo-location` (reusar lógica do `deviceAddress`/`location.ts`;
    não acessar a API de location crua na tela — extrair helper se preciso).
  - `<Marker>` vermelho para cada `NearbyStore`; `<Marker>` distinto para o endereço ativo.
  - Tap no marcador do mercado → navega para a loja (`/store/[id]`) ou mostra um callout com
    nome/ETA (callout simples nesta story; bottom-sheet rico fica fora de escopo).
  - Mantém `BottomTabs active="explore"` e `CartFab`.

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/customer test:coverage`. Sem `skip`/`only` injustificado.

- **`useNearbyStores`**: chama `storesNearby` com os bounds e popula os marcadores; respeita
  `enabled` (não busca sem bounds).
- **Seleção do endereço ativo**: escolhe o `isDefault`; cai no `[0]` quando não há default;
  sem endereço com lat/lng → não renderiza o pin de destino (sem crash).
- **Centro/fallback**: GPS negado → usa endereço ativo; sem ambos → centro padrão (testar a
  função pura de resolução de região, isolada do componente de mapa).
- Mock de `react-native-maps` no teste (MapView/Marker como stubs) para validar que os
  marcadores recebem as coordenadas certas.
- `pnpm typecheck` + `pnpm build` verdes (nova dep + config do provider).

## Fora de escopo

- Recarregar mercados conforme o viewport muda + overlay de loading (story 06).
- Endpoint `/stores/nearby` (story 04).
- Bottom-sheet/card rico ao tocar no mercado, clustering de marcadores, filtros.
- Mudança no slider de raio / modal de configuração de entrega (já existe na Home).
