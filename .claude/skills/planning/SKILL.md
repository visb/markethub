---
name: planning
description: Conduz uma sessão de sprint planning a partir de stories/BACKLOG.md — percorre os itens um a um, refina cada um interativamente com o usuário (escopo, decisões, dependências) e, ao fechar cada item, escreve e commita a story via convenções da skill issue. Remove o item refinado do BACKLOG. NÃO implementa, NÃO cria branch. Use quando o usuário invocar /planning ou pedir para "fazer um planning", "refinar o backlog", "planejar a sprint", "rodar um sprint planning".
---

# /planning — sessão de sprint planning

Skill invocável via `/planning`. Funciona como um **facilitador de sprint planning**: lê
`stories/BACKLOG.md`, percorre os itens **um a um**, **refina cada um conversando com o usuário**
e, ao fechar o item, escreve a story e commita — reusando as convenções da skill
[`issue`](../issue/SKILL.md). À medida que refina, **remove o item do BACKLOG**.

> **Esta skill NÃO implementa as stories.** Só refina e escreve os `.md`. Codar é passo manual
> separado, em branch própria (ver `markethub-workflow`).

Diferença para o `/issue`: `issue` cria **uma** story sob demanda. `planning` é uma **sessão**
que percorre o backlog inteiro, item a item, interativa, até esvaziar (ou até o usuário parar).

Argumento opcional filtra o tema (`/planning rastreio` → só itens que casam). Sem argumento,
percorre o BACKLOG inteiro.

## Modo auto (auto-aprovação)

Flags `auto` / `--auto` / `--yes` (ex: `/planning auto`, `/planning rastreio --yes`) ligam o
**modo auto**: a sessão **não pede revisão nem confirmação** antes de commitar cada story.

No modo auto:

- **Não mostrar a story para aprovação** nem esperar "ok" — escrever e commitar direto.
- **Não fazer perguntas** de refino. Para cada ambiguidade ou trade-off, **assumir o default
  recomendado** (a opção que seria marcada "Recomendado") e **registrar a decisão tomada** na
  seção **Context** da story (deixar explícito que foi default automático, para o usuário rever
  depois se quiser).
- Percorrer todos os itens da pauta de ponta a ponta sem parar, um commit por story.
- Ao fim, **resumir** as stories criadas (faixa NN–MM) e listar as decisões que foram assumidas
  por default, para o usuário ter visibilidade.

Sem essas flags, vale o fluxo interativo padrão (refina conversando + confirma antes de commitar).

## Mapeamento

- **1 sub-item numerado do BACKLOG = 1 story.**
- O **título de topo** do bloco (ex: `app customer, tela /track/:id`) é contexto compartilhado —
  entra na seção **Context** das stories daquele bloco.
- Dependências entre itens: registrar na seção **Context** (ex: "depende da story NN").

## Convenções herdadas da skill `issue` (respeitar à risca)

- Stories novas em `stories/NN-slug-em-kebab.md` (flat na raiz de `stories/`), numeração
  sequencial crescente, zero-pad mínimo de dois dígitos (a partir de 100, três).
- **Descobrir o próximo NN:** varrer **só** `stories/*.md` na raiz (flat), pegar o maior `NN`,
  somar 1. Se não houver nenhuma story flat, começar em `01`. Stories legadas em `phase-*/SN.N` e
  `stories/done/` **não** contam. Incrementar a cada story criada na sessão.
- Formato: título `# Plan: ...`, seções **Context** (o *porquê* + decisões travadas +
  dependências), **Desenho**, **Validação** (testes/builds que a implementação vai exigir),
  **Fora de escopo**.
- **Validação obrigatória com gate de cobertura.** Toda story refinada nesta sessão SEMPRE traz a
  Validação no padrão definido em `issue/SKILL.md` → "Validação e gate de cobertura": testes
  específicos por camada tocada, casos a cobrir, e o **gate** "código novo sem teste não fecha a
  story" (`pnpm --filter @markethub/api test:coverage` + `pnpm test:coverage` dos apps tocados;
  sem `skip`/`only`/`xfail` injustificado). Adaptar ao escopo (frontend-only vs backend). Nenhuma
  story sai da sessão sem isso — vale inclusive no modo auto.
- Slug em kebab-case curto.
- Commits seguem o CLAUDE.md (Conventional Commits pt-BR). Co-author: o modelo corrente
  (o harness injeta o rodapé correto; não cravar nome de modelo).

## Fluxo da sessão

### 1. Abrir a sessão

- Ler `stories/BACKLOG.md` e fatiar em blocos (título de topo) + itens numerados.
- Aplicar filtro do argumento, se houver.
- Se vazio (ou nada casa o filtro), avisar e **parar**.
- Descobrir o NN inicial (scan de `stories/*.md` flat, maior + 1; ou `01` se não houver).
- Apresentar a **pauta**: lista dos itens que serão refinados, na ordem. Começar pelo primeiro.

### 2. Refinar item a item (o coração do planning)

Para **cada** item, em sequência:

1. Mostrar o texto cru do item + o contexto do bloco.
2. **Refinar conversando** — fazer só as perguntas que mudam o resultado: escopo ambíguo,
   decisão de produto, trade-off, dependência de outra story. Propor defaults; não interrogar à toa.
3. Capturar o **porquê** e as **decisões travadas** — é o que o git diff não guarda.
4. Redigir a story `stories/NN-slug.md` no formato acima.
5. **Mostrar a story e confirmar** com o usuário antes de commitar.
6. Ao aprovar → ir ao passo 3 (commit). Se o usuário quiser ajustar, iterar antes de commitar.

### 3. Fechar cada story (commit por item — decisão travada)

Assim que a story é aprovada:

- Editar `stories/BACKLOG.md` removendo **aquele item** (e o título de topo, se foi o último do bloco).
- `git add` do `stories/NN-slug.md` criado **e** do `stories/BACKLOG.md`.
- `git commit -m "docs(stories): plano da story NN — <título>"` direto na **main**.
- **NUNCA criar branch. Não push automático** (só se o usuário pedir).
- Cada story tem **seu próprio commit** — dá pra parar a sessão a qualquer momento sem perder trabalho.

### 4. Avançar / encerrar

- Após commitar, ir ao próximo item da pauta (voltar ao passo 2).
- O usuário pode **encerrar a sessão a qualquer momento** ("para", "chega") — respeitar e parar.
- Ao fim (pauta esgotada ou pedido de parar): resumir as stories criadas (faixa NN–MM) e o estado
  do BACKLOG.
- **PARAR AQUI.** Não criar branch, não implementar, não rodar testes, não mergear.

## Proibido

- **Implementar as stories** — só refina e escreve os planos.
- **Criar branch** — vai direto na main.
- Abrir PR ou mergear.
- Push sem pedido explícito.
- Refinar item sem confirmar a story antes de commitar — **exceto no modo auto** (ver acima).
- Pular o refino interativo e despejar stories em lote — isso é o oposto de um planning.
- Continuar para qualquer trabalho além de refinar, escrever os `.md`, limpar o BACKLOG e commitar.
