# Plan: Página do mercado — botão "Seguir" no AppBar (no lugar do "?")

## Context

**Bloco BACKLOG `# App customer`** (contexto compartilhado das stories 31–33).

Na página da loja (`apps/customer/app/store/[id].tsx`), o **canto superior direito do AppBar**
mostra hoje um ícone de ajuda **"?"** (`Header` com `showHelp`, `help-circle-outline` —
`Header.tsx` L28-29). O design (`briefing/screenshots/marketplace/Merchant Home.jpg`) **não tem
"?"**: no lugar há um **botão "♡ Seguir"** (pílula vermelha, coração + texto) no topo direito.

Além disso, a tela já tem um botão `"♡ Seguir"` **inline** ao lado do `storeHead` (L119), com
`onPress` **no-op**. O screenshot mostra o Seguir **só no AppBar** — o inline é duplicação.

### Decisões travadas (refinamento)

- **Escopo desta story = só UI** (posicionar o botão). A **funcionalidade de seguir/deixar de
  seguir** (endpoint + persistência + estado seguido) é a **story 34** (criada nesta sessão).
  O `onPress` aqui fica **placeholder no-op** (TODO apontando a story 34).
- **AppBar:** trocar o "?" pelo botão "Seguir" nesta tela. O `Header` precisa suportar uma
  **ação à direita** (botão Seguir) no lugar do ícone de ajuda — sem quebrar as outras telas que
  usam `Header` com o "?" padrão.
- **Remover o botão "Seguir" inline** (L119) do `storeHead` — bate com o screenshot e evita
  dois botões de seguir.
- **Sem migração React Query** nesta story (mudança de UI; a tela segue com fetch legado — dívida
  registrada, fora de escopo aqui). O wiring de dados do follow é a story 34.

### Dependências

- **Story 34** (backend de seguir loja) **depende** desta para wirar o `onPress` ao estado real.
- Stories 31/32 são independentes.

## Desenho

### `Header.tsx` — ação à direita opcional

- Adicionar prop opcional para renderizar uma **ação custom** à direita, ex.:
  `rightAction?: React.ReactNode`. Quando presente, renderiza-a no lugar do bloco
  `showHelp`/ícone "?". Default mantém o comportamento atual (telas existentes não mudam).
  - Alternativa equivalente: `showHelp={false}` + `rightAction={<FollowButton .../>}`. Escolher a
    forma que mantém o contrato atual intacto (nenhuma tela existente passa `rightAction`, então
    todas seguem com o "?").

### `store/[id].tsx`

- Passar ao `Header` a ação de seguir no topo direito:
  `<Header title="" rightAction={<FollowButton following={false} onPress={() => {/* TODO story 34 */}} />} />`
  (`title=""` já vem da story 32).
- **Remover** o `<Button title="♡ Seguir" ... />` inline do `storeHead` (L119).
- Botão "Seguir": pílula vermelha (`colors.primary` de fundo, texto/ícone brancos) com coração
  (`Ionicons heart-outline` / `heart`). Pode ser um pequeno componente local `FollowButton` na
  tela (ou em `src/components/` se for reaproveitado) — visual conforme o screenshot.

## Validação

Frontend-only (app `customer`). **Gate de cobertura: código novo sem teste não fecha a story.**

- `pnpm --filter @markethub/customer test`:
  - **`Header`** (render RNTL barato — componente isolado, sem mocks da tela): com `rightAction`
    renderiza a ação e **não** mostra o "?"; sem `rightAction`, mantém o "?" (regressão das telas
    existentes).
  - **`store/[id]`**: AppBar mostra "Seguir" e **não** mostra "?", e o botão "Seguir" inline
    antigo sumiu. Preferir **source-level** (regex sobre `app/store/[id].tsx` via `fs.readFileSync`,
    como o bloco "tela explore" de `exploreMap.screen.test.tsx` L78-101): assertir
    `rightAction`/`FollowButton` no `Header` e ausência do `<Button title="♡ Seguir"` inline.
    Render cheio da tela é alternativa custosa (mocka `useCart`/`CategoryMenu`/`CartFab`/...).
- `pnpm --filter @markethub/customer typecheck`.
- `pnpm test:coverage` do customer sobre os arquivos tocados; sem `skip`/`only`/`xfail`
  injustificado.
- Verificação manual (Expo): `/store/:id` com botão "Seguir" no topo direito, sem "?", sem botão
  duplicado.

## Fora de escopo

- **Funcionalidade de seguir** (endpoint, persistência, estado seguido/não-seguido, toggle) →
  **story 34**. Aqui `onPress` é placeholder.
- Migrar o fetch da tela para React Query (dívida registrada).
- Mudar o "?" nas demais telas que usam `Header` — só a página do mercado troca.
