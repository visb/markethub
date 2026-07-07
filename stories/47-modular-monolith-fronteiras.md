# Plan: Modular monolith — travar fronteiras de contexto e comunicação por evento

## Context

Antes de cogitar extrair serviços do backend, o pré-requisito é **endurecer as fronteiras dentro do
monolito**. Hoje os módulos de domínio (`services/api/src/*`) se importam livremente, inclusive
alcançando **internals** de outro contexto e formando **ciclos** — o que torna qualquer extração
futura cara e o código atual difícil de evoluir isolado por time.

Esta story é o **Passo 0** da estratégia discutida com o usuário: **modular monolith agora, extrair
1 serviço só quando um forçante concreto aparecer** (escala assimétrica, deploy independente,
fronteira de time). Ela dá ~80% do benefício de isolamento (contextos evoluem sem colidir) com
**zero imposto de distribuído** (nada de rede/transação distribuída). Também prepara a extração
futura: quando as fronteiras estão limpas e a comunicação cross-context é por evento (outbox das
stories 45/46), mover um contexto pra outro processo vira trocar fila local por fila remota.

### Evidências do acoplamento atual (concretas)

- **Deep import de helper de outro contexto:**
  - `../erp/catalog-normalize` importado por `enrichment`, `merchant`, `catalog`;
  - `../marketplace/pricing` importado por `picking` e `payment`.
- **Ciclo `payment ↔ marketplace`:** `payment/payment.service.ts` importa `OrdersService`;
  `marketplace/marketplace.module.ts` importa `RefundModule` (de payment).
- **Orquestrador acoplado:** `marketplace/orders.service.ts` injeta `erp`, `picking`, `payment`,
  `scheduling` diretamente (parte disso já vira evento nas stories 45/46).
- `driver` alcança `picking/handoff.service` e `picking/order-tracking.service`; etc.

Sem regra automatizada, o lint (`eslint "src/**/*.ts"`) não impede nenhum desses.

### Decisões (alinhadas com o usuário)

- **Não** virar microservices agora. Esta story só organiza o monolito.
- Comunicação cross-context **só** por: (a) API pública do módulo (via DI da fachada exportada) ou
  (b) **evento de domínio** (outbox — stories 45/46). Nunca deep import de internals nem acesso a
  tabela/model Prisma de outro contexto.
- Enforcement **automatizado** (lint), não convenção em doc que ninguém segue.
- Refatoração **incremental**: violações que exigem cirurgia grande entram numa allow-list explícita
  e documentada, a ser drenada em follow-up — a story não trava por causa do ciclo herdado
  `payment↔marketplace`, mas o **veda para código novo**.

## Desenho

### 1. Mapear bounded contexts

Definir os contextos como unidade de fronteira (agrupando módulos afins):

- **catalog** = `catalog + enrichment + erp`
- **fulfillment** = `marketplace + picking + driver + scheduling`
- **payment** = `payment`
- **identity** = `auth + users`
- **merchant** = `merchant`
- **support/shared** = `notifications + geocoding + storage + queue + events`
- **admin** = `admin`

(Grão de contexto pode ser afinado na implementação; o que importa é a fronteira ser explícita e
lintada.)

### 2. Superfície pública por contexto

- Cada contexto expõe um **barrel público** (`index.ts` / `public-api.ts`) listando só o que outros
  contextos podem consumir (o `*.module.ts` para DI e as fachadas de service destinadas a
  cross-context). Tudo o mais é interno.
- Import cross-context passa a mirar **só** o barrel público — nunca um arquivo fundo
  (`../erp/catalog-normalize`, `../picking/handoff.service`, etc.).

### 3. Enforcement via ESLint

- Adicionar `eslint-plugin-boundaries` (ou `import/no-restricted-paths` — decidir na impl; boundaries
  é mais expressivo p/ "element types"). Regras:
  - **(a)** import cross-context só pelo barrel público do contexto alvo; deep import = erro.
  - **(b)** proibir import direto de outro contexto quando a intenção é efeito colateral que deveria
    ser evento (documentar a heurística; onde já houver evento na 45/46, exigir o evento).
  - **(c)** allow-list explícita e comentada para as violações herdadas que exigem refactor grande
    (ex.: ciclo `payment↔marketplace`) — cada entrada com TODO/story de follow-up. Código **novo**
    não pode adicionar entradas sem justificativa.
- `pnpm lint` passa a falhar em violação nova.

### 4. Drenar violações de baixo custo (nesta story)

- **Helpers puros compartilhados** que hoje moram dentro de um contexto e são importados por vários
  (`erp/catalog-normalize`, `marketplace/pricing`): mover para um local neutro
  (`services/api/src/shared/` ou o pacote adequado) e reapontar imports. Deixa de ser deep import
  cross-context. Testes existentes desses helpers acompanham o move.
- Ajustes triviais de import para o barrel público onde não há mudança de comportamento.
- O que exigir cirurgia (quebrar o ciclo `payment↔marketplace`, extrair fachadas maiores) **fica na
  allow-list** com follow-up — não nesta story.

### 5. Documentar a regra

- Registrar em `CLAUDE.md` (seção de boundaries do backend) e/ou `docs/` o princípio: cross-context
  só por barrel público ou evento; nada de deep import; nada de tabela alheia. Curto e cravado onde
  o time lê.

## Fora de escopo

- Extrair qualquer serviço para outro processo/deploy (microservices) — futuro, só com forçante.
- Quebrar o ciclo `payment↔marketplace` e demais refactors grandes — allow-list + follow-up.
- Ownership de dados por contexto / separar schema Prisma — pré-requisito de extração real, não
  desta story.
- Mudar a lógica de negócio de qualquer módulo — esta story move/reaponta e linta, não altera
  comportamento.

## Validação

Camada tocada: **backend `services/api`** (config de ESLint, barrels, move de helpers puros). Sem
mudança de comportamento de runtime esperada.

1. **Lint é o gate central:** `pnpm --filter @markethub/api lint` (e `pnpm lint` no monorepo) passa
   com as regras de boundary ativas; introduzir de propósito um deep import cross-context num
   arquivo de teste/scratch deve **falhar** o lint (provar que a regra morde) — remover antes de
   fechar.
2. **Typecheck + build:** `pnpm typecheck` + `pnpm build` verdes após reapontar imports/mover
   helpers (caminhos novos resolvem).
3. **Testes — `pnpm --filter @markethub/api test`:** a suíte inteira continua verde após os moves;
   os specs dos helpers movidos (`catalog-normalize`, `pricing`) acompanham o novo caminho e seguem
   passando — **sem perder asserção**. Nenhum comportamento novo introduzido, então o foco é
   **regressão zero**.
4. **Allow-list auditável:** cada exceção herdada no ESLint tem comentário com o motivo e o
   follow-up; nenhuma exceção nova sem justificativa.

> **Gate de cobertura (trava a story):** a story é majoritariamente config + movimentação de código,
> não lógica nova — mas qualquer código que mude de lugar mantém seus testes e **não reduz** a
> cobertura do módulo. Rodar `pnpm --filter @markethub/api test:coverage`; piso global 80% linhas
> preservado. Sem `skip`/`only`/`xfail` sem justificativa no código (CLAUDE.md).

## Relação com outras stories

- **Independe** das stories 45/46 para começar, mas as **complementa**: onde a 45/46 já
  transformaram efeito cross-context em evento (`order.paid`, `order.created`, `picking.done`), a
  regra (b) desta story passa a exigir o evento em vez do import direto. Ideal implementar após 45/46
  para já refletir os eventos existentes na allow-list.

## Implementação (concluída)

- **Enforcement:** regra ESLint local `markethub/context-boundaries`
  (`services/api/eslint.boundaries.mjs` + `services/api/eslint.config.mjs`, que estende o config
  raiz). Escolhida no lugar de `eslint-plugin-boundaries`/`import/no-restricted-paths` ("decidir na
  impl"): resolução por path-math puro (imports relativos em `src/`), zero dependência nova e
  allow-list por aresta `arquivo -> alvo`. Roda no `pnpm --filter @markethub/api lint` normal (CI).
- **Semântica:** intra-contexto livre; kernel (`shared/common/config/prisma`) livre; cross-context
  só via barrel `src/<mod>/index.ts` ou `*.module` (DI) entre pares da matriz
  `ALLOWED_DEPENDENCIES`; fora da matriz → evento de domínio (outbox). `*.module` não é
  re-exportado nos barrels de propósito (evita ciclo de require entre contextos).
- **Contextos:** catalog (catalog/enrichment/erp), fulfillment (marketplace/picking/driver/
  scheduling), payment, identity (auth/users), merchant, admin, engagement (reviews/favorites/
  store-follows), support (events/integration/notifications/geocoding/storage/queue/health),
  shared (kernel).
- **Drenagem nesta story:** `erp/catalog-normalize` e `marketplace/pricing` movidos p/
  `src/shared/` (specs junto, sem perder asserção); `DOOR_SURCHARGE_CENTS` virou const de
  `shared/pricing` (CartService mantém o getter estático); ~60 arquivos reapontados p/ os 12
  barrels novos (auth, users, erp, picking, payment, events, integration, notifications,
  geocoding, storage, reviews, store-follows).
- **Allow-list herdada (7 entradas):** só o ciclo `payment ↔ fulfillment`
  (payment.module/payment.service → marketplace; marketplace.module/orders.service e
  picking.module/picking-session.service → payment/refund). Follow-up: fachada de order-status +
  reembolso por evento.
- **Validação:** probe de deep import de propósito reprovou o lint (regra morde) e foi removido;
  lint/typecheck/build verdes; `@markethub/api` 967/967 unit + 111/111 e2e; coverage 83.57%
  linhas (piso 80 preservado; barrels `index.ts` excluídos do collectCoverageFrom — só re-export);
  diff-coverage OK.
- **Docs:** bullet em `CLAUDE.md` (Arquitetura — backend) + `docs/context-boundaries.md`.
