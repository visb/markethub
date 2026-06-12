import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PaymentService } from "./payment.service";

@Roles("customer")
@Controller("orders")
export class PaymentController {
  constructor(private readonly payment: PaymentService) {}

  /** Cria/retorna a cobrança PIX do pedido. */
  @Post(":id/pay")
  pay(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.payment.createPixForOrder(user.id, id);
  }

  /** Status do pagamento (polling até paid/expired). */
  @Get(":id/payment")
  status(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.payment.status(user.id, id);
  }

  /** Dev: simula pagamento (apenas provider mock). */
  @Post(":id/mock-pay")
  mockPay(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.payment.mockPay(user.id, id);
  }
}

@Public()
@Controller("webhooks")
export class PaymentWebhookController {
  constructor(private readonly payment: PaymentService) {}

  @Post("pix")
  webhook(@Body() body: unknown, @Headers("x-hub-signature") signature?: string) {
    return this.payment.handleWebhook(body, signature);
  }
}
