import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, MinLength } from "class-validator";

/**
 * Query da rota de sugestões (`GET /search/suggest?q=`). O termo tem mínimo de 2
 * caracteres — abaixo disso o front nem dispara (hook com `enabled`), e o DTO
 * rejeita chamadas diretas com 400. O service ainda guarda defensivamente.
 *
 * `lat`/`lng` são opcionais (story 82): quando presentes, a sugestão de mercado
 * escolhe a loja visível mais próxima da rede. `@Type(Number)` converte a query
 * string em número antes de validar.
 */
export class SearchSuggestQueryDto {
  @IsString()
  @MinLength(2)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}
