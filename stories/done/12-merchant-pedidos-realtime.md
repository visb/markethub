# Plan: App merchant — pedidos e status em tempo real

## Context

Bloco **criar app merchant** do BACKLOG (escopo adicionado na sessão): o app merchant deve
**ver os pedidos e o status deles em tempo real**. Depende da **story 07** (scaffold, socket,
`merchant/context`, `can`).

**Fatos do código:**
- `OrderGroup` (por `merchantId` + `storeId`) tem `status: OrderStatus`
  (`created → paid → preparing → picking → ready_for_pickup → on_the_way → delivered |
  canceled`), `fulfillment`, totais, `pickupCode`, itens, delivery.
- **Não há** endpoint merchant de pedidos (só `admin/dashboard` tem `GET orders`).
- `PickingGateway` (`/picking`) tem `subscribe:store` e emite à **store room** eventos de
  **pick_task** (`pick_task.updated/assigned/ready_for_pickup`). **Não** emite evento de
  mudança de status do **OrderGroup** para a store room.
- `canAccessStore` do gateway autoriza **admin** ou quem é `StoreStaff` ativo. O **dono**
  (RoleName `merchant` sem StoreStaff) **não** passa nessa checagem hoje.

**Decisões travadas (refino):**
- **Listagem nova** `GET merchant/orders` escopada às lojas do usuário (dono = todas do
  merchant; gerente = `managerStoreIds`). Dono e gerente acessam.
- **Realtime via socket** (não polling): o app entra nas store rooms das lojas e recebe
  atualização de status. Para isso:
  1. **Emitir evento de status do OrderGroup à store room** em cada transição
     (`order.status_changed`, e `order.created` ao surgir o grupo). Esse é o **mesmo ponto de
     emissão** que a **story 09** consome para webhooks — implementar uma vez e reusar (cross-ref:
     a 09 enfileira webhook; a 12 emite socket). Quem entrar primeiro cria o helper de emissão.
  2. **Ampliar `canAccessStore`** para autorizar o **dono** (RoleName merchant cujo merchant é
     dono da store), além de StoreStaff/admin.
- Visão **board por status** (colunas/seções por `OrderStatus`) — casa com "ver pedidos e
  status"; atualização move o card entre colunas em tempo real.
- Sem **ações** de pedido nesta story (avançar status, cancelar) — é só **visualização** +
  realtime. Ações ficam fora de escopo (story futura).

## Desenho

- **Backend:**
  - `GET merchant/orders?storeId=&status=` (`merchant.controller`/service) — escopo por loja;
    retorna lista com status, loja, fulfillment, itens (contagem), totais, horários, pickupCode.
  - Helper de emissão de evento de status do OrderGroup: nos pontos onde `OrderGroup.status`
    muda (pagamento, picking, ready, delivery, cancelamento), chamar um `OrderEvents` que
    (a) emite `order.status_changed` à store room via gateway e (b) é o gancho que a story 09
    usa p/ webhook. `order.created` ao criar o grupo.
  - `PickingGateway.canAccessStore`: incluir dono (merchant proprietário da store). Adicionar
    contrato do evento em `packages/types/picking-events` (consts + payload).
- **Frontend** (`apps/merchant`):
  - `src/api/orders.ts` + `useMerchantOrders(filters)` (React Query); `queryKeys.orders.*`.
  - Efeito de realtime (espelha `useOrderTracking` do customer): conecta o socket, `subscribe:store`
    para cada loja do escopo, em `order.status_changed`/`order.created` invalida/atualiza a lista;
    fallback de polling quando desconectado.
  - `pages/Orders.tsx`: board por status (colunas), card com nº, loja, itens, total, status,
    horário; filtro por loja. Visível p/ dono e gerente.

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/api test:coverage` + `pnpm --filter @markethub/merchant test:coverage`.
Sem `skip`/`only` injustificado.

- **Backend:**
  - `GET merchant/orders` respeita escopo (gerente só suas lojas; dono todas; usuário sem
    vínculo `403`).
  - Transição de status do OrderGroup chama o `OrderEvents` (emite `order.status_changed` à
    store room) — testar em ao menos uma transição representativa.
  - `canAccessStore` autoriza o dono da store e segue negando terceiros.
- **Frontend:**
  - `useMerchantOrders` carrega e filtra por loja.
  - Evento `order.status_changed` recebido → pedido muda de coluna (invalidação/patch).
  - Socket desconectado → fallback de polling; conectado → sem polling; `subscribe:store`
    chamado por loja.
- `pnpm typecheck` + `pnpm build` verdes.

## Fora de escopo

- Ações sobre o pedido (avançar status, cancelar, reembolso) — só visualização.
- Detalhe completo do pedido / itens linha a linha (card resumido basta; detalhe é story futura).
- Webhook de `order.status_changed` (story 09) — aqui só o socket; o ponto de emissão é
  compartilhado.
- Relatórios (story 13).
