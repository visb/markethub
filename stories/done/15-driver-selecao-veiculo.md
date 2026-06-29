# Plan: entregador seleciona o veículo no login + indicador na home

## Context

No app do entregador (Expo / expo-router), o entregador deve escolher com qual veículo vai
rodar ao iniciar o turno, ver de forma clara qual está selecionado e poder trocar rapidamente.
Hoje o entregador entrega sem vínculo a um veículo.

Bloco do BACKLOG: "no app do entregador, ele deve selecionar o carro ao fazer login e ter um
indicador visivel na home sobre qual carro selecionado com opção de trocar de veiculo com
agilidade (2 cliques na tela no maximo)".

**Depende da story 14** (entidade `Vehicle` e veículos por rede já cadastrados no app merchant).

### Decisões travadas

- **Seleção registrada no backend**, vinculada ao entregador (não só prefs locais). O backend
  passa a saber qual veículo cada entregador está usando — habilita rastreio/relatório por
  veículo e a loja saber quem está com qual carro.
- **Tela dedicada pós-login:** ao autenticar, se o entregador **não** tem veículo selecionado,
  o app abre a tela de seleção **antes** da home (gate). Com veículo já selecionado, vai direto
  pra home. Troca posterior é feita a partir da home.
- **Lista de veículos = `active=true` da rede (merchant) dona da loja do entregador** — coerente
  com a decisão da story 14 (veículo por rede).
- **Troca em ≤2 cliques:** o indicador na home é tocável (clique 1 abre o seletor) e escolher o
  veículo na lista confirma (clique 2). Sem telas intermediárias extras.
- **Infra React Query introduzida nesta story** (o driver app ainda usa `useState`/`useEffect`
  cru): criar `src/lib/queryKeys.ts`, `src/api/` tipado e `QueryClientProvider` no `_layout.tsx`
  raiz. A migração do resto do `home.tsx` (lista de entregas legada) **fica fora de escopo** —
  só o que esta feature toca segue o padrão obrigatório.

## Desenho

### Backend (`services/api` — módulo `driver`)

- **Persistência do veículo ativo do entregador.** Opção recomendada: campo
  `activeVehicleId` (relação opcional com `Vehicle`) no registro do entregador (ou tabela
  `DriverVehicle` se preferir histórico). **Nova migration**; `prisma generate` antes do
  typecheck.
- Endpoints no módulo `driver` (controller fino + service):
  - `GET /driver/vehicles` — lista veículos `active` da rede dona da(s) loja(s) do entregador
    autenticado. Resolver merchant pelo vínculo de staff do entregador, não por id no body.
  - `GET /driver/vehicle/current` — veículo atualmente selecionado (ou `null`).
  - `PUT /driver/vehicle` body `{ vehicleId }` — seleciona/troca. Validar que o veículo
    pertence à rede do entregador e está `active`; senão erro `{ code, message }`
    (`VEHICLE_NOT_AVAILABLE`, `VEHICLE_NOT_FOUND`).
- Expor o `vehicle` selecionado onde fizer sentido pro rastreio da entrega (mínimo: disponível
  via `/driver/vehicle/current`). Vincular à entrega em si fica fora de escopo aqui.
- Tipos de resposta consumidos pelo app entram em `packages/types` + `@markethub/api-client`.

### Frontend (`apps/driver`)

- `src/lib/queryKeys.ts` — chaves `vehicles.all`, `vehicles.current` (nunca literal fora daqui).
- `src/api/vehicles.ts` — funções tipadas recebendo `ApiClient` (listar, obter atual, selecionar).
- `src/api/hooks/useDriverVehicle.ts` — `useDriverVehicles()`, `useCurrentVehicle()`,
  `useSelectVehicle()` (React Query; `useSelectVehicle` invalida `vehicles.current`).
- `QueryClientProvider` no `app/_layout.tsx` raiz.
- `app/select-vehicle.tsx` — rota de seleção. Gate pós-login: o `_layout`/index redireciona pra
  cá quando `useCurrentVehicle()` retorna `null`. A route só orquestra hooks + componentes.
- `app/home.tsx` — adicionar **indicador do veículo selecionado** (placa + tipo/ícone), tocável,
  abrindo o seletor. Não migrar a lista de entregas legada (fora de escopo).
- Form de seleção (se houver busca/escolha) segue `react-hook-form`; lista simples pode ser só
  toque. Estado de UI local ok; **server-state** via React Query.

## Validação

> **Gate de cobertura — código novo sem teste não fecha a story.** Rodar
> `pnpm --filter @markethub/api test:coverage` e `pnpm --filter @markethub/driver test:coverage`.
> Sem `skip`/`only`/`xfail` injustificado. Antes de "pronto": `pnpm typecheck` + `pnpm build`
> (e `prisma generate` após o schema mudar).

- **Backend (`driver` service spec):** `GET /driver/vehicles` lista só `active` da rede do
  entregador; `PUT /driver/vehicle` persiste e troca; rejeita veículo de outra rede
  (`VEHICLE_NOT_AVAILABLE`) e inexistente (`VEHICLE_NOT_FOUND`); `GET current` reflete a última
  seleção e retorna `null` quando nada selecionado.
- **Frontend:** teste dos hooks `useDriverVehicle` (chamada certa + invalidação ao selecionar);
  teste de `select-vehicle` (renderiza lista, selecionar dispara mutation e navega pra home);
  teste do indicador na home (mostra placa/tipo do veículo atual; toque abre o seletor —
  confirma o caminho de ≤2 cliques). Cobrir o gate pós-login (sem veículo → tela de seleção).

## Fora de escopo

- Cadastro/CRUD de veículos (story **14**).
- Migrar a lista de entregas legada do `home.tsx` pra React Query.
- Vincular o veículo a cada entrega individual / histórico por entrega.
- Restrições de RBAC do gerente (stories **16**/**17**).
