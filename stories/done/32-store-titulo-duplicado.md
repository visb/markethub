# Plan: Página do mercado — remover nome duplicado (AppTitle vazio)

## Context

**Bloco BACKLOG `# App customer`** (contexto compartilhado das stories 31–33).

Na página da loja (`apps/customer/app/store/[id].tsx`), o nome do mercado aparece **duas vezes**:

1. No **AppBar** (componente `Header`, linha 105): `<Header title={name ?? "Loja"} />` — renderiza
   o nome em vermelho/caixa-alta no topo (`Header.tsx` L26).
2. No **header da loja** ao lado da `MerchantLogo` (linha 110):
   `<Text style={styles.storeName}>{store?.merchantName ?? name ?? "Loja"}</Text>`.

Desejado: manter **só o do header (ao lado da logo)** e **deixar o AppTitle vazio**.

### Decisões travadas

- **Esvaziar o título do `Header`** nesta tela (`title=""`), preservando o botão de voltar
  (`showBack`) e o ícone de ajuda — a troca do "?" por "Seguir" é a **story 33**, separada.
- O bloco ao lado da `MerchantLogo` (linha 107–120) **permanece** como fonte única do nome.
- O param `name` da rota continua sendo usado como fallback do `storeName` (linha 108/110) —
  **não** removê-lo.
- **Sem migração React Query** nesta story: a mudança é cosmética (prop do `Header`). A tela
  ainda busca via `useState/useEffect` (legado) — fica registrado como dívida, fora de escopo
  aqui (evitar inflar uma correção de uma linha). Stories futuras que mexam na lógica de dados
  da tela fazem a migração.

### Dependências

- Story **33** mexe na mesma tela (botão "Seguir" no lugar do "?") — independente; pode ser
  feita antes ou depois.

## Desenho

- Em `app/store/[id].tsx`, trocar `<Header title={name ?? "Loja"} />` por `<Header title="" />`.
  - `Header` faz `title.toUpperCase()` (L26) — string vazia renderiza vazio, sem quebrar layout
    (o `<View style={{ flex: 1 }} />` mantém o espaçamento entre voltar e ajuda).
- Nada mais muda; o nome segue exibido no `storeHead` ao lado da logo.

## Validação

Frontend-only (app `customer`). **Gate de cobertura: código novo sem teste não fecha a story.**

- `pnpm --filter @markethub/customer test` — afirmar que o AppTitle fica vazio e o nome do
  mercado aparece **uma única vez** (o do `storeHead`). Duas técnicas possíveis (espelho:
  `exploreMap.screen.test.tsx`, que usa **as duas**):
  - **Source-level (preferida aqui, mais barata):** ler `app/store/[id].tsx` via
    `fs.readFileSync` e assertir com regex que o `Header` recebe `title=""` (não
    `title={name ...}`) — exatamente o padrão do bloco "tela explore" em
    `exploreMap.screen.test.tsx` (L78-101). Não precisa montar a tela cheia.
  - **Render (RNTL):** alternativa mais completa, porém **custosa** — renderizar `store/[id]`
    exige mockar `marketplace`/`useAuth`/`expo-router`/`useCart`/`CategoryMenu`/`CartFab`. Só
    vale se quiser asserção visual real do nome aparecendo 1×.
- `pnpm --filter @markethub/customer typecheck`.
- `pnpm test:coverage` do customer sobre o arquivo tocado; sem `skip`/`only`/`xfail` injustificado.
- Verificação manual (Expo): abrir `/store/:id` e confirmar nome só ao lado da logo, AppBar sem
  título.

## Fora de escopo

- Trocar o ícone "?" por "Seguir" no AppBar → **story 33**.
- Migrar o fetch da tela para React Query (dívida registrada).
- Qualquer outro ajuste de layout do `storeHead` ou do `Header`.
