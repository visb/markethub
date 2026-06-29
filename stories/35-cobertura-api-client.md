# 35 Cobertura de testes — @markethub/api-client

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura — frontend + libs
- **Status:** todo
- **Depende de:** 19

## Objetivo

Cobrir o pacote compartilhado `@markethub/api-client` — usado por **todos** os apps — hoje em
**43% linhas / 30% funcs**. É o ponto único de HTTP + socket; bug aqui vaza pra todo o produto.

## User story

Como time, quero o cliente HTTP/socket coberto, para que refresh de token, retry, tratamento de
erro e (re)conexão de socket não regridam silenciosamente em nenhum app.

## Critérios de aceite

- `packages/api-client/src/client.ts` (hoje ~42%) ≥ **70% linhas**: `request` (GET/POST/PATCH/DELETE),
  serialização de body/query, header de auth, **refresh em 401 + replay da request**, propagação de
  erro no shape `{ code, message }`, `auth: false` (rotas públicas), métodos tipados novos (frota/
  follow/summary).
- `packages/api-client/src/socket.ts` (hoje ~0%) ≥ 70%: conexão com token, `subscribe:store`/eventos,
  reconexão, cleanup/`disconnect`.
- `packages/api-client/src/token-store.ts` coberto (get/set/clear; fallback de storage).
- Sem `--passWithNoTests`; gate `perFile`/ratchet da story 19 respeitado (piso sobe pra 70).

## Escopo / Fora de escopo

**Dentro:** specs de `client.ts`, `socket.ts`, `token-store.ts` (vitest). **Fora:** mudar contrato/
tipos (`packages/types`) — só testar o que existe.

## Notas técnicas

`client.test.ts` já existe — ampliar, não duplicar. Mockar `fetch` global e o socket (`socket.io-client`
mockado). Sem rede real. Subir o piso do workspace no `vitest.config.ts` ao fechar.
