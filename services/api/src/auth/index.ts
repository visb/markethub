/**
 * API pública do contexto identity/auth (story 47) — o que outros contextos
 * podem consumir: decorators de rota, guards e tipos do usuário autenticado.
 * Internals (services, strategies, DTOs) ficam fora; DI do módulo via
 * auth.module direto.
 */
export * from "./auth.types";
export * from "./decorators/current-user.decorator";
export * from "./decorators/public.decorator";
export * from "./decorators/roles.decorator";
export * from "./guards/jwt-auth.guard";
export * from "./guards/optional-jwt-auth.guard";
export * from "./guards/roles.guard";
