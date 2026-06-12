---
name: markethub-project-map
description: Mapa do monorepo MarketHub — onde encontrar cada tipo de mudança (módulo backend, DTO, tela admin, rota mobile, auth, schema/migration, features específicas como catálogo/picking/delivery/pagamento). Use ao localizar arquivos, mapear dependências entre packages, ou começar qualquer tarefa no repo sem saber onde mexer.
---

# Mapa do projeto MarketHub para IA

## Visão geral

Monorepo pnpm + Turborepo da plataforma de marketplace + delivery de supermercados.

- `services/api` — API NestJS + Prisma + PostgreSQL (backend, **standalone** — sem deps `@markethub/*`).
- `apps/customer` — app mobile Expo (cliente: catálogo, carrinho, checkout, tracking).
- `apps/picker` — app mobile Expo (separador/picking).
- `apps/driver` — app mobile Expo (entregador, entrega própria).
- `apps/admin` — web React/Vite (operação + curadoria de catálogo).
- `packages/types` — contrato **dos frontends** (consumido via api-client; **não** usado pelo backend).
- `packages/api-client` — cliente HTTP + Socket.IO + token-store compartilhado pelos apps.
- `packages/ui` — componentes RN compartilhados (source; Metro transpila) — só mobile.
- `BUSINESS_RULES.md` — invariantes de domínio com pointer pro código.
- `CLAUDE.md` — guidance alta prioridade; skills `markethub-*` em `.claude/skills/`.

## Onde procurar

| Tarefa | Comece por |
| --- | --- |
| Regra de negócio / permissão | `BUSINESS_RULES.md`, depois o service do domínio em `services/api/src/<domínio>` |
| Endpoint / API | `services/api/src/<domínio>/<domínio>.controller.ts` (+ `.service.ts`) |
| DTO de entrada | `services/api/src/<domínio>/dto/` |
| Auth / guards / roles (backend) | `services/api/src/auth/` (`guards/`, `decorators/`, `strategies/`) |
| Schema / migrations | `services/api/prisma/schema.prisma`, `services/api/prisma/migrations/` |
| Erros / códigos | `services/api/src/common/codes.ts`, `common/filters/all-exceptions.filter.ts` |
| Contrato compartilhado (front) | `packages/types/src/index.ts` |
| Cliente HTTP / socket (front) | `packages/api-client/src/` (`client.ts`, `socket.ts`, `token-store.ts`) |
| Chamada de domínio num app | `apps/<app>/src/api/*.ts` (módulo tipado que recebe `ApiClient`) |
| Tela administrativa | `apps/admin/src/pages/*` |
| Layout / rotas admin | `apps/admin/src/App.tsx`, `src/components/Layout.tsx`, `ProtectedRoute.tsx` |
| Auth frontend (admin) | `apps/admin/src/auth/auth-context.tsx`, `src/auth/token-store.ts` |
| Auth frontend (mobile) | `apps/<app>/src/auth-context.tsx`, `src/token-store.ts` |
| Config de API frontend | `apps/admin/src/config.ts`, `apps/<mobile>/src/config.ts` |
| Tela / rota mobile | `apps/<app>/app/*` (expo-router, file-based) |

## Onde mora cada feature

| Feature | Backend | Admin | Mobile |
| --- | --- | --- | --- |
| **Catálogo / produto** (lockedFields, enrichment) | `src/catalog/`, `src/enrichment/` | `pages/Catalog.tsx`, `CatalogQuality.tsx`, `ProductDetail.tsx`, `MarketplaceCategories.tsx` | `customer/app/home.tsx`, `explore.tsx`, `category/`, `product/`, `store/` |
| **Oferta / estoque** (manager edita; ERP não sobrescreve) | `src/catalog/`, `src/merchant/` | `pages/merchant/{Offers,Products,Stock}.tsx` | — |
| **Merchant / loja** | `src/merchant/` | `pages/merchants/{MerchantsList,MerchantDetail,StoreDetail}.tsx` | — |
| **Carrinho** (saleType unit/weight) | `src/marketplace/cart.*` | — | `customer/app/cart.tsx`, `src/use-cart.ts` |
| **Checkout / pedido** | `src/marketplace/orders.*`, `pricing.ts` | `pages/Orders.tsx` | `customer/app/checkout.tsx`, `orders.tsx` |
| **Endereço / geocoding** | `src/marketplace/addresses.*`, `src/geocoding/` | — | `customer/app/account.tsx`, `delivery.tsx`, `src/location.ts` |
| **Pagamento** (PIX, swappable) | `src/payment/` (`payment-provider.interface.ts`, `providers/`) | `pages/Finance.tsx` | `customer/app/payment/` |
| **Reembolso** (SF.3) | `src/payment/refund.*` (`refund.pricing.ts` + spec) | `pages/Finance.tsx` | — |
| **Picking / separação** | `src/picking/` | `pages/Operations.tsx` | `picker/app/*` |
| **Delivery** (entrega própria + códigos) | `src/driver/`, `src/common/codes.ts` | `pages/Operations.tsx` | `driver/app/*`, `customer/app/track/`, `delivery.tsx` |
| **Reviews / gorjeta** | `src/reviews/` | — | `customer/app/review/` |
| **Favoritos** | `src/favorites/` | — | `customer/app/favorites.tsx` |
| **ERP / sync** | `src/erp/`, `src/scheduling/` | `pages/ErpRuns.tsx` | — |
| **Usuários** | `src/users/`, `src/admin/` | `pages/Users.tsx` | — |
| **Notificações** | `src/notifications/` | — | (push nos apps) |
| **Realtime** (tracking/picking/delivery) | gateways Socket.IO nos módulos | — | `@markethub/api-client/socket` |
| **Upload (logo/imagem)** | `src/storage/` (S3/MinIO) | upload nas telas de merchant | — |

## Fluxo de dependência

```text
services/api  ── standalone (sem @markethub/*; tipos via Prisma)

packages/types  ←  packages/api-client  ←  apps/admin
                                        ←  apps/customer (+ packages/ui)
                                        ←  apps/picker   (+ packages/ui)
                                        ←  apps/driver   (+ packages/ui)
```

- `packages/types` é contrato **só dos frontends** — o backend NÃO o importa. Backend e front "combinam" o contrato por convenção, não por dep compartilhada; ao mudar uma resposta da API, atualizar `packages/types` **e** o service do backend.
- Mudou `packages/types` → mobile reinicia dev server (Metro transpila do source); admin re-typecheck.
- Mudou `packages/api-client` → garantir re-export de tipos públicos; validar apps consumidores.

## Regras de leitura para IA

- Não carregar todos os arquivos por padrão; usar este mapa para abrir só o necessário.
- Antes de propor alteração, ler o arquivo real afetado.
- Mudança de regra de domínio → cruzar com `BUSINESS_RULES.md`.
- Se o mapa conflitar com o código atual, confiar no código e atualizar o mapa.
