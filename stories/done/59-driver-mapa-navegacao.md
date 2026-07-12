# Plan: driver — mapa da entrega + navegação externa

## Context

A tela de entrega do driver (`delivery/[id]`, ~150 linhas) é só texto + códigos de
coleta/entrega — sem mapa, sem noção espacial, sem atalho de navegação. `MapView` (nativo +
variante `.web`) existe **no customer** (`apps/customer/src/components`); a regra do repo manda
componente RN reutilizável entre apps para `packages/ui`.

Decisões travadas (planning 2026-07-11):

- **Markers + deep-link** (default recomendado, confirmado): mapa com 3 marcadores (loja,
  cliente, posição atual) + botão abrindo o app nativo de navegação. **Sem** Google Directions
  (custo por request; driver navega no app nativo de qualquer forma).
- Mover `MapView` p/ `packages/ui` em vez de duplicar no driver.
- Posição atual aqui é **foreground/local** (expo-location `getCurrentPositionAsync`/watch na
  tela) — independente do tracking em background da story 51 (que publica pro cliente).

## Desenho

### `packages/ui`

1. Mover `MapView` (+ `MapView.web`) do customer p/ `packages/ui`; customer passa a importar de
   `@markethub/ui`. `react-native-maps` vira peer dep do package (Metro transpila source —
   reiniciar dev server ao consumir; armadilha conhecida). Sem mudança visual no customer.

### Backend

2. DTO de detalhe da entrega do driver: garantir lat/lng da **loja** e do **endereço de
   entrega** (snapshot). Completar onde faltar (join simples; sem endpoint novo).

### Driver app

3. `delivery/[id]`: mapa no topo (~40% da tela) com marcadores loja/cliente/posição atual
   (expo-location, permissão foreground; negada → mapa segue com 2 marcadores). Região inicial
   enquadrando os pontos relevantes da fase.
4. Botão contextual por fase: antes da coleta → "Navegar até a loja"; após coleta → "Navegar
   até o cliente". Deep-link universal
   `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` via `Linking.openURL`
   (Android resolve pro Google Maps; iOS abre o browser/app — cobre ambos sem chave).
5. Pickup (retirada pelo cliente) não tem fase de entrega — mapa mostra só loja.

## Validação

- Backend: spec do DTO com coordenadas (loja e endereço; endereço sem lat/lng → campo null e
  app esconde marcador). `pnpm --filter @markethub/api test`.
- packages/ui: testes existentes do MapView migram junto; render smoke das duas variantes.
  `pnpm --filter @markethub/ui test`.
- Customer: suites atuais que tocam MapView seguem verdes após o move (import novo).
- Driver: tela renderiza mapa com marcadores conforme fase, botão navegar monta URL correta
  (mock Linking), permissão negada não quebra. `pnpm --filter @markethub/driver test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api + ui +
  customer + driver ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Polyline de rota in-app (Directions API).
- ETA calculado no driver.
- Mapa na home do driver (lista de entregas segue lista).
- Publicação de posição pro cliente (story 51).
