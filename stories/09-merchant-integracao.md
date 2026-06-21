# Plan: App merchant — configuração de integração (ERP, api-keys, webhooks)

## Context

Bloco **criar app merchant** do BACKLOG, faceta "configurar integração (endpoints, webhooks,
api-keys)". O dono configura como o MarketHub conversa com o sistema/ERP do mercado. Depende da
**story 07** (scaffold + `can`) e convive com a **story 08** (loja tem `externalId`).

**Fatos do código:**
- `Merchant` já tem `connectorType: String?` + `connectorConfig: Json?` (ex.: `{ "dir": "..." }`
  do CSV mock). O ERP fala só com a interface `ErpConnector`; `ConnectorRegistry.list()` expõe
  os tipos registrados (hoje `csv`). `ConnectorContext.config` carrega o `connectorConfig`.
- Fila BullMQ + Redis disponível (`queue/`); Socket.IO já em uso.
- Não existe modelo de **api-key emitida** nem de **webhook** — são novos.

**Decisões travadas (refino):**
- **Owner-only:** integração é exclusiva do **dono** (gerente não acessa esta área — decisão de
  permissão da sessão). Enforced no backend e escondido no front via `can("manage_integration")`.
- **Config de ERP (saída):** reusar `connectorType` + `connectorConfig` do `Merchant`. O form é
  dirigido por um **schema por tipo de conector** (zod) — endpoints + credenciais do ERP do
  merchant entram no `connectorConfig`. Segredos do ERP ficam **mascarados** na leitura (nunca
  devolver o valor em claro depois de salvo).
- **Api-keys (ambas as direções):**
  - *Saída* (MarketHub → ERP do merchant): credenciais no `connectorConfig` (mascaradas).
  - *Entrada* (sistema do merchant → MarketHub): **modelo `ApiKey` novo**, escopado ao
    `merchantId`. Armazenar **apenas o hash** da chave; a chave em claro é **revelada uma única
    vez** na criação. Prefixo curto guardado para identificação na lista. Chave **revogável**.
- **Webhooks (saída, assinados):** **modelo `Webhook` novo** — o merchant cadastra URL(s) e
  recebe um **secret** (gerado, revelado uma vez). O MarketHub faz `POST` assinado (HMAC-SHA256
  do corpo, header `X-MarketHub-Signature`) em eventos de pedido (criado / mudança de status).
  Entrega **via fila BullMQ** com retry/backoff; registrar resultado da última entrega.
- Eventos cobertos no MVP: `order.created` e `order.status_changed` (do domínio de pedidos).
  Demais eventos ficam fora de escopo.

## Segurança (requisito explícito)

- Chaves de api-key de **entrada** e secrets de webhook: gerados com RNG seguro, **persistidos
  apenas como hash** (api-key) / armazenados para assinatura (webhook secret) e **exibidos uma
  única vez** ao dono. Listagens mostram só prefixo/últimos dígitos + metadados, nunca o valor.
- Credenciais de ERP no `connectorConfig` retornadas **mascaradas** nas leituras; atualização
  aceita o valor novo, omissão mantém o atual (não apagar por PATCH parcial).
- Assinatura de webhook HMAC-SHA256; incluir timestamp no payload para o destino mitigar replay.
- Toda rota de integração é **owner-only** (guard no backend, além do gate de UI).

## Desenho

- **Schema/migration:** modelos `ApiKey` (id, merchantId, name, keyHash, prefix, createdAt,
  lastUsedAt?, revokedAt?) e `Webhook` (id, merchantId, url, secret, events String[], active,
  lastDeliveryStatus?, lastDeliveryAt?). Migration nova (nunca editar aplicada).
- **Backend** (`merchant` + `integration` ou submódulo):
  - `GET/PUT merchant/integration/erp` — lê (mascarado) / grava `connectorType` +
    `connectorConfig`; valida o config conforme o tipo (zod/DTO por conector). `GET
    merchant/integration/connector-types` → `ConnectorRegistry.list()`.
  - `GET/POST/DELETE merchant/integration/api-keys` — cria (revela 1x), lista (mascarado),
    revoga.
  - `GET/POST/PATCH/DELETE merchant/integration/webhooks` — CRUD; criação devolve o secret 1x;
    endpoint de **teste** (`POST .../webhooks/:id/test`) que enfileira um ping assinado.
  - **Entrega de webhook:** produtor que, em `order.created`/`order.status_changed`, enfileira
    job; processor faz o `POST` assinado com retry/backoff e grava o status. Reusar os pontos
    onde o status do pedido muda (módulo de pedidos/picking) para emitir o evento.
  - Guard `assertOwner` (reusa story 07).
- **Frontend** (`apps/merchant`):
  - `pages/Integration.tsx` com abas: **ERP** (form dirigido pelo tipo), **API keys** (lista +
    criar/revogar, modal "copie agora, não será exibida de novo"), **Webhooks** (CRUD + testar +
    status da última entrega). Tudo via React Query + rhf+zod; chamadas em `src/api/integration.ts`.
  - Item de nav "Integração" oculto para gerente.

## Validação

Gate de cobertura: **código novo sem teste não fecha a story.** Rodar
`pnpm --filter @markethub/api test:coverage` + `pnpm --filter @markethub/merchant test:coverage`.
Sem `skip`/`only` injustificado.

- **Backend:**
  - ERP config: PUT grava connectorType/config; GET volta **mascarado**; PATCH/omissão não apaga
    segredo existente; config inválido p/ o tipo → `400 {code}`.
  - Api-key: criação devolve a chave 1x e persiste **só o hash**; lista nunca expõe o valor;
    revogação invalida; geração usa RNG seguro (hash verificável).
  - Webhook: criação devolve secret 1x; assinatura HMAC do corpo confere com o secret;
    `order.created`/`order.status_changed` enfileiram entrega; retry em falha; status gravado.
  - **Owner-only:** manager/usuário sem papel recebe `403/FORBIDDEN` em todas as rotas de
    integração.
- **Frontend:** abas renderizam; criar api-key mostra o modal de revelação única; form de ERP
  valida por tipo; webhook test dispara a chamada; "Integração" escondido p/ gerente.
- `pnpm typecheck` + `pnpm build` verdes.

## Fora de escopo

- Conectores ERP reais (Bling/Tiny/etc.) — o registry segue com o que existe; aqui é só a
  config/credenciais. Novos conectores são stories próprias.
- Webhooks de **entrada** (merchant → MarketHub) e push de estoque/preço por webhook.
- Eventos além de `order.created`/`order.status_changed`.
- Rotação automática de secrets / UI de auditoria de entregas (só status da última).
