/**
 * ESLint do backend — config raiz + fronteiras de contexto (story 47).
 *
 * O monolito é MODULAR: os módulos Nest de `src/` se agrupam em bounded
 * contexts, e a comunicação cross-context é restrita a:
 *   (a) API pública do contexto alvo — barrel `src/<módulo>/index.ts` ou um
 *       `*.module.ts` (wiring de DI) de um contexto PERMITIDO na matriz abaixo;
 *   (b) evento de domínio via outbox (stories 45/46).
 * Deep import de internals de outro contexto e dependência entre contextos fora
 * da matriz são erro de lint (regra local `markethub/context-boundaries`, ver
 * eslint.boundaries.mjs).
 */
import rootConfig from "../../eslint.config.mjs";
import boundaries from "./eslint.boundaries.mjs";

/**
 * Mapa pasta de src/ → bounded context. Pasta nova em src/ TEM que entrar aqui
 * (a regra reprova pasta não mapeada).
 */
const CONTEXTS = {
  // Catálogo: dedupe/enriquecimento de produtos + ingestão ERP.
  catalog: ["catalog", "enrichment", "erp"],
  // Fulfillment: pedido → separação → entrega (own-store) + agendamento.
  fulfillment: ["marketplace", "picking", "driver", "scheduling"],
  payment: ["payment"],
  identity: ["auth", "users"],
  merchant: ["merchant"],
  admin: ["admin"],
  // Engajamento do cliente: avaliações/gorjetas, favoritos, seguir loja.
  engagement: ["reviews", "favorites", "store-follows"],
  // Suporte: infra de plataforma com fachada própria (eventos, webhooks de
  // integração, push, geocoding, storage, filas, health).
  support: ["events", "integration", "notifications", "geocoding", "storage", "queue", "health"],
  // Kernel compartilhado: pode ser importado fundo por qualquer contexto.
  shared: ["shared", "common", "config", "prisma"],
};

/**
 * Matriz de dependência síncrona (DI) entre contextos: quem pode importar quem
 * (sempre via barrel/*.module). O que não está aqui se comunica por EVENTO de
 * domínio (outbox) — não adicionar par novo sem discutir a direção.
 */
const ALLOWED_DEPENDENCIES = {
  // Identity (guards/decorators/tipos de auth) e support (push, storage,
  // geocoding, outbox, webhooks) são consumíveis por qualquer contexto.
  "*": ["identity", "support"],
  // Handlers de evento/relay (events/) despacham PARA os contextos e a
  // integration usa os connectors do catálogo — o support é o "hub" do bus.
  support: ["*"],
  // Dashboard admin agrega avaliações (leitura). Story 67: o suporte delega o
  // cancelamento admin do pedido ao dono do agregado (marketplace/fulfillment)
  // via barrel público (OrdersService.adminCancel) — mesma direção do merchant.
  admin: ["engagement", "fulfillment"],
  // Catálogo marca lojas seguidas na vitrine (leitura).
  catalog: ["engagement"],
  // Gorjetas (tips) cobram via PaymentProvider.
  engagement: ["payment"],
  // O app merchant delega ao dono do agregado (marketplace/fulfillment) o
  // cancelamento de sub-pedido (story 54) — operação de escrita no Order/
  // OrderGroup que só o marketplace pode fazer (muta o agregado + emite
  // `order.group_canceled` no outbox). Via barrel público (OrdersService).
  // Vitrine/resposta de avaliações (story 56): o merchant resolve escopo/
  // capability e delega o acesso ao model Review ao engagement (barrel).
  merchant: ["fulfillment", "engagement"],
};

/**
 * Allow-list HERDADA (story 47) — violações pré-existentes que exigem cirurgia
 * grande, vedadas para código NOVO. Cada entrada tem motivo + follow-up; drenar
 * em story futura. Não adicionar entrada sem justificativa explícita no PR.
 *
 * Resto do ciclo payment ↔ fulfillment (herdado): o fluxo de pagamento
 * consulta/avança o pedido de forma síncrona (payment → marketplace). O lado 2
 * (fulfillment → payment/refund) foi DRENADO na story 48 — o estorno de
 * cancelamento e de shortfall virou handler dos eventos `order.canceled` /
 * `picking.done`. Quebrar o que sobrou = extrair fachada de "order status" —
 * follow-up dedicado (ver stories/ROADMAP.md, trilha event-driven).
 */
const INHERITED_ALLOW = [
  // payment → fulfillment (lado 1 do ciclo)
  "payment/payment.module -> marketplace/marketplace.module",
  "payment/payment.service -> marketplace/orders.service",
];

export default [
  ...rootConfig,
  {
    files: ["src/**/*.ts"],
    plugins: { markethub: boundaries },
    rules: {
      "markethub/context-boundaries": [
        "error",
        {
          contexts: CONTEXTS,
          sharedContexts: ["shared"],
          allowedDependencies: ALLOWED_DEPENDENCIES,
          allow: INHERITED_ALLOW,
        },
      ],
    },
  },
];
