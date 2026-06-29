# 43 Cobertura de testes — services/api: fechar no meta-alvo 80%

- **Fase:** infra/qualidade
- **Epic:** Backfill de cobertura — frontend + libs
- **Status:** todo
- **Depende de:** 19

## Objetivo

Levar o `services/api` de **71% linhas** ao meta-alvo de **80%** (branches 70%), fechando os gaps
remanescentes após o backfill por risco (stories 20-28): controllers ainda só-e2e, branches de erro
e módulos de menor risco.

## User story

Como time, quero o backend no piso de 80%, para travar a meta da story 19 e impedir que módulo novo
entre abaixo do alvo — daqui pra frente o `perFile`/diff segura, o agregado já está no destino.

## Critérios de aceite

- Identificar os arquivos `services/api/src/**` abaixo de 80% linhas (relatório
  `coverage/coverage-summary.json`) e cobrir os de maior peso absoluto até o **agregado ≥ 80% linhas
  / 70% branches**.
- Controllers ainda cobertos só por e2e ganham spec unit (instanciar + service mockado), à exceção
  de metadata de decorator intestável (documentar).
- Branches de erro/guarda não exercitados (caminhos `{ code, message }`) cobertos.
- **Piso do `services/api` sobe pra 80** no `jest.config.js`; avaliar ligar `perFile` agora que o
  agregado está no alvo (nota da story 19: ligar quando a cobertura mínima por arquivo permitir).

## Escopo / Fora de escopo

**Dentro:** specs unit que faltam pra fechar o agregado em 80/70. **Fora:** e2e (gate é unit/
integration); reescrever lógica (só testar; bug vira fix à parte).

## Notas técnicas

Rodar `pnpm --filter @markethub/api test:coverage` e ler o summary pra priorizar por linhas
descobertas × peso. Mock Prisma/fila/HTTP — sem DB/rede. Não editar migration aplicada.
