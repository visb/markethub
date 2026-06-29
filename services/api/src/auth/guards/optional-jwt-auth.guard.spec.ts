import { OptionalJwtAuthGuard } from "./optional-jwt-auth.guard";

/**
 * Story 34: o guard de auth opcional nunca lança — devolve o usuário quando a
 * estratégia JWT valida, e `undefined` (guest) quando não há token.
 */
describe("OptionalJwtAuthGuard", () => {
  const guard = new OptionalJwtAuthGuard();

  it("token válido → devolve o usuário", () => {
    const user = { id: "u1" };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it("sem usuário (token ausente/inválido) → undefined, sem lançar", () => {
    expect(guard.handleRequest(null, false)).toBeUndefined();
    expect(guard.handleRequest(new Error("expired"), undefined)).toBeUndefined();
  });
});
