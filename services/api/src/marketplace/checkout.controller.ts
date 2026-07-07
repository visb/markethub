import { Body, Controller, Post } from "@nestjs/common";
import type { DeliveryMethod, FulfillmentType } from "@prisma/client";
import { IsIn, IsOptional, IsString } from "class-validator";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { OrdersService } from "./orders.service";

class CheckoutDto {
  // entrega: obrigatório; retirada na loja: ignorado
  @IsOptional() @IsString() addressId?: string | null;
  @IsIn(["delivery", "pickup"]) fulfillment!: FulfillmentType;
  @IsOptional() @IsIn(["gate", "door"]) deliveryMethod?: DeliveryMethod;
  @IsOptional() @IsString() scheduledFrom?: string | null;
  @IsOptional() @IsString() scheduledTo?: string | null;
  // slot de capacidade escolhido (S5.3)
  @IsOptional() @IsString() deliverySlotId?: string | null;
}

@Roles("customer")
@Controller("checkout")
export class CheckoutController {
  constructor(private readonly orders: OrdersService) {}

  @Post("preview")
  preview(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.orders.preview(user.id, dto);
  }

  @Post()
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.orders.checkout(user.id, dto);
  }
}
