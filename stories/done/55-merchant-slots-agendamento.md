# Plan: merchant — gestão de slots de agendamento

## Context

O agendamento por capacidade (S5.3) está completo no backend: `DeliverySlot`
(`start`/`end`/`capacity`/`reserved`, `@@unique(storeId,start,end)`),
`GET/POST/DELETE store/slots` com escopo por dono/gerente, cliente consome
`GET stores/:storeId/slots` no checkout, cancelamento libera vaga (story 48). **Não há UI de
gestão** — slot hoje só nasce via seed/SQL, então na prática nenhuma loja oferece agendamento.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- Capability nova **`slots.manage`** na matriz existente (owner, administrador e gerente no
  escopo da loja) — agendamento é operação de loja, gerente precisa mexer.
- **Geração em lote client-side**: form "gerar semana" (dias, janela HH–HH, duração, capacidade)
  que expande em N `POST store/slots` — zero endpoint novo; `@@unique` já deduplica
  (tratar 409/conflito como "pulado").
- Comportamento de delete com reservas segue o `scheduling.service` atual (story não muda
  regra de negócio).

## Desenho

### Backend (mínimo)

1. Adicionar `slots.manage` à matriz de capabilities (RBAC merchant, stories 16–18) —
   owner/administrador/gerente. Endpoints de scheduling permanecem como estão.

### `packages/types` / api-client

2. DTOs de slot (listagem de gestão + payload de criação) se ainda não expostos p/ o app
   merchant; módulo tipado `apps/merchant/src/api/slots.ts` + hooks
   (`useStoreSlots(storeId)`, `useCreateSlot`, `useDeleteSlot`) com query keys em
   `queryKeys.ts`.

### Merchant app

3. Página `Slots` (rota `/slots`, atrás de `RequireCapability capability="slots.manage"`,
   entrada no menu): seletor de loja (padrão das outras páginas) + lista agrupada por dia
   (start–end, capacidade, `reserved/capacity` com barra), ordenada por `start`; deletar com
   confirm (mostrar reservas ao confirmar).
4. Form "adicionar slot" (react-hook-form + zod): data, início/fim, capacidade.
5. Form "gerar semana": período (data início/fim), dias da semana, janela (ex. 08:00–20:00),
   duração do slot (ex. 60 min), capacidade → preview do total antes de disparar; expande em
   POSTs sequenciais, resume resultado (criados/pulados por duplicata).

## Validação

- Backend: spec da capability nova (gerente com/sem escopo, picker negado).
  `pnpm --filter @markethub/api test`.
- Merchant: testes da página (lista agrupada, delete com confirm), do form unitário
  (validação zod: fim > início, capacidade ≥ 1) e do gerador em lote (expansão correta de
  janelas, dedupe 409 vira "pulado", preview bate com POSTs disparados).
  `pnpm --filter @markethub/merchant test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  merchant ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Editar slot existente (deletar + recriar cobre o MVP; `reserved > 0` protege via service).
- Endpoint batch no backend.
- Recorrência automática contínua ("toda semana gerar sozinho") — job futuro.
- Admin gerir slots de qualquer loja (admin já passa nos `@Roles`, mas UI admin fica fora).
