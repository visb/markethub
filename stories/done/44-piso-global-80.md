# 44 Travar piso global de cobertura em 80%

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura — frontend + libs
- **Status:** todo
- **Depende de:** 35, 36, 37, 38, 39, 40, 41, 42, 43

## Objetivo

Selar a política: **mínimo de 80% linhas em todos os workspaces**. Depois que as stories 35-43
levam cada workspace abaixo de 80 até o alvo, esta trava o piso do ratchet em **80** em todos —
inclusive os que já passam (`merchant` ~92%, `types` ~85%) — e atualiza a documentação.

## User story

Como time, quero o gate reprovando qualquer workspace abaixo de 80% linhas, para que a meta vire piso
permanente — nada regride abaixo de 80 e código novo entra ≥ 80 sem depender de disciplina manual.

## Critérios de aceite

1. **Piso = 80 em todo workspace** no config de teste: `coverageThreshold.global.lines: 80` (jest:
   api, customer, picker, driver) e `coverage.thresholds.lines: 80` (vitest: admin, merchant,
   api-client, types, ui). Branches no piso atingível (≥ 70 onde já couber; documentar exceção).
2. **Pré-condição verificada:** rodar `pnpm test:coverage` e confirmar que **todos** os workspaces
   estão ≥ 80 linhas **antes** de travar (senão a story do workspace faltante não fechou — bloquear).
3. **`perFile: true` reavaliado** por workspace agora que o agregado está em 80 (ligar onde a mínima
   por arquivo permitir, conforme nota da story 19).
4. **Documentação:** `CLAUDE.md` (seção CI) substitui a tabela de "meta-alvo" pela regra única
   **"piso = 80% linhas em todos os workspaces, só sobe"**; `diff-coverage` ≥ 90% para linhas novas
   permanece.
5. CI verde com os pisos em 80 (jobs `coverage` + `verify`).

## Escopo / Fora de escopo

**Dentro:** editar os 9 configs de teste (piso 80) + `CLAUDE.md` + checagem de pré-condição. **Fora:**
escrever testes (é o trabalho das stories 35-43) — esta só trava o piso depois que a meta foi batida.

## Notas técnicas

Story puramente de configuração/documentação; sem código de produto. Se algum workspace ainda estiver
< 80 ao chegar aqui, **não baixar o piso** — registrar BLOQUEADO e reabrir a story de cobertura
correspondente. Ratchet só sobe.
