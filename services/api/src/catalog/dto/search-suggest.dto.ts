import { IsString, MinLength } from "class-validator";

/**
 * Query da rota de sugestões (`GET /search/suggest?q=`). O termo tem mínimo de 2
 * caracteres — abaixo disso o front nem dispara (hook com `enabled`), e o DTO
 * rejeita chamadas diretas com 400. O service ainda guarda defensivamente.
 */
export class SearchSuggestQueryDto {
  @IsString()
  @MinLength(2)
  q!: string;
}
