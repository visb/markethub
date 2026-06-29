# 37 Cobertura de testes — admin: auth, shell e infra de dados

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura — admin (1/3)
- **Status:** todo
- **Depende de:** 19

## Objetivo

Primeira de três stories pra tirar o `apps/admin` de **7% linhas** (maior buraco do monorepo) rumo
ao **mínimo de 80%** (política da rodada; meta atingida ao fim da story 39). Esta fecha a
**fundação**: autenticação, guarda de rota, shell/layout e a camada de acesso a dados (api wrapper +
hooks base).

## User story

Como time, quero a fundação do painel admin coberta, para que login, proteção de rota e o cliente de
dados não regridam — base sobre a qual as páginas (stories 38/39) são testadas.

## Critérios de aceite

- `src/auth/*` (auth-context, token-store, guard/ProtectedRoute): login ok/erro, persistência de
  sessão, redirect de rota protegida sem sessão, logout. (`auth-context.test`/`token-store.test` já
  existem — ampliar.)
- `src/App.tsx` / router + layout/shell: render das rotas, navegação, item ativo.
- Camada de dados: o wrapper de `ApiClient` + hooks base de query/mutation (chave de `queryKeys`,
  `enabled`, invalidação) que as páginas reusam.
- Piso do `apps/admin` sobe no `vitest.config.ts` conforme o ganho (ratchet só sobe).

## Escopo / Fora de escopo

**Dentro:** specs de auth, shell/router e infra de dados compartilhada. **Fora:** páginas de domínio
(catálogo → 38; merchants/stores/usuários/dashboard → 39).

## Notas técnicas

Vitest + RNTL/jsdom (setup já existe — `Login.test.tsx`, `ProductDetail.test.tsx` dão o padrão).
Mockar `ApiClient`. Sem chamada real.
