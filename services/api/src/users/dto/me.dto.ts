import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MinLength } from "class-validator";

/**
 * PATCH users/me (story 70) — parcial padrão do repo: campo ausente (undefined)
 * não toca; `phone: null` limpa. Telefone BR normalizado só-dígitos no DTO
 * (aceita "(41) 99999-1234") e validado com 10–11 dígitos (DDD + número).
 */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  // @IsOptional pula validação p/ undefined E null — null passa e limpa o campo.
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.replace(/\D/g, "") : value))
  @Matches(/^\d{10,11}$/, {
    message: "Telefone deve ter 10 a 11 dígitos (DDD + número)",
  })
  phone?: string | null;
}

/** POST users/me/password (story 70) — política da nova = mesma do registro (min 8). */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
