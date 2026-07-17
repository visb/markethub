# Plan: "Usar minha localização" — reverse geocode via backend

## Context

No app customer, o botão "Usar minha localização" do formulário de endereço usa
`Location.reverseGeocodeAsync` (expo-location) para transformar GPS em endereço. No web isso
quebrou: "The Geocoding API has been removed in SDK 49, use Place Autocomplete service instead".
No native ainda funciona, mas com qualidade variável por plataforma.

Decisão travada (refinada no planning): **reverse geocode sempre pelo backend**, em todas as
plataformas — caminho único, resultado consistente, key do Google fica no servidor.
**Depende da story 75** (provider Google atrás de `GeocodingProvider`).

O GPS (`Location.getCurrentPositionAsync`) continua no app — só a conversão lat/lng → endereço
migra para o servidor. As coords do GPS continuam sendo salvas como lat/lng do endereço
(prevalecem sobre geocode, regra da 75).

## Desenho

### Backend (`services/api`)

- `GeocodingProvider` ganha `reverseGeocode(lat, lng): Promise<ReverseGeocodeResult | null>`
  (best-effort, null quando não resolve — mesma semântica do `geocode`). Implementar nos três
  providers: google (Geocoding API `latlng=`, `language=pt-BR`, parse de street/number/district/
  city/state-UF/zipCode dos `address_components`), nominatim (endpoint `/reverse`), mock.
- Endpoint novo `GET /geocoding/reverse?lat=&lng=` (auth de customer), controller fino em módulo
  adequado (marketplace ou geocoding — respeitar fronteiras de contexto do eslint; expor via
  barrel se cross-context). Valida lat/lng com DTO; resposta
  `{ street, number, district, city, state, zipCode } | null`.

### Contratos (`packages/types`)

- Tipo `ReverseGeocodeResult` no contrato compartilhado (backend não importa `packages/types` —
  manter os dois lados).

### App customer

- `src/api/marketplace.ts`: método `reverseGeocode(lat, lng)` tipado.
- `AddressForm.tsx` (`useMyLocation`): remove `Location.reverseGeocodeAsync` e o mapa
  `STATE_UF` (backend já devolve UF); chama o endpoint com as coords do GPS e preenche o form.
  Backend retornou null → mantém o erro amigável atual ("preencha pelo CEP"), coords do GPS
  ainda entram no form (endereço digitado + coords exatas).

## Validação

- `pnpm --filter @markethub/api test:coverage` — casos: reverse google parseia components →
  campos BR (UF 2 letras, CEP); null em `ZERO_RESULTS`/erro; DTO rejeita lat/lng inválidos;
  endpoint retorna shape do contrato. HTTP mockado.
- `pnpm --filter @markethub/customer test:coverage` — `useMyLocation` chama endpoint e preenche
  form; null → erro amigável + coords preservadas; permissão negada segue caminho atual.
- `pnpm typecheck` + `pnpm build`.
- **Gate:** código novo sem teste não fecha a story (diff ≥ 90%); sem `skip`/`only` injustificado.

## Fora de escopo

- Place Autocomplete (sugestão de endereço enquanto digita) — não é necessário para o fix.
- Migrar outros usos de expo-location (delivery/tracking usam só posição, não geocode).
- Story 75 (geocode direto no save) — pré-requisito, não parte desta.
