# Plan: horário de funcionamento ponta-a-ponta (merchant edita, customer vê, checkout respeita)

## Context

`StoreHours` (semanal: `dayOfWeek`, `opensAt`/`closesAt` em minutos) existe e o servidor já
computa `openNow` (`catalog.service.isOpenAt`, timezone America/Sao_Paulo) — mas a experiência
está incompleta em três pontas:

- **Merchant não edita o próprio horário** — só admin (`PUT admin/.../:id/hours` no
  `admin-merchants.controller`).
- **Customer quase não vê**: `openNow` só aparece no `StoreSummarySheet` (modal do explore);
  página da loja e cards da vitrine não mostram nada.
- **Checkout ignora**: pedido em loja fechada passa (nenhuma validação, nenhum `STORE_CLOSED`).

Decisões travadas (planning 2026-07-11):

- **Checkout bloqueia só entrega imediata** em loja fechada (`STORE_CLOSED`); pedido com slot
  agendado futuro passa — aproveita o agendamento existente (`DeliverySlot`).
- **Feriados/fechamento excepcional INCLUÍDOS** (escolha explícita do usuário, não default):
  model novo `StoreClosure` (data + motivo), gerido pelo merchant, considerado no `openNow`.
- Horário cruzando meia-noite continua fora (limitação atual do `isOpenAt`, documentada).

## Desenho

### Schema (`services/api/prisma`)

1. Model `StoreClosure`: `id`, `storeId` (FK cascade), `date` (@db.Date), `reason?`,
   `createdAt`; `@@unique([storeId, date])`. Migration nova (nunca editar aplicada).

### Backend

2. `catalog.service`: `isOpenAt` passa a considerar closure do dia (fechado o dia todo).
   Incluir `openNow` + `hours` + próxima abertura no DTO de detalhe da loja consumido pela
   página da loja (se ainda não expostos).
3. Módulo `merchant`: `GET/PUT merchant/stores/:id/hours` e
   `GET/POST/DELETE merchant/stores/:id/closures` — mesma capability usada na edição de loja
   (EditStore/StoreForm); validação `opensAt < closesAt`, dias 0–6 sem duplicata. Lógica de
   escrita pode espelhar a do admin (`setStoreHours`) — não importar internals cross-context.
4. `marketplace` (checkout): pedido imediato com alguma loja do grupo fechada → lançar
   `{ code: "STORE_CLOSED", message }` (listar loja). Pedido com slot agendado válido no futuro
   não valida `openNow`.

### `packages/types`

5. DTOs de hours/closures compartilhados (merchant UI + customer) — re-exportados pelo
   api-client; backend não importa o package (atualizar os dois lados).

### Merchant app

6. Seção "Horários" na edição da loja (`EditStore`): editor semanal (7 linhas, abre/fecha,
   fechado no dia = sem linha) via react-hook-form + zod; máscara HH:MM ↔ minutos.
7. Seção "Fechamentos excepcionais": lista + adicionar (data futura + motivo) + remover.

### Customer app

8. Badge aberto/fechado: página da loja (`store/[id]`) com horário de hoje e "abre às HH:MM";
   cards da vitrine (home/explore lista) com selo "Fechado" discreto.
9. Checkout: tratar `STORE_CLOSED` com mensagem amigável sugerindo agendamento (CTA para o
   seletor de slot, que já existe no fluxo).

### Admin

10. Nada novo — tela atual de hours continua; se DTO mudar, ajustar consumo.

## Validação

- Backend: specs de `isOpenAt` com closure (hoje fechado / amanhã aberto), CRUD de
  hours/closures do merchant (capability, validações, duplicata), checkout `STORE_CLOSED`
  (imediato bloqueia; agendado passa; multi-loja lista a fechada). Migration aplica limpa.
  `pnpm --filter @markethub/api test`.
- Merchant: testes do editor de horários (parse HH:MM, submit, erro de validação) e closures.
- Customer: badge na loja fechada/aberta; checkout exibindo erro com CTA de agendamento.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` da api e dos
  apps tocados ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm --filter @markethub/api prisma:generate` antes do typecheck; `pnpm typecheck` + build.

## Fora de escopo

- Horário cruzando meia-noite (ex.: 22h–2h).
- Pausar loja em tempo real sem mexer em horário (item 8 do backlog — story própria).
- Fuso por loja (America/Sao_Paulo fixo, como hoje).
- Notificar clientes sobre fechamento excepcional.
