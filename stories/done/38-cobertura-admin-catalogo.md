# 38 Cobertura de testes — admin: catálogo e enriquecimento

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura — admin (2/3)
- **Status:** todo
- **Depende de:** 37

## Objetivo

Segunda das três stories do admin. Cobrir as páginas de **catálogo/produto** — o fluxo mais rico do
painel (edição de produto, `lockedFields`, enriquecimento, categoria marketplace).

## User story

Como time, quero as telas de catálogo do admin cobertas, para que edição de produto, trava de campo
(`lockedFields`) e ações de enriquecimento não quebrem a curadoria.

## Critérios de aceite

- Páginas/listagem de produtos + detalhe (`ProductDetail` já tem teste — ampliar): filtro/busca,
  abrir produto, editar campo (salva só o diff), badge de `lockedFields` + destravar.
- Disparo de enriquecimento / reprocessar (mutation chama o método certo e invalida a query key).
- Categoria marketplace (árvore/mapeamento) na UI, se exposta no admin.
- Hooks de query/mutation do catálogo: chave de `queryKeys`, `enabled`, invalidação no sucesso.

## Escopo / Fora de escopo

**Dentro:** specs das telas/hooks de catálogo + produto + enriquecimento do admin. **Fora:** auth/
shell (story 37); merchants/stores/usuários/dashboard (story 39); backend de catálogo (já coberto nas
stories 25/26).

## Notas técnicas

Conferir `lockedFields` em `BUSINESS_RULES.md` (salvar só o diff). Mockar `ApiClient`/hooks; sem rede.
Ampliar `ProductDetail.test.tsx`, não duplicar. Subir o piso do admin ao fechar.
