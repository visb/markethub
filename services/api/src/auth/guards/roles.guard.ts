import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { RoleName } from "@prisma/client";
import type { AuthUser } from "../auth.types";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;

    const ok = user != null && required.some((role) => user.roles.includes(role));
    if (!ok) {
      throw new ForbiddenException({
        code: "FORBIDDEN_ROLE",
        message: `Requires one of roles: ${required.join(", ")}`,
      });
    }
    return true;
  }
}
