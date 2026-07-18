import { Type } from "class-transformer";
import { IsNumber, Max, Min } from "class-validator";

/**
 * Query de geocodificação reversa (story 76): `GET /geocoding/reverse?lat=&lng=`.
 * `@Type(Number)` converte a query string antes de validar; `@Min/@Max` garantem
 * a faixa lat/lng válida (rejeita coords fora do globo).
 */
export class ReverseGeocodeQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
