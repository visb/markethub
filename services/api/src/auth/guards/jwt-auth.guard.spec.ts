import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";

function context(): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe("JwtAuthGuard", () => {
  it("libera rota marcada com @Public sem autenticar", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    expect(guard.canActivate(context())).toBe(true);
  });

  it("consulta o metadata IS_PUBLIC_KEY no handler e na classe", () => {
    const getAllAndOverride = jest.fn().mockReturnValue(true);
    const guard = new JwtAuthGuard({ getAllAndOverride } as unknown as Reflector);
    guard.canActivate(context());
    expect(getAllAndOverride).toHaveBeenCalledWith(expect.anything(), [undefined, undefined]);
  });
});
