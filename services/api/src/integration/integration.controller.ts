import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { IntegrationService } from "./integration.service";

class PutErpConfigDto {
  @IsString() @MinLength(1) connectorType!: string;
  @IsObject() connectorConfig!: Record<string, unknown>;
}

class CreateApiKeyDto {
  @IsString() @MinLength(1) name!: string;
}

class CreateWebhookDto {
  @IsString() @MinLength(1) url!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) events?: string[];
}

class UpdateWebhookDto {
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) events?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

/**
 * Rotas de integração do app merchant (story 09). Controller fino: valida DTO e
 * roteia; toda regra (e o owner-only) vive no IntegrationService. @Roles limita a
 * `merchant`/`admin`; o service ainda reforça owner-only por merchantId.
 */
@Roles("merchant", "admin")
@Controller("merchant/integration")
export class IntegrationController {
  constructor(private readonly integration: IntegrationService) {}

  private user(u: AuthUser) {
    return { id: u.id, roles: u.roles };
  }

  // ── ERP ──

  @Get("connector-types")
  connectorTypes() {
    return this.integration.connectorTypes();
  }

  @Get("erp")
  getErp(@CurrentUser() user: AuthUser) {
    return this.integration.getErpConfig(this.user(user));
  }

  @Put("erp")
  putErp(@CurrentUser() user: AuthUser, @Body() dto: PutErpConfigDto) {
    return this.integration.putErpConfig(this.user(user), dto);
  }

  // ── Api-keys ──

  @Get("api-keys")
  listApiKeys(@CurrentUser() user: AuthUser) {
    return this.integration.listApiKeys(this.user(user));
  }

  @Post("api-keys")
  createApiKey(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    return this.integration.createApiKey(this.user(user), dto.name);
  }

  @Delete("api-keys/:id")
  revokeApiKey(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.integration.revokeApiKey(this.user(user), id);
  }

  // ── Webhooks ──

  @Get("webhooks")
  listWebhooks(@CurrentUser() user: AuthUser) {
    return this.integration.listWebhooks(this.user(user));
  }

  @Post("webhooks")
  createWebhook(@CurrentUser() user: AuthUser, @Body() dto: CreateWebhookDto) {
    return this.integration.createWebhook(this.user(user), dto);
  }

  @Patch("webhooks/:id")
  updateWebhook(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.integration.updateWebhook(this.user(user), id, dto);
  }

  @Delete("webhooks/:id")
  deleteWebhook(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.integration.deleteWebhook(this.user(user), id);
  }

  @Post("webhooks/:id/test")
  testWebhook(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.integration.testWebhook(this.user(user), id);
  }
}
