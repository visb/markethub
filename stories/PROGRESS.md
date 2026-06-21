# PROGRESS — rodada AUTORUN (stories 01 → 13)

Rodada: picker (01–03) + explore mapa (04–06) + app merchant (07–13).
Ordem numérica 01 → 13 (satisfaz todas as deps — ver AUTORUN.md "Ordem e dependências").
Fonte de verdade p/ retomar: **git log + este arquivo**. Story com `feat(story-NN)` = feita; pular.

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 01 | Picker: pedidos `queued` no topo da fila | — | OK |
| 02 | Picker: fila atualiza em tempo real (`subscribe:store`) | 01* | TODO |
| 03 | Picker: autocomplete de substituto + migração da tela p/ React Query | 02 | TODO |
| 04 | Backend: `GET /stores/nearby` por viewport (bbox) | — | TODO |
| 05 | Customer: aba explore vira mapa de mercados (base) | 04 | TODO |
| 06 | Customer: explore — mercados sob demanda por viewport + loading | 05, 04 | TODO |
| 07 | App merchant: scaffold (Vite SPA + auth + shell + `merchant/context` + `can`) | — | TODO |
| 08 | App merchant: CRUD de lojas | 07 | TODO |
| 09 | App merchant: configuração de integração (ERP, api-keys, webhooks) | 07 | TODO |
| 10 | App merchant: cadastro de colaboradores (StoreStaff) | 07 | TODO |
| 11 | App merchant: visualizar e gerenciar catálogo | 07, 08 | TODO |
| 12 | App merchant: pedidos e status em tempo real | 07 | TODO |
| 13 | App merchant: relatórios | 07 | TODO |

\* 02 só toca a mesma fila da 01 (dep fraca); 03 depende rígido da 02.

## Log

<!-- [OK|PARCIAL|BLOQUEADO] NN — testes: <resumo> — commit: <hash> — merge: <hash> — <data> — <bloqueio> -->
[OK] 01 — testes: picking.service.spec (12/12, suite api 199/199, coverage gate verde) — commit: 5f85276 — merge: 3904eac — 2026-06-21 —

## Resumo final da rodada

_(preencher ao encerrar — ver AUTORUN.md "Ao terminar")_
