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
| 57 | merchant — pausar loja + toggle de disponibilidade | 52 | done |
| 58 | config de entrega por loja — taxa, mínimo, raio | — | done |
| 59 | driver — mapa da entrega + navegação externa | — | done |
| 60 | driver — ganhos (gorjetas) e histórico | — | done |
| 61 | driver — problema na entrega (falha, retorno, decisão da loja) | 54 | done |
| 62 | driver — turno on/off (disponibilidade) | — | done |
| 63 | picker — scanner de código de barras (GTIN) | — | done |
| 64 | substituição — push ao cliente + feedback ao picker | 50 | done |
| 65 | picker — métricas próprias + visão por colaborador | — | done |
| 66 | admin — dashboard real (KPIs + alertas) | — | done |
| 67 | admin — detalhe profundo do pedido, timeline, suporte | — | done |
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
[OK] 57 — testes: api 1250/1250, customer 247/247, merchant 293/293, api-client 59/59 — merge: 4c0a308 — arquivada em done/ — 2026-07-12 — migration story57_store_paused_at autorada, NÃO aplicada (Docker down). PENDENTE-MANUAL: `prisma migrate deploy`. Dep 52→57 satisfeita. STORE_PAUSED bloqueia imediato E agendado (vs STORE_CLOSED). Débito api-client perFile não piorado.
[OK] 58 — testes: api 1260/1260, merchant 298/298, customer 251/251, api-client 59/59 — merge: 7f1d51b — arquivada em done/ — 2026-07-12 — migration story58_store_delivery_config autorada, NÃO aplicada (Docker down). PENDENTE-MANUAL: `prisma migrate deploy`. haversineKm reaproveitado de common/geo.ts. Mínimo só nível loja (rede não define); telas customer cart/checkout/store seguem legado useState (só UI derivada, sem fetch novo).
[OK] 59 — testes: ui 35/35, customer 245/245, driver 127/127, api 1264/1264 — merge: a860f16 — arquivada em done/ — 2026-07-12 — sem migration (join de coords). DESVIO ACEITO: moveu DeliveryMap (mapa 3-marcadores loja/cliente/posição) p/ packages/ui em vez do StoreMap/explore (acoplado a marketplace, semanticamente errado p/ driver); StoreMap segue no customer intacto. StoreMap→packages/ui é follow-up opcional. api-client não tocado.
[OK] 60 — testes: api 1281/1281, driver 145/145, api-client 61/61 — merge: b65c402 — arquivada em done/ — 2026-07-12 — sem migration (Tip/Delivery já existem). Tip/Delivery via Prisma kernel (sem cross-context). Pending filtra por createdAt, paid por paidAt; histórico ordena updatedAt desc (Delivery não tem canceledAt).
[OK] 61 — testes: api 1307/1307, driver 154/154, picker 101/101, merchant 312/312, api-client 61/61 — merge: 62feeba — arquivada em done/ — 2026-07-12 — 1ª tentativa cortada por limite de sessão (parcial no working tree); retomei o mesmo agente via SendMessage → concluiu. migration story61_delivery_failed autorada, NÃO aplicada. PENDENTE-MANUAL: `prisma migrate deploy`. Dep 54→61 satisfeita; invariante da 54 aceita grupo com delivery failed (estoque NÃO volta, doc em BUSINESS_RULES). retry: failed→unassigned + grupo volta a ready_for_pickup. driver ganhou rhf+zod. Débito api-client perFile não piorado (2 métodos novos 100%).
[OK] 62 — testes: api 1327/1327, driver 163/163, picker 106/106, api-client 63/63 — merge: e465de2 — arquivada em done/ — 2026-07-12 — migration story62_driver_available_at autorada, NÃO aplicada. PENDENTE-MANUAL: `prisma migrate deploy`. driverAvailableAt global no User; logout limpa turno (só role driver); guards DRIVER_UNAVAILABLE em assign+accept. Débito api-client perFile não piorado.
[OK] 63 — testes: api 1330/1330, picker 138/138 — merge: 0531d23 — arquivada em done/ — 2026-07-12 — sem migration (reusa OrderItem.gtinSnapshot já no include). expo-camera ~16.0.18 (repinado p/ Expo SDK 52; latest vinha ^57). CameraView mockado nos testes. matcher puro em lib/scanMatcher. "Desfazer" via commit adiado ~3.5s client-side (sem endpoint reset). PENDENTE-MANUAL: bipar EAN real em device físico com câmera. api-client não tocado.
[OK] 64 — testes: api 1333/1333, picker 146/146, api-client 63/63 — commit: 0b668cf — merge na main + arquivada — 2026-07-16 — sem migration; approve/reject/timeout convergem em resolve() (emit cobre os 3); dep 50→64 satisfeita. Retomou parcial da sessão anterior.
[OK] 65 — testes: api 1352/1352, picker 156/156, merchant 316/316, types 16/16, api-client 64/64 — commit: 1854308 — merge na main + arquivada — 2026-07-16 — sem migration; computePickerMetrics no picking, reusado pelo merchant via barrel. DÉBITO PRÉ-EXISTENTE confirmado: packages/types test:coverage vermelho na main (68.85%<80; coupons/picking-events/slots/store-hours/delivery-events sem teste) — drenar antes de fechar a rodada.
[OK] 66 — testes: api 1367/1367, admin 147/147 — commit: ff2a685 — merge na main + arquivada — 2026-07-16 — sem migration; tipagem local no admin (padrão vizinhas, sem rebuild packages); janela SP offset fixo -03:00; thresholds em constantes exportadas.
[OK] 67 — testes: api 1412/1412, admin 166/166 — commit: 2b1f2bc — merge na main + arquivada — 2026-07-16 — 1ª tentativa cortada por limite de sessão; retomado via SendMessage → concluiu. Migration story67_manual_refund autorada, NÃO aplicada (Docker down). PENDENTE-MANUAL: `prisma migrate deploy`. Refund manual durável via evento order.refund_requested (outbox, idempotente por componentId); adminCancel via barrel (matriz admin→fulfillment).
