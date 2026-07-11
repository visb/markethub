# Plan: picker — scanner de código de barras (GTIN) na separação

## Context

Picking real é **bipar produto na gôndola** — reduz erro de separação (produto parecido,
gramatura errada) e é mais rápido que procurar o item na lista. Hoje a tela de tarefa
(`task/[id]`) é 100% manual: o picker localiza o item na lista e toca "separado".

O catálogo é GTIN-first (enrichment via Cosmos/Bluesoft) — `Product.gtin` existe; o match
bip ↔ item é direto.

Decisões travadas (planning 2026-07-11, defaults do facilitador):

- `expo-camera` (`CameraView` com leitura de barcode — o expo-barcode-scanner foi absorvido
  por ele). EAN-13/EAN-8/UPC.
- Scanner é **atalho**, não obrigação: fluxo manual permanece intacto (produto sem GTIN,
  câmera negada, web).
- Bip em item `saleType=weight` **seleciona** o item e abre o input de gramas (peso vem da
  balança, não do código); `unit` marca separado com a quantidade pedida em 1 toque
  (ajustável).
- Scanner só no nativo; no web o botão não aparece.

## Desenho

### Backend

1. DTO dos itens da task (`usePickTask`): garantir `gtin` do produto em cada item (join
   simples; sem endpoint novo).

### Picker app

2. Dependência `expo-camera` + permissão de câmera (pedida no primeiro uso; negada → toast e
   segue manual).
3. `task/[id]`: botão flutuante/header "Escanear" (só native, só task em `picking`) → sheet
   com `CameraView` + overlay de mira.
4. Match do bip contra itens da task:
   - GTIN de item **pendente** `unit` → confirma separado (qty do pedido; toast com desfazer).
   - GTIN de item **pendente** `weight` → fecha o scanner, foca o input de gramas do item.
   - GTIN de item **já resolvido** → aviso "já separado".
   - GTIN **desconhecido** na task → erro sonoro/vibração + "produto não é deste pedido".
   Debounce entre leituras (mesmo código não dispara 2× em sequência).
5. Feedback: vibração curta no sucesso (`expo-haptics` se já disponível; senão `Vibration` do
   RN), contador "X de N separados" no header do scanner p/ bipar em sequência sem fechar.

## Validação

- Backend: spec do DTO com gtin. `pnpm --filter @markethub/api test`.
- Picker: testes do matcher (unit confirma, weight foca input, resolvido avisa, desconhecido
  erro, debounce) com CameraView mockado; permissão negada não quebra a tela; web não
  renderiza o botão. `pnpm --filter @markethub/picker test`.
- **Gate de cobertura:** código novo sem teste não fecha a story — `test:coverage` api +
  picker ≥ piso (80 global / 90 diff), sem `skip`/`only` injustificado.
- `pnpm typecheck` + `pnpm build`.
- Manual (registrar ao concluir): bipar EAN real em device físico.

## Fora de escopo

- Bip de GTIN desconhecido virar proposta de substituição (fluxo de substituir segue o
  autocomplete da story 03).
- Balança integrada / GTIN de peso variável (prefixo 2 — código embute peso): tratar como
  desconhecido por ora.
- Scanner no fluxo de conferência de entrega/handoff.
- Foto do produto na lista (outro item de UX, fora desta story).
