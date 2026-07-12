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
| 50 | push no device via Expo Push Service (customer/picker/driver) | — | done |
| 51 | rastreio de entrega ao vivo (driver → customer) | — | done |
| 52 | horário de funcionamento ponta-a-ponta | — | done |
| 53 | cupons — gestão admin (globais) + merchant (rede) | — | done |
| 54 | merchant — detalhe do pedido, cancelamento por grupo, alerta | — | done |
| 55 | merchant — gestão de slots de agendamento | — | done |
| 56 | reviews — resposta do lojista + vitrine pública | — | done |
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

[OK] 50 — testes: api 1018/1018, customer 208/208, picker 86/86, driver 92/92 — commit: 4e61a30 — merge na main + arquivada — 2026-07-11 — PENDENTE-MANUAL: validação em device físico real (Expo Push + projectId) só em runtime com aparelho.
[OK] 51 — testes: api 1046/1046, api-client 54/54, driver 117/117, customer 224/224 — commit: 23d13b7 — merge: 59ee65f — 2026-07-11 — PENDENTE-MANUAL: emissão de posição com app em background/tela bloqueada em device Android físico (device layer atrás de mock nos testes).
[OK] 52 — testes: api 1091/1091, merchant 189/189, customer 233/233, api-client 54/54 — merge: f7bcb97 — arquivada em done/ — 2026-07-11 — migration story52_store_closures não aplicada em runtime (testes Jest unit/mock); PENDENTE-MANUAL: `prisma:migrate deploy` no ambiente real.
[OK] 53 — testes: api 1147/1147, merchant 213/213, admin 139/139, api-client 54/54 — merge: f2d01cc — arquivada em done/ — 2026-07-11 — sem migration (model Coupon já existia); admin app ganhou React Query/rhf/zod só na tela nova (legado intacto).
[OK] 54 — testes: api 1190/1190, merchant 226/226, api-client 56/56 — merge: f13f355 — arquivada em done/ — 2026-07-11 — migration enum group_canceled não aplicada (Docker down; unit/mock). PENDENTE-MANUAL: `prisma:migrate deploy`. DÉBITO CONHECIDO: `@markethub/api-client test:coverage` perFile 98% vermelho — baseline da story 52 (métodos store-hours sem teste em client.test.ts, ~linhas 252-272/381-424); diff da 54 está 100% coberto (subiu p/ 91.77%). Drenar antes de fechar a rodada (candidato p/ story 72/cleanup).
[OK] 55 — testes: api 1193/1193, api-client 57/57, merchant 268/268 — merge: 1c6a5e7 — arquivada em done/ — 2026-07-11 — sem migration (DeliverySlot já existia). Nota: `slots.manage` na matriz do front (permissions.ts); backend store/slots faz upsert (sem 409 real), gerador em lote trata 409→pulado defensivo client-side. Endpoints scheduling têm @Roles(merchant,admin) — gerente pode não passar no guard de rota (pré-existente, fora de escopo).
[OK] 56 — testes: api 1217/1217, customer 244/244, merchant 281/281, api-client 58/58 — merge: 18c8dd1 — arquivada em done/ — 2026-07-12 — migration story56_review_reply autorada, NÃO aplicada (Postgres P1001 localhost:5433). PENDENTE-MANUAL: `prisma migrate deploy`. Débito api-client perFile não piorado (3 métodos novos 100%). Dep 56→68 satisfeita.
