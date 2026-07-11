# Plan: rastreio de entrega ao vivo (driver → customer)

## Context

Cliente hoje acompanha o pedido em `track/[id]` com macro-etapas, `etaWindow` estático e
`driverName` em texto — sem posição do entregador. No realtime só existe `picking.gateway`
(namespace `/picking`). Fronteiras de contexto (story 47): `driver`, `marketplace`, `picking` e
`scheduling` compõem o contexto `fulfillment` — gateway novo em `driver/` conversa livre com o
resto do fulfillment.

Decisões travadas (planning 2026-07-11):

- **Só marcador ao vivo** — `etaWindow` estático permanece; ETA dinâmico (Directions/haversine)
  fica p/ story futura.
- **Background tracking** (escolha explícita do usuário, não default): driver navega com o app
  de mapas em primeiro plano; rastreio precisa seguir com o app em background/tela bloqueada →
  `expo-location` background + `expo-task-manager`.
- **Ingest REST, fan-out WS**: task de background não sustenta socket → driver publica posição
  via `POST` throttled; backend faz broadcast via gateway `/delivery`. Posição é **efêmera**
  (sem persistir ping em Postgres); gateway guarda última posição em memória por delivery p/
  entregar a quem entra atrasado na sala.

## Desenho

### Backend (`services/api/src/driver`)

1. `POST driver/deliveries/:id/location` (`{ lat, lng, heading?, recordedAt }`) — guard: só o
   driver dono da delivery, e só com delivery em trânsito (entre confirmar coleta e confirmar
   entrega). Controller fino → `DriverLocationService`.
2. `delivery.gateway.ts` — namespace `/delivery`, mesmo padrão do `picking.gateway`
   (auth no handshake, `EVENT_VERSION`, rooms): cliente autenticado do pedido faz
   `subscribe:order` → entra na sala; service emite `driver:location` na sala a cada ingest.
   Ao entrar na sala, emitir última posição conhecida (cache em memória, TTL curto) se houver.
3. Rate-limit de ingest (ex.: 1 posição/3s por delivery; excesso descartado silencioso).

### `packages/api-client`

4. `socket.ts` — parametrizar namespace no `createRealtimeClient` (hoje cravado `/picking`),
   mantendo compat com os consumidores atuais.

### Driver app

5. `expo-location` + `expo-task-manager`; config: permissão background ("Allow all the time"),
   foreground service Android (plugin do expo-location), `UIBackgroundModes: location` iOS.
6. `src/tracking.ts` — `defineTask` que envia a posição via `POST` (fetch com access token;
   reusar refresh do `ApiClient` onde possível). Throttle: `timeInterval` ~10s /
   `distanceInterval` ~50m.
7. Ciclo: **iniciar** ao confirmar coleta; **parar** ao confirmar entrega, cancelamento ou
   logout. Permissão negada → banner explicando que o rastreio fica indisponível (fluxo de
   entrega segue funcionando).

### Customer app

8. `track/[id]`: mapa (componente `MapView` existente, com variante `.web`) com marcadores de
   loja, endereço de entrega e entregador ao vivo; assinar `/delivery` `subscribe:order` via
   `RealtimeClient`. Mapa só aparece na macro-etapa de entrega em andamento com entrega
   own-store (retirada não mostra).

## Validação

- Backend: specs do controller/service de location (guard de dono, estado inválido rejeita,
  rate-limit) e do gateway (subscribe autorizado, broadcast, última posição ao entrar).
  `pnpm --filter @markethub/api test`.
- api-client: spec da parametrização de namespace sem quebrar consumidores. `pnpm --filter
  @markethub/api-client test`.
- Driver: testes do ciclo start/stop do tracking (mock expo-location/task-manager) e do POST
  throttled. Customer: teste da tela track exibindo marcador ao receber `driver:location`
  (mock socket). `pnpm --filter @markethub/{driver,customer} test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` da api, do
  api-client e dos apps tocados ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.
- Manual (registrar na story ao concluir): rastreio segue emitindo com app em background/tela
  bloqueada num device físico Android.
  - **PENDENTE-MANUAL:** background/tela bloqueada em device físico Android não é validável em
    CI/emulador (permissão "o tempo todo" + foreground service). A camada de device
    (`expo-location` + `expo-task-manager`) está atrás de interface e coberta por testes com mock;
    a emissão real em background exige um Android físico. Config declarada em `app.json`
    (ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE_LOCATION, UIBackgroundModes: location).

## Fora de escopo

- ETA dinâmico (Directions ou haversine) — story futura.
- Mapa/rota no app do driver (item 10 do backlog — story própria).
- Persistência histórica de trajeto (auditoria/replay).
- Compartilhar link de rastreio com terceiros.
