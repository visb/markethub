# Plan: driver — ganhos (gorjetas) e histórico de entregas

## Context

`Tip` está completo (`driverId`, `amountCents`, `status` com `paid`/`paidAt`, PIX por
provider) e o **admin** já vê "gorjetas por entregador" no Finance — mas o **próprio driver não
vê nada**: nem gorjetas recebidas, nem histórico de entregas concluídas. O app do driver só
mostra entregas ativas/disponíveis (`GET driver/deliveries`).

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- Só **gorjetas** como ganho (own-store: driver é staff da loja — não há repasse por corrida
  na plataforma; remuneração-base é fora do sistema).
- Gorjeta conta quando `status = paid` (pendente aparece separada, sem somar).
- Períodos fixos: hoje / 7 dias / 30 dias (sem range custom).

## Desenho

### Backend (`services/api/src/driver`)

1. `GET driver/earnings?period=today|7d|30d` → `{ tipsPaidCents, tipsPaidCount,
   tipsPendingCents, deliveriesCompleted }` — agregação Prisma (`Tip` por `driverId`/`paidAt`,
   `Delivery` entregues no período). Tabela `tips` consultada direto via Prisma no service do
   driver (kernel compartilhado); sem import de internals do módulo de reviews.
2. `GET driver/deliveries/history?page=` → entregas `delivered`/`canceled` do driver, desc por
   data: loja, bairro/cidade do destino, data/hora, status, gorjeta do pedido
   (valor+status) se houver. DTOs em `packages/types`.

### Driver app

3. Rota nova `earnings.tsx` (entrada na home, ex. card/botão "Meus ganhos"): seletor de
   período (3 chips), cards (gorjetas recebidas R$, nº entregas, pendentes R$ discreto),
   lista paginada do histórico ("carregar mais"). React Query com query keys centralizadas;
   estado vazio amigável.

## Validação

- Backend: specs da agregação (paid soma, pending separa, período filtra por `paidAt`,
  driver só vê o seu) e do histórico (paginação, só delivered/canceled, gorjeta anexada).
  `pnpm --filter @markethub/api test`.
- Driver: tela renderiza cards + lista, troca de período refaz query, paginação acumula,
  estado vazio. `pnpm --filter @markethub/driver test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  driver ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.

## Fora de escopo

- Repasse/salário por entrega (fora do sistema no modelo own-store).
- Range de datas custom / export CSV.
- Notificação de gorjeta recebida (encaixa na infra da story 50 depois).
- Tela de gorjetas no merchant (admin Finance já cobre a visão gerencial).
