# Plan: Explore — modal do mercado ao tocar o marker

## Context

App customer, aba **Explorar** (`apps/customer/app/explore.tsx`). Bloco do BACKLOG
"App customer".

Hoje, tocar no pin de um mercado **navega direto** para `/store/:id`
(`onStorePress` → `router.push`). O comportamento desejado é **abrir um modal**
(bottom sheet) com o resumo do mercado; a navegação para a loja passa a ser uma
ação explícita dentro do modal. Design de referência: `briefing/screenshots/marketplace/Explorar.jpg`.

O modal (conforme o screenshot) mostra: logo + nome do mercado, endereço completo,
rating em estrelas, contato (whatsapp), ETA ("30 min ou programada"), faixa de
frete ("R$7 – R$15"), status **"Aberto agora"** e badge **"Retirar na loja"**.
Único CTA é **"Acessar loja"** → `/store/:id`.

### Decisões travadas (refino interativo)

- **"Retirar na loja" é uma FLAG, não um botão.** Indica que a loja permite
  retirada de pedidos; renderiza como badge condicional. O único botão de ação do
  modal é **"Acessar loja"** → `router.push('/store/:id?name=...')` (a navegação
  atual, agora atrás do botão).
- **Dados do modal via endpoint dedicado buscado no tap** (`GET /stores/:id/summary`),
  não engordando `/stores/nearby`. `NearbyStoreDTO` (pins do viewport) fica enxuto;
  o summary só é buscado quando um marker é tocado. Modal mostra spinner enquanto
  carrega.
- **Fidelidade total ao screenshot** (escolha do usuário): os campos que não existem
  no schema são adicionados nesta story — telefone, flag de retirada e **horário de
  funcionamento** (modelo novo para computar "aberto agora" de verdade), com seed e
  edição no admin.

### Gaps de schema cobertos aqui

`Store` hoje tem endereço (street/number/district/city/state/zip), lat/lng e
`avgPrepMinutes`. `Merchant` tem `deliveryFeeCents`/`prepFeeCents`/`platformFeeBps`
e `logoUrl`. Faltam: telefone, flag de retirada, rating e horário de funcionamento.

| Campo do modal | Fonte |
|---|---|
| Logo + nome merchant | ✅ `Merchant.logoUrl` / `Merchant.name` |
| Nome + endereço da loja | ✅ `Store.name` + `street/number/district/city/state` |
| ETA "30 min" | ✅ `Store.avgPrepMinutes` |
| Faixa de frete "R$7 – R$15" | ⚠️ derivada: `[deliveryFeeCents, deliveryFeeCents + doorSurchargeCents]` |
| Rating ⭐ + contagem | ❌ agregar de `Review` (axis = `merchant`, por `targetMerchantId`) |
| Telefone/whatsapp | ❌ nova coluna `Store.phone` |
| Badge "Retirar na loja" | ❌ nova coluna `Store.allowsPickup` |
| "Aberto agora" | ❌ novo modelo `StoreHours`, comparado com a hora atual |

A faixa de frete usa o `doorSurchargeCents` (entrega na porta) já existente nos
totais do carrinho como teto; piso = `deliveryFeeCents`. Se ambos forem iguais,
o modal mostra valor único em vez de faixa.

## Desenho

### Backend (`services/api`)

**Migration (nova, nunca editar aplicada):**
- `Store.phone String?`
- `Store.allowsPickup Boolean @default(true)`
- Novo modelo `StoreHours`: `{ id, storeId, dayOfWeek Int (0=domingo..6), opensAt Int, closesAt Int }`
  — `opensAt`/`closesAt` em **minutos desde a meia-noite** (ex.: 8h = 480), para
  comparação simples e livre de timezone na coluna. Relação `Store.hours StoreHours[]`,
  `@@index([storeId])`. Dia sem linha = fechado nesse dia.

**Endpoint** `GET /stores/:id/summary` no `catalog.controller.ts` (rota estática
`stores/:id/summary`; o `nearby` já é casado antes). Retorna `StoreSummaryDTO`:
```ts
interface StoreSummaryDTO {
  id: string;
  name: string;
  merchantName: string;
  merchantLogoUrl: string | null;
  address: { street: string|null; number: string|null; district: string|null; city: string|null; state: string|null };
  phone: string | null;
  rating: { average: number; count: number } | null; // null = sem reviews
  etaMinutes: number;                 // avgPrepMinutes
  deliveryFeeCents: number;           // piso
  doorFeeCents: number;               // teto (deliveryFee + doorSurcharge)
  allowsPickup: boolean;
  openNow: boolean;
}
```
- **`openNow` computado no servidor** (evita bug de timezone no cliente): hora atual
  em `America/Sao_Paulo` → `dayOfWeek` + minuto-do-dia; aberto se existe linha de
  `StoreHours` do dia com `opensAt ≤ agora < closesAt`. Janelas que cruzam a
  meia-noite ficam **fora de escopo** (MVP: assume `closesAt > opensAt`).
- **`rating`**: `prisma.review.aggregate` (`_avg.rating`, `_count`) filtrando
  `axis = 'merchant'` e `targetMerchantId = store.merchantId`. Sem reviews → `null`.
- Loja inexistente/inativa → `404 STORE_NOT_FOUND` (shape `{ code, message }`).
- Regra de negócio no `CatalogService` (controller fino só roteia).

**Admin (edição):** a tela de loja do admin (`@Controller("admin/stores")`) ganha
edição de `phone`, `allowsPickup` e do horário de funcionamento (CRUD das linhas de
`StoreHours` por dia da semana). DTO PATCH com campos `@IsOptional()`.

**Seed:** popular `phone`, `allowsPickup` e um horário padrão (ex.: seg–sáb 8h–22h,
dom 8h–20h) para as lojas existentes, para o modal e o admin terem dados reais.

### Tipos compartilhados (`packages/types`)

`StoreSummaryDTO` em `packages/types/src/stores.ts` (ao lado de `NearbyStoreDTO`),
re-exportado por `@markethub/api-client`. Espelhar em `apps/customer/src/api/marketplace.ts`
(`storeSummary: (id) => api.request<StoreSummaryDTO>('/stores/:id/summary')`).

### Frontend (`apps/customer`)

- **`MapView.types.ts`** — `onStorePress` mantém a assinatura; a tela é que muda o
  que faz no callback. (web + nativo já encaminham o tap; sem mudança de engine.)
- **`explore.tsx`** — em vez de navegar, guarda `selectedStoreId` (useState de UI
  local, permitido) e renderiza `<StoreSummarySheet storeId={selectedStoreId} onClose .../>`.
  Tela continua sem fetch inline.
- **`useStoreSummary(storeId)`** — novo hook em `src/api/hooks/`, React Query,
  `enabled: !!storeId`. Key nova em `queryKeys.explore.storeSummary(id)`.
- **`StoreSummarySheet`** componente (`src/components/`) — bottom sheet seguindo o
  `Explorar.jpg`: logo, nome, endereço, estrelas (rating.average / count), link
  whatsapp (`phone`), ETA, faixa de frete (`deliveryFeeCents`–`doorFeeCents`, ou
  valor único se iguais), badge **"Aberto agora"** (verde) / "Fechado" via `openNow`,
  badge **"Retirar na loja"** condicional a `allowsPickup`, botão **"Acessar loja"**
  → `router.push('/store/:id?name=...')`. Spinner enquanto `useStoreSummary` carrega.

## Validação

Gate de cobertura obrigatório: **código novo sem teste não fecha a story.**
`pnpm --filter @markethub/api test:coverage` + `pnpm --filter @markethub/customer test:coverage`.
Sem `skip`/`only`/`xfail` injustificado.

**Backend (`services/api`):**
- `CatalogService.storeSummary` / endpoint:
  - monta o DTO com endereço, ETA, faixa de frete (piso/teto) e logo/merchant;
  - `rating` agregado de reviews `axis=merchant` (com reviews → média+contagem; sem → `null`);
  - `openNow`: dentro da janela do dia → `true`; antes de `opensAt`/depois de `closesAt` → `false`; dia sem linha → `false` (fechado); casos de borda `opensAt`/`closesAt`;
  - `allowsPickup` reflete a coluna;
  - loja inexistente/inativa → `404 STORE_NOT_FOUND`.
- Admin: PATCH parcial de `phone`/`allowsPickup` (undefined ≠ alteração) e CRUD de `StoreHours`.
- `prisma generate` antes do typecheck (schema mudou).

**Frontend (`apps/customer`):**
- `useStoreSummary`: não busca sem `storeId`; busca e expõe dados ao receber id.
- `explore` screen: tocar no marker **abre o modal** (não navega); fechar limpa a seleção.
- `StoreSummarySheet`: renderiza campos; spinner durante o load; faixa de frete vira
  valor único quando piso = teto; badge "Retirar na loja" só com `allowsPickup`;
  badge "Aberto agora" vs "Fechado" conforme `openNow`; botão "Acessar loja" navega
  para `/store/:id`.

Encerrar com `pnpm typecheck` + `pnpm build`; backend tocado → `pnpm --filter @markethub/api test`.

## Fora de escopo

- Janelas de horário que cruzam a meia-noite (assume `closesAt > opensAt`).
- Múltiplas janelas por dia (uma faixa abre–fecha por dia da semana).
- Telefone como link `tel:`/`wa.me` clicável funcional além do display (apenas exibe;
  deep-link de whatsapp pode virar refino posterior).
- Barra de endereço no topo do mapa + marker de localização do usuário — **item 2 do
  bloco, story própria** (depende desta só por compartilhar a tela `explore`).
