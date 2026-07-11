# PROGRESS — rodada AUTORUN (50–72: push, rastreio, merchant/driver/picker/admin, customer conta)

Ordem: 50 → 51 → 52 → 53 → 54 → 55 → 56 → 57 → 58 → 59 → 60 → 61 → 62 → 63 → 64 → 65 → 66 → 67 → 68 → 69 → 70 → 71 → 72
Branch base: main   |   Merge na main por unidade: sim (--no-ff)   |   Sem push, sem PR

Deps rígidas (se A bloquear, B da cadeia bloqueia — não pular B):
- 50 → 64 (infra de push do device)
- 52 → 57 (badge/validação loja fechada → pausa emergencial)
- 54 → 61 (cancelar grupo → problema na entrega)
- 56 → 68 (vitrine/endpoint público `hiddenAt` → moderação)
Cadeias independentes: 51 (rastreio), 53 (cupons), 55 (slots), 58 (config entrega), 59/60/62/63/65 (driver/picker), 66/67/69 (admin/merchant), 70/71/72 (customer/cleanup).

Cuidados da rodada:
- Migrations Prisma em 52, 56, 57, 58, 61, 62, 67, 68, 70 — nunca editar aplicada; nova sempre. `prisma:generate` antes do typecheck.
- Contratos `packages/types` + `api-client` (51, 52, 53, 55, 56) — rebuildar após mudar; reiniciar Metro dos apps mobile que consomem.
- Apps mobile Expo (customer/picker/driver) — React Query + rhf/zod obrigatório; `Controller` no RN.
- Deps externas de device: `expo-notifications` (50), `expo-camera` (63) — atrás de interface/mock nos testes; PENDENTE-MANUAL o que exige device/credencial real.
- Event-driven (outbox) já ativo — push assíncrono (49) é base do 50/64.
- Gate de cobertura: piso 80% global, diff ≥ 90%.

| #  | Título | Dep | Status |
|----|--------|-----|--------|
| 50 | push no device via Expo Push Service (customer/picker/driver) | — | todo |
| 51 | rastreio de entrega ao vivo (driver → customer) | — | todo |
| 52 | horário de funcionamento ponta-a-ponta | — | todo |
| 53 | cupons — gestão admin (globais) + merchant (rede) | — | todo |
| 54 | merchant — detalhe do pedido, cancelamento por grupo, alerta | — | todo |
| 55 | merchant — gestão de slots de agendamento | — | todo |
| 56 | reviews — resposta do lojista + vitrine pública | — | todo |
| 57 | merchant — pausar loja + toggle de disponibilidade | 52 | todo |
| 58 | config de entrega por loja — taxa, mínimo, raio | — | todo |
| 59 | driver — mapa da entrega + navegação externa | — | todo |
| 60 | driver — ganhos (gorjetas) e histórico | — | todo |
| 61 | driver — problema na entrega (falha, retorno, decisão da loja) | 54 | todo |
| 62 | driver — turno on/off (disponibilidade) | — | todo |
| 63 | picker — scanner de código de barras (GTIN) | — | todo |
| 64 | substituição — push ao cliente + feedback ao picker | 50 | todo |
| 65 | picker — métricas próprias + visão por colaborador | — | todo |
| 66 | admin — dashboard real (KPIs + alertas) | — | todo |
| 67 | admin — detalhe profundo do pedido, timeline, suporte | — | todo |
| 68 | admin — moderação de avaliações | 56 | todo |
| 69 | admin — suspensão de merchant propagada | — | todo |
| 70 | customer — conta/perfil (editar dados + senha) | — | todo |
| 71 | customer — livro de endereços | — | todo |
| 72 | merchant — remover Placeholder.tsx morto | — | todo |

## Log
