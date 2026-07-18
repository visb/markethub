import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { SearchSuggestQueryDto } from "./search-suggest.dto";

/**
 * Story 82: o DTO de sugestões ganhou `lat`/`lng` opcionais (geo p/ a loja mais
 * próxima da rede). Valida: só `q` basta; lat/lng vêm como string da query e são
 * convertidos p/ número; termo curto e geo não numérico reprovam.
 */
describe("SearchSuggestQueryDto", () => {
  it("aceita apenas q (lat/lng opcionais)", () => {
    const dto = plainToInstance(SearchSuggestQueryDto, { q: "arr" });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.lat).toBeUndefined();
    expect(dto.lng).toBeUndefined();
  });

  it("converte lat/lng de string para número", () => {
    const dto = plainToInstance(SearchSuggestQueryDto, { q: "atac", lat: "-23.5", lng: "-46.6" });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.lat).toBe(-23.5);
    expect(dto.lng).toBe(-46.6);
  });

  it("rejeita q com menos de 2 caracteres", () => {
    const dto = plainToInstance(SearchSuggestQueryDto, { q: "a" });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it("rejeita lat não numérico", () => {
    const dto = plainToInstance(SearchSuggestQueryDto, { q: "atac", lat: "abc" });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
