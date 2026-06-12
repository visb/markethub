# SF.1 Remover caixa lacrada; coleta e entrega por código

- **Fase:** fix (pré-fase-4)
- **Epic:** Correções de domínio
- **Status:** done
- **Depende de:** [S3.5, S3.6]

## Objetivo
Eliminar o conceito de **caixa física lacrada** (`Box` com `serial`/QR/`passcode`/`sealedAt`). Pedido é embalado de forma comum (sacolas). Substituir a conferência por QR de caixa por **dois códigos** de liberação. Ajustar código já entregue da Fase 3 e o plano da Fase 4.

## User story
Como operação, quero embalar o pedido em sacolas comuns e confirmar coleta/entrega por código simples, para não depender de caixas lacradas com serial/QR.

## Modelo de códigos
- **`pickupCode`** (coleta loja→entregador): vive na `OrderGroup`. Exibido ao **entregador** (app driver). O **picker/merchant** digita no app para liberar o pedido ao entregador.
- **`deliveryCode`** (entrega entregador→cliente): vive no `Order`. Exibido ao **cliente** (app customer). O **entregador** digita no app para confirmar a entrega.
- Códigos gerados na criação do pedido (ou no `packed`/handoff para pickup). Curto, legível (ex.: 4–6 dígitos). Não reutilizar entre pedidos ativos.

## Critérios de aceite
- **Schema/migration:** remover `model Box`, a relação `PickTask.boxes` e `PickItem.box`/`boxId` (+ índice `@@index([boxId])`). Adicionar `OrderGroup.pickupCode` e `Order.deliveryCode`. Migration nova (dados de dev podem ser resetados).
- **Types (`packages/types/picking.ts`):** remover `BoxDTO`, `PickTaskDTO.boxes`, `PickItemDTO.boxId`. Expor `pickupCode`/`deliveryCode` onde fizer sentido (DTO de pickup/entrega), respeitando visibilidade por papel.
- **Packing (`packing.service.ts`):** sem criação de caixas, serial, passcode ou selagem. Manter (se útil) a transição de estado `picking → packed` representando "ensacolado/pronto", sem entidade `Box`.
- **Handoff (`handoff.service.ts`):** liberar coleta validando `pickupCode` informado pelo entregador (em vez de scan de caixa). Avançar `OrderGroup` `ready_for_pickup → on_the_way`.
- **Mapper/eventos (`picking.mapper.ts`, `picking.events.ts`):** remover payloads de caixa.
- **App picker (`apps/picker/app/task/[id].tsx`):** remover UI de empacotamento em caixas/QR/serial. Manter "pronto para coleta". Tela de liberação de coleta: input do `pickupCode`.
- **`packages/api-client`:** remover endpoints/tipos de caixa; expor validação de `pickupCode`.
- App, schema e tipos compilam; sem referências órfãs a `Box`/`serial`/`sealedAt`/`passcode`.

## Ajuste do plano da Fase 4
- **S4.1 (domínio entrega):** remover relação `RouteStop ↔ Box`; dropoff vincula ao `Order` (e seus itens/sacolas), não a `Box`. Pickup valida `pickupCode`.
- **S4.5 (coleta):** renomear conceito "retirada por QR" → "liberação por `pickupCode`". Entregador apresenta código; loja libera.
- **S4.6 (entrega):** "confirmação por QR/senha de caixa" → "confirmação por `deliveryCode`". Cliente informa; entregador digita.
- Renomear arquivos `S4.5-pickup-execution-qr.md` e `S4.6-delivery-confirmation-qr.md` removendo o `-qr` (ou ajustar título/conteúdo no mínimo).
- Atualizar menções a caixa/QR no `stories/ROADMAP.md` (S3.5, S4.5, S4.6) e nos stories S3.5/S3.6/S3.7.

## Escopo / Fora de escopo
- **Inclui:** schema, migration, types, services de picking/handoff, app picker, api-client, edição dos stories de Fase 3 e do plano de Fase 4.
- **Fora:** implementação da Fase 4 em si (apenas ajuste do plano).

## Notas técnicas
- Geração/visibilidade dos códigos respeita RBAC: `pickupCode` visível ao `driver`; `deliveryCode` visível ao `customer`. Cada um validado pelo papel oposto.
- Considerar rate-limit/limite de tentativas na validação de código (anti-brute-force) — detalhar em S4.5/S4.6.
- `Receive.jpg` deixa de ser referência (era empacotamento em caixas).
