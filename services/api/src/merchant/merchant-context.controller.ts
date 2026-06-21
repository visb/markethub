import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { MerchantService } from "./merchant.service";

/**
 * Contexto de identidade do app merchant (story 07). Sem `@Roles` de classe:
 * managers (StoreStaff) podem não ter RoleName `merchant`, então a autorização
 * fina é resolvida no service (owner vs manager; 403 se nenhum). JWT global
 * (JwtAuthGuard) garante que o usuário está autenticado.
 */
@Controller("merchant")
export class MerchantContextController {
  constructor(private readonly merchant: MerchantService) {}

  @Get("context")
  context(@CurrentUser() user: AuthUser) {
    return this.merchant.getContext(user);
  }
}
