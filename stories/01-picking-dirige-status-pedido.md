# Plan: separação dirige o status do pedido + emit realtime

## Context

Bloco do BACKLOG: **app customer, tela `/track/:id`** — o status do pedido (Pedido
confirmado → Comprando → Pronto para retirar) precisa refletir o trabalho do separador
e ser atualizado em tempo real. Esta story cobre o **lado backend** do bloco; o consumo
realtime na tela é a story **02** (depende desta para o passo "Comprando" ter sentido).

**Bug atual (a corrigir):** `PickingSessionService.start()` muda apenas
`pickTask.status → "picking"`; **não** transiciona `OrderGroup.status`/`Order.status`.
Como a tela do cliente acende "Comprando" via `Order.status === "picking"`, esse passo
**nunca aparece** — o pedido salta de "Pedido confirmado" direto para "Pronto para
retirar" (quando o picker marca pronto). O detalhe de progresso item-a-item também
depende de `status === "picking"`, logo também some.

**O que já funciona (não mexer):**
- `HandoffService.markReady()` (botão "Pronto para coleta" do picker) já faz
  `OrderGroup → ready_for_pickup`, `recomputeOrderStatus()` e `tracking.emit()`.
- `OrderTrackingService.emit()` publica o snapshot completo de `OrderTracking` no canal
  Socket.IO `order:<orderId>` como evento `order.updated`.
- `PickingGateway` (`/picking`) com `subscribe:order` + autorização (só o dono / admin).

**Decisões travadas (refino):**
- **"Pronto para retirar" continua atrelado a `markReady`** ("Pronto para coleta"), não a
  `completePicking`. Mantém os dois botões do picker e a geração do `pickupCode` como
  está. Esta story só **acrescenta** a transição "Comprando" no início.
- `completePicking` (→ `pickTask: packed`) **não** introduz status visível novo ao
  cliente: `packed` não existe em `ORDER_STAGE`; o pedido permanece "Comprando" até
  `markReady`. Apenas garantir o emit (ver Desenho) para o snapshot refletir o fim da
  separação (contadores zerados de pendentes).
- `recomputeOrderStatus` (agregação "etapa menos avançada entre os grupos") já existe no
  `HandoffService`; reusar o mesmo critério — pedido multi-loja só vira "picking" quando
  todos os grupos relevantes saíram de "preparing". Extrair/compartilhar a lógica em vez
  de duplicar.

## Desenho

1. **`start()` transiciona o grupo para "picking" + emite.**
   Em `PickingSessionService.start()`, ao mudar `pickTask` para `picking`, também:
   - `OrderGroup.status → "picking"` (na mesma transação do update da task);
   - recomputar o `Order.status` agregado e emitir o snapshot no canal `order:`.

   Hoje `recomputeOrderStatus` + `tracking.emit()` vivem em `HandoffService` (privado).
   Mover esse par para um ponto compartilhado do módulo `picking` (ex.: método em
   `OrderTrackingService`, que já depende de `PrismaService` + `PickingGateway`, ou um
   helper injetável) e chamá-lo de `HandoffService` **e** `PickingSessionService`. Não
   duplicar a regra de agregação.

2. **Emitir `order.updated` nas mudanças de item da separação.**
   `updateItem()` e a resolução de substituição (`substitution.service`) hoje emitem só
   nos canais `group:`/`store:` (`PickingEvents`). Acrescentar, após o recálculo, uma
   chamada ao mesmo emit de tracking (`order:` channel) para que os contadores
   ("a escolher / selecionados / reembolsados / a selecionar") do snapshot cheguem ao
   dono em tempo real. Best-effort (não falhar a operação se o emit falhar — seguir o
   padrão já usado para o refund).

3. **`completePicking()` emite o snapshot final.**
   Após `pickTask → packed` e `recalcTotals`, emitir o tracking atualizado (status segue
   "picking" até `markReady`, mas o snapshot reflete itens resolvidos).

4. **Sem mudança de schema.** Usa enums/colunas existentes (`OrderStatus`,
   `OrderGroup.status`). Sem migration.

Resultado: a sequência vista pelo cliente passa a ser
`Pedido confirmado` → (picker inicia) `Comprando` + progresso ao vivo → (picker marca
pronto) `Pronto para retirar`, e cada passo já sai pelo canal `order:` para a story 02
consumir.

## Validação

Camada tocada: **backend** (`services/api`, módulo `picking`). Cobrir com testes de
unidade dos services (mock de Prisma/gateway no padrão dos specs existentes
`picking-session.service.spec.ts` / `picking.service.spec.ts`):

- `start()`:
  - transiciona `OrderGroup.status → "picking"` e dispara o emit de tracking;
  - idempotente (chamar 2× não quebra; não re-emite estado inconsistente);
  - pedido multi-loja: só vira "picking" quando a agregação manda (um grupo ainda
    "preparing" mantém o pedido em "preparing").
- `updateItem()` (pick e refuse) e resolução de substituição: emitem `order.updated`
  além dos eventos de grupo; emit é best-effort (falha no emit não derruba a operação).
- `completePicking()`: emite o snapshot final; status do pedido permanece "picking".
- `markReady()` (regressão): continua levando a `ready_for_pickup` + emit, sem
  duplicar a lógica de agregação após a extração.
- Garantir que a lógica de `recomputeOrderStatus` compartilhada produz o mesmo
  resultado nos dois chamadores (um teste do helper extraído).

**Gate de cobertura (obrigatório):** código novo sem teste não fecha a story. Rodar
`pnpm --filter @markethub/api test:coverage`; sem `skip`/`only`/`xfail` injustificado.
Antes de "pronto": `pnpm --filter @markethub/api prisma:generate` (se necessário) +
`pnpm typecheck` + `pnpm --filter @markethub/api test`.

## Fora de escopo

- Consumo realtime na tela `/track/:id` e o socket client do front → **story 02**.
- Colapsar "Concluir separação" + "Pronto para coleta" num passo só (decidido: manter
  os dois botões).
- Push real (FCM/APNs) — segue stub.
- Mudanças de schema/migration.
