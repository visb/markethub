import { IsOptional, IsString, MaxLength } from "class-validator";

/** Cancelamento de sub-pedido (story 54): motivo opcional (auditoria/UX). */
export class CancelOrderGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
