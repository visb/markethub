# Plan: Endereço — lat/lng exata ao salvar (provider Google)

## Context

Ao salvar endereço no app customer, o sistema precisa da lat/lng **exata** — as coordenadas são
a referência para entrega (distância, mapa, rastreio). O backend já geocodifica best-effort no
create/update (`marketplace/addresses.service.ts` → `resolveCoords`, atrás de
`GeocodingProvider`), mas os providers atuais são mock (dev) e Nominatim/OSM — precisão fraca
para rua+número no Brasil (cai no centroide da rua). Resultado: endereços salvos via CEP ficam
sem coords ou com coords imprecisas.

Decisões travadas (refinadas no planning):

- **Provider novo: Google Geocoding API**, atrás da interface `GeocodingProvider` existente
  (padrão PaymentProvider — swappable + mock nos testes). `GOOGLE_MAPS_API_KEY` já prevista na
  tabela de integrações do CLAUDE.md / `.env.example`.
- **Falha no geocode: salvar sem coords + aviso** (mantém best-effort, não bloqueia cadastro).
  O app avisa que a localização não foi encontrada; coords do GPS ("usar minha localização")
  continuam prevalecendo quando presentes.
- Bloco "Endereço do customer": a story 76 (fix do "usar minha localização") é irmã — esta cobre
  o caminho CEP/manual → geocode servidor; a 76 cobre o caminho GPS no app.

## Desenho

### Backend (`services/api`)

- `geocoding/providers/google.geocoding-provider.ts` novo: implementa `GeocodingProvider`
  chamando a Google Geocoding API (`address` montado de street+number+city+state+zipCode,
  `region=br`, `language=pt-BR`). Resolve `null` quando `ZERO_RESULTS`/erro (best-effort,
  mesma semântica dos demais). Sem SDK — `fetch` HTTP simples, key via env.
- Seleção por env (mesmo padrão dos providers atuais em `geocoding.module.ts` / `config/env.ts`):
  `GEOCODING_PROVIDER=google|nominatim|mock`; `google` exige `GOOGLE_MAPS_API_KEY`. Atualizar
  `.env.example`.
- `addresses.service.ts`: incluir `zipCode` e `district` na condição de `addressChanged` do
  `update` (hoje só street/number/city disparam re-geocode — CEP editado não re-geocodifica).
- Sem mudança de schema (colunas `latitude`/`longitude` já existem).

### App customer

- Após salvar endereço, se a resposta vier com `latitude`/`longitude` null, exibir aviso
  não bloqueante (toast existente): "Não encontramos a localização exata deste endereço".
  Fluxo de save não muda.

## Validação

- `pnpm --filter @markethub/api test:coverage` — casos: provider Google monta a query correta e
  parseia lat/lng; `ZERO_RESULTS`/HTTP erro → null; seleção por env (google exige key);
  create sem coords geocodifica; coords do cliente prevalecem; update de zipCode re-geocodifica;
  falha do provider salva com coords null. HTTP mockado — sem rede no teste.
- `pnpm --filter @markethub/customer test:coverage` — aviso exibido quando resposta sem coords;
  ausente quando coords presentes.
- `pnpm typecheck` + `pnpm build`.
- **Gate:** código novo sem teste não fecha a story (diff ≥ 90%); sem `skip`/`only` injustificado.

## Fora de escopo

- Fix do "usar minha localização" no app (Geocoding API removida do SDK 49) — story 76.
- Backfill de coords para endereços existentes sem lat/lng.
- Autocomplete de endereço (Place Autocomplete) no form.
- Coords de lojas/merchants (`merchant.service.ts` usa o mesmo provider — ganha precisão de graça,
  sem mudança de código lá).
