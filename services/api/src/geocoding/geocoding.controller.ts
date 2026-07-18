import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "../auth";
import { ReverseGeocodeQueryDto } from "./dto/reverse-geocode.dto";
import type { ReverseGeocodeResult } from "./geocoding-provider.interface";
import { GeocodingService } from "./geocoding.service";

/**
 * Geocodificação reversa via backend (story 76): o app manda as coords do GPS e
 * recebe o endereço estruturado, com a chave do Google no servidor. Best-effort —
 * `null` quando não resolve (o app cai no preenchimento por CEP). Controller fino:
 * valida a query (DTO) e delega ao service.
 */
@Roles("customer")
@Controller("geocoding")
export class GeocodingController {
  constructor(private readonly geocoding: GeocodingService) {}

  @Get("reverse")
  reverse(@Query() query: ReverseGeocodeQueryDto): Promise<ReverseGeocodeResult | null> {
    return this.geocoding.reverseGeocode(query.lat, query.lng);
  }
}
