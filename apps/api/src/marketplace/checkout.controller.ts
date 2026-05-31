import { Body, Controller, Post } from "@nestjs/common";
import type { DeliveryMethod } from "@prisma/client";
import { IsIn, IsOptional, IsString } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { OrdersService } from "./orders.service";

class CheckoutDto {
  @IsString() addressId!: string;
  @IsIn(["gate", "door"]) deliveryMethod!: DeliveryMethod;
  @IsOptional() @IsString() scheduledFrom?: string | null;
  @IsOptional() @IsString() scheduledTo?: string | null;
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
