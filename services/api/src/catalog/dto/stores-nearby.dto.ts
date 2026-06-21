import { Type } from "class-transformer";
import { IsNumber, Max, Min } from "class-validator";

/**
 * Bounding box do viewport do mapa (explore). Os 4 cantos são obrigatórios;
 * `@Type(Number)` converte a query string em número antes de validar e
 * `@Min/@Max` garantem que estão na faixa lat/lng válida.
 * A ordem (north ≥ south, east ≥ west) é checada no controller → INVALID_BOUNDS.
 */
export class StoresNearbyQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  north!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  south!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  east!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  west!: number;
}
