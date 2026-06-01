# SF.2 Remover ícones (emoji) de categoria

- **Fase:** fix (pré-fase-4)
- **Epic:** Correções de domínio
- **Status:** done
- **Depende de:** [S1.7, S2.8]

## Objetivo
Remover o campo `icon` (emoji/URL) das categorias de marketplace. Visual amador; categorias exibidas só por nome.

## User story
Como produto, quero categorias sem emoji/ícone, para uma apresentação mais profissional.

## Critérios de aceite
- **Schema (`MarketplaceCategory`):** remover `icon String?` (schema.prisma:188). Migration nova dropando a coluna.
- **Seed (`prisma/seed.ts`):** remover `icon` das 5 categorias e dos blocos `update`/`create` (linhas ~39-43, 106-107).
- **API:**
  - `marketplace-category.service.ts`: remover `icon` do input type, `select`, `create`, `update`.
  - `marketplace-category.controller.ts`: remover `icon` dos DTOs (linhas 15, 23).
  - `catalog.service.ts`: remover `icon` dos `select` (linhas 196, 216).
- **Customer app:**
  - `src/api/marketplace.ts`: remover `icon` dos tipos (linhas 89, 148).
  - `app/home.tsx:78`: render só `{sec.category.name}` (tirar `{sec.category.icon}`).
- **Admin (`pages/MarketplaceCategories.tsx`):** remover input de ícone do form, coluna da tabela e prefixo `{c.icon}` na listagem.
- Sem referências órfãs a `category.icon`; API, apps e admin compilam.

## Escopo / Fora de escopo
- **Inclui:** schema/migration, seed, API catalog, customer app, admin.
- **Fora:** ícones de navegação/UI (ex.: `Ionicons` em `CategoryMenu.tsx`, `home.tsx`) — não são ícone de categoria, mantêm.

## Notas técnicas
- Comentário no schema (`// emoji ou URL de ícone`) sai junto.
- Dev DB pode resetar; migration simples de `DROP COLUMN icon`.
