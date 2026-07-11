# Plan: push no device via Expo Push Service (customer, picker, driver)

## Context

O backend de push está completo desde a story 49: `PushService.sendToUser` enfileira em BullMQ,
worker chama o `PushProvider` injetado (`PUSH_PROVIDER` env: `fcm` → `FcmPushProvider`, default
`MockPushProvider`), tokens inválidos são removidos. Endpoint `POST/DELETE
notifications/device-tokens` + model `DeviceToken` existem. **Mas nenhum app registra token de
device** — na prática, push nunca chega ao aparelho.

Decisões travadas (planning 2026-07-11):

- **Caminho de token: Expo Push Service.** Apps usam `expo-notifications` →
  `getExpoPushTokenAsync` (`ExponentPushToken[...]`), backend ganha
  `ExpoPushProvider` (mesma interface `PushProvider`, POST
  `https://exp.host/--/api/v2/push/send`). Funciona em Expo Go/dev build sem projeto Firebase.
  `FcmPushProvider` permanece como alternativa por env (obs.: usa a legacy API, desligada pelo
  Google — migração p/ HTTP v1 fica fora desta story).
- **Uma story só**: provider backend + registro/revogação + handlers de recebimento e tap
  (deep-link) nos 3 apps mobile. Padrão idêntico repetido; app `merchant`/`admin` (web) fora.

## Desenho

### Backend (`services/api/src/notifications`)

1. `providers/expo.push-provider.ts` — implementa `PushProvider` (`name = "expo"`). POST
   exp.host em batches de 100 (limite da API Expo); mapear `DeviceNotRegistered` →
   `invalidTokens`. Sem SDK novo — `fetch` como no FCM provider.
2. `notifications.module.ts` — factory reconhece `PUSH_PROVIDER=expo`. Sem env extra
   (API Expo não exige chave p/ uso básico).
3. `.env.example` — documentar `PUSH_PROVIDER=expo`.

### Apps mobile (customer, picker, driver — padrão idêntico)

4. Dependência `expo-notifications` nos 3 apps.
5. Hook `src/hooks/usePushRegistration.ts` por app (código igual; NÃO vai p/ `packages/ui`
   por depender de expo-notifications — avaliar `packages/` só se zero fricção):
   - Com usuário autenticado: pedir permissão, `getExpoPushTokenAsync`, `POST
     notifications/device-tokens` (`platform` de `Platform.OS`). Idempotente (token é upsert).
   - No logout: `DELETE notifications/device-tokens` com o token antes de derrubar sessão.
   - Web/permissão negada: no-op silencioso.
6. Montar o hook no `_layout.tsx` raiz (dentro do `AuthProvider`).
7. Handler de recebimento em foreground: `setNotificationHandler` exibindo banner.
8. Handler de tap → deep-link: payload `data.route` (ex.: `/track/abc`, `/task/xyz`,
   `/delivery/123`) → `router.push`. Backend já envia `data` no `PushMessage`; conferir que os
   producers (status de pedido, nova tarefa, nova entrega) preenchem `data.route` — completar
   onde faltar.

### Rotas por app

- customer: pedido → `/track/[orderId]`.
- picker: nova separação → `/task/[taskId]`.
- driver: nova entrega → `/delivery/[deliveryId]`.

## Validação

- Backend: spec de `ExpoPushProvider` (batch, mapeamento `DeviceNotRegistered`, erro HTTP não
  derruba) + spec da factory do módulo reconhecendo `expo`. `pnpm --filter @markethub/api test`.
- Apps: testes do hook `usePushRegistration` (registra ao autenticar, revoga no logout, no-op
  sem permissão) e do mapeamento tap→rota, mockando `expo-notifications`. `pnpm --filter
  @markethub/customer test` (+ picker, driver).
- **Gate de cobertura:** código novo sem teste não fecha a story — `pnpm --filter
  @markethub/api test:coverage` + `test:coverage` dos 3 apps ≥ piso (80 global / 90 diff), sem
  `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Migração do `FcmPushProvider` p/ FCM HTTP v1.
- Push web (admin/merchant) — service worker fica p/ story futura.
- Preferências de notificação por usuário (item 21 do backlog).
- Novos tipos de notificação — só garantir `data.route` nos producers existentes.
