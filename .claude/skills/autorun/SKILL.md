---
name: autorun
description: Inicia e conduz um run autônomo de implementação de stories no monorepo MarketHub — encapsula o protocolo de stories/AUTORUN.md num /loop de intervalo fixo, dispara o agent markethub-implementer por unidade, mergeia na main e mantém o ledger (PROGRESS.md). Use quando o usuário invocar /autorun ou pedir para "rodar o autorun", "executar a rodada de stories autônoma", "implementar as stories NN..MM sozinho". NÃO faz push, NÃO abre PR, NÃO pergunta nada durante o run. Único mecanismo go-forward (substitui o schtasks/run-sweep.ps1 do phase-7).
---

# /autorun — run autônomo de stories

Skill invocável via `/autorun`. Encapsula o protocolo **`stories/AUTORUN.md`** (fonte de verdade do
"como"): monta a config da rodada, inicia um `/loop` de intervalo fixo e, a cada disparo, dispara o
agent `markethub-implementer` por unidade, mergeia na main e atualiza o ledger. **Não** codifica no
próprio contexto, **não** dá push, **não** abre PR, **não** pergunta nada durante o run.

> Substitui o mecanismo antigo de Windows Task Scheduler (`phase-7-quality/run-sweep.ps1`, aposentado).
> O `/loop` sobrevive ao limite de sessão pelo próprio harness — sem schtasks, lock ou watchdog.
>
> **Limitação conhecida (2026-07-18):** ao bater o limite de sessão, o CLI atual exibe um prompt
> interativo ("prosseguir com extra usage / aguardar reset") que **bloqueia a fila** — os disparos do
> loop ficam enfileirados até um humano interagir (1 tecla). Não há setting/flag documentado para
> auto-retomar. Para run realmente unattended atravessando o reset: estar presente no horário do
> reset, ou usar `/schedule` (cloud), ou créditos de extra usage (`/usage-credits`).

## Argumento

`/autorun <faixa/tema>` — ex.: `/autorun 19 20 21`, `/autorun rastreio`, `/autorun stories/PROGRESS.md`.
Define quais unidades entram na rodada. Sem argumento: usar o ledger ativo (`stories/PROGRESS.md`) se
houver rodada aberta; senão, **levantar a faixa com o usuário ANTES de iniciar o loop** (esta é a
única interação permitida — depois que o loop arranca, é autônomo).

## Passo 1 — preparar a rodada (interativo, antes do loop)

1. Identificar as unidades: ler `stories/NN-*.md` da faixa pedida (ou o tema → casar stories) e a
   ordem/dependências. Confirmar com o usuário se ambíguo.
2. **Garantir o ledger** `stories/PROGRESS.md` com o cabeçalho de Config da rodada (schema em
   `AUTORUN.md` → "Config da rodada"): tema, ordem, branch base, deps rígidas, cuidados da rodada, e a
   tabela `| # | Título | Dep | Status |` com tudo `todo`. Commitar o ledger
   (`docs(stories): abre rodada autorun <tema>`).
3. **Bootstrap de serviços** (AUTORUN "Bootstrap"): `pnpm infra:up`, prisma generate / builds de
   contrato conforme a rodada, API/app web em background só se o e2e exigir.

## Passo 2 — iniciar o loop (colar e sair)

Iniciar com `/loop` **intervalo fixo** (não auto-pacing) — o harness redispara sozinho, sobrevive ao
limite de sessão. Colar (ajustar faixa/ordem):

```
/loop 30m Modo autônomo. Siga stories/AUTORUN.md à risca, sem me perguntar nada. A cada disparo: releia stories/PROGRESS.md + git log e continue da próxima unidade NÃO concluída na ordem da rodada. Se a sessão estiver no limite, não faça nada e aguarde o próximo disparo. Para cada unidade, dispare o agent markethub-implementer (plano + branch); ao receber recibo OK e suíte verde, merge --no-ff na main + arquive em done/ e siga; senão registre BLOQUEADO/PARCIAL no ledger. Dep externa sem credencial: implementar atrás de interface com mocks, marcar PENDENTE-MANUAL, seguir. Sem push, sem PR. Quando todas estiverem done ou blocked, escreva o resumo final em PROGRESS.md e encerre o loop.
```

## Passo 3 — a cada disparo (o que a skill/loop executa)

Seguir `AUTORUN.md` → "A cada disparo do loop":
1. Reler ledger + `git log`; pular unidades já feitas.
2. Limite de sessão → encerrar o turno sem ação (o loop retoma após o reset).
3. Senão: próxima unidade na ordem → `Agent` (`markethub-implementer`) com plano + branch → recibo:
   OK+verde ⇒ merge na main + arquivar; falha ⇒ `blocked`/PARCIAL no ledger. Várias por turno se
   houver orçamento.
4. Salvar estado: ledger + tudo commitado (cada unidade = checkpoint).

## Encerrar

Todas as unidades `done`/`blocked` → resumo final no ledger e **encerrar o loop** (não reagendar).

## Proibido

O mesmo de `AUTORUN.md`: push · PR · perguntar durante o run · merge com suíte vermelha · inventar
segredo · chamar API real · editar migration aplicada. A skill só orquestra; quem codifica é o
`markethub-implementer`.
