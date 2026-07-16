/**
 * API pública do módulo reviews / contexto engagement (story 47) — agregados de
 * avaliação para leitura (dashboard admin). reviews.service e tips.service são
 * internos. DI do módulo via reviews.module direto.
 */
export * from "./reviews-aggregate.service";
// Vitrine pública + gestão/resposta do lojista (story 56) — consumido pelo
// contexto merchant via barrel (delega o acesso ao model Review).
export * from "./reviews-management.service";
// Moderação admin (story 68): soft-hide reversível + filtro único de
// visibilidade (aplicado também nas agregações fora do contexto).
export * from "./reviews-moderation.service";
export * from "./review-visibility";
