# Plan: cadastro de veículos de entrega no app merchant

## Context

No app merchant (Vite SPA), o operador da rede precisa cadastrar e gerenciar a frota de
veículos de entrega. Hoje não há entidade de veículo no domínio — o entregador entrega sem
vínculo a um veículo específico. Esta story cria o CRUD de veículos; a story **15** (app
entregador seleciona o veículo no login) **depende** desta entidade já existir.

Bloco do BACKLOG: "no app merchant, o usuario deve poder cadastrar veiculos de entrega".

### Decisões travadas

- **Veículo pertence à rede (merchant)**, não à loja. A frota é compartilhada entre as lojas
  da rede; o entregador (que pertence a uma loja) escolhe entre os veículos da rede dona da
  loja. Justificativa: simplicidade no MVP e frota normalmente gerida no nível da rede.
- **Campos do veículo:** `plate` (placa, string), `type` (enum `motorcycle | car | van`),
  `description` (texto livre, ex: "Fiorino branca"), `active` (boolean, soft toggle — desativar
  sem apagar para preservar histórico de quem entregou com qual veículo).
- **Quem gerencia:** admin **e** gerente podem CRUD os veículos da rede. (A story **16** cria a
  role admin e a **17** restringe o gerente à sua loja — quando essas entrarem, reavaliar se o
  gerente continua podendo mexer na frota da rede inteira. Por ora, ambos os níveis `merchant`
  têm acesso, seguindo o guard atual de `merchant-staff`.)
- Padrão de UI/dados espelha **Staff** (story 10): `src/api/vehicles.ts` + `hooks/useVehicles.ts`
  + `pages/Vehicles.tsx` + `components/VehicleForm.tsx` + chave em `queryKeys.ts`.

## Desenho

### Backend (`services/api`)

- **Schema/migration:** novo model `Vehicle` em `prisma/schema.prisma` — `id` cuid, `merchantId`
  (relação com `Merchant`), `plate`, `type` (enum novo `VehicleType`), `description?`,
  `active` (default `true`), timestamps. Index por `merchantId`. **Nova migration** (nunca
  editar aplicada); rodar `prisma generate` antes do typecheck.
- **Módulo merchant:** novo `merchant-vehicles.service.ts` + `merchant-vehicles.controller.ts`
  (controller fino, só DTO + rota; regra no service), registrados em `merchant.module.ts`.
  Seguir o shape de `merchant-staff.*`.
  - Endpoints: `GET /merchant/vehicles` (lista da rede do usuário autenticado),
    `POST /merchant/vehicles`, `PATCH /merchant/vehicles/:id`, `DELETE /merchant/vehicles/:id`
    (ou PATCH `active:false` — usar soft toggle; DELETE só se sem entregas associadas, senão
    erro `VEHICLE_IN_USE`).
  - Guard: mesmo nível de `merchant-staff` (role `merchant`). Resolver a `merchantId` pelo
    contexto do usuário (não confiar em id vindo do body).
  - DTOs com `class-validator`; PATCH com campos `@IsOptional()`. Erros no shape
    `{ code, message }` (`VEHICLE_NOT_FOUND`, `VEHICLE_IN_USE`, `INVALID_PLATE`).
- **Tipo de contrato:** se a resposta for consumida pelos apps (será, pela story 15), adicionar
  o tipo em `packages/types` e re-exportar via `@markethub/api-client`. Lembrar: backend **não**
  importa `packages/types` — manter os dois lados em sincronia.

### Frontend (`apps/merchant`)

- `src/api/vehicles.ts` — interface `Vehicle` + funções tipadas recebendo `ApiClient`.
- `src/api/hooks/useVehicles.ts` — `useVehicles()`, `useCreateVehicle()`, `useUpdateVehicle()`,
  `useDeleteVehicle()` (React Query; invalidação por chave).
- `src/lib/queryKeys.ts` — adicionar `vehicles` (nunca literal fora daqui).
- `src/pages/Vehicles.tsx` — página orquestra hooks + componentes; sem fetch inline.
- `src/components/VehicleForm.tsx` — `react-hook-form` + `zod` (`zodResolver`); validar placa e
  `type`.
- Registrar rota/nav no `App.tsx` (item de menu "Veículos"), espelhando Staff.

## Validação

> **Gate de cobertura — código novo sem teste não fecha a story.** Rodar
> `pnpm --filter @markethub/api test:coverage` e `pnpm --filter @markethub/merchant test:coverage`.
> Sem `skip`/`only`/`xfail` injustificado. Antes de "pronto": `pnpm typecheck` + `pnpm build`
> (e `prisma generate` após o schema mudar).

- **Backend — `merchant-vehicles.service.spec.ts`:** criar veículo resolve `merchantId` do
  contexto; lista só veículos da rede do usuário; PATCH parcial altera só o enviado; soft toggle
  `active`; DELETE bloqueado com `VEHICLE_IN_USE` quando houver entrega associada; erros
  `VEHICLE_NOT_FOUND`. Cobrir validação de placa/tipo inválidos.
- **Frontend — `useVehicles.test.tsx` + `VehicleForm.test.tsx` + `Vehicles.test.tsx`:** hooks
  fazem a chamada certa e invalidam a chave; form valida placa/tipo obrigatórios via zod; página
  renderiza lista, abre form, e o submit dispara a mutation. Espelhar os testes de Staff.

## Fora de escopo

- Seleção de veículo pelo entregador no login + indicador na home (story **15**).
- Manutenção/quilometragem/documentos do veículo.
- Reavaliar permissão do gerente sobre a frota (depende das stories **16**/**17**).
