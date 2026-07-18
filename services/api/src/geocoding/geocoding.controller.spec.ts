import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ReverseGeocodeQueryDto } from "./dto/reverse-geocode.dto";
import { GeocodingController } from "./geocoding.controller";
import type { GeocodingService } from "./geocoding.service";

/**
 * Story 76: o endpoint `GET /geocoding/reverse` valida lat/lng (DTO) e delega ao
 * service, devolvendo o shape do contrato (`ReverseGeocodeResult | null`). O
 * provider é mockado — sem rede.
 */

function makeController(result: unknown = null) {
  const reverseGeocode = jest.fn().mockResolvedValue(result);
  const controller = new GeocodingController({ reverseGeocode } as unknown as GeocodingService);
  return { controller, reverseGeocode };
}

describe("GeocodingController.reverse", () => {
  it("delega lat/lng ao service e devolve o endereço no shape do contrato", async () => {
    const address = {
      street: "Rua das Flores",
      number: "100",
      district: "Centro",
      city: "Curitiba",
      state: "PR",
      zipCode: "80000-000",
    };
    const { controller, reverseGeocode } = makeController(address);
    const res = await controller.reverse({ lat: -25.43, lng: -49.27 });
    expect(reverseGeocode).toHaveBeenCalledWith(-25.43, -49.27);
    expect(res).toEqual(address);
    expect(res).toMatchObject({
      street: expect.anything(),
      number: expect.anything(),
      district: expect.anything(),
      city: expect.anything(),
      state: expect.anything(),
      zipCode: expect.anything(),
    });
  });

  it("propaga null quando o backend não resolve", async () => {
    const { controller } = makeController(null);
    await expect(controller.reverse({ lat: 0, lng: 0 })).resolves.toBeNull();
  });
});

describe("ReverseGeocodeQueryDto", () => {
  const build = (raw: Record<string, unknown>) =>
    validate(plainToInstance(ReverseGeocodeQueryDto, raw));

  it("converte query string em número e aceita coords válidas", async () => {
    const dto = plainToInstance(ReverseGeocodeQueryDto, { lat: "-25.43", lng: "-49.27" });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.lat).toBe(-25.43);
    expect(dto.lng).toBe(-49.27);
  });

  it("rejeita lat fora de [-90, 90]", async () => {
    const errors = await build({ lat: "120", lng: "-49" });
    expect(errors.some((e) => e.property === "lat")).toBe(true);
  });

  it("rejeita lng fora de [-180, 180]", async () => {
    const errors = await build({ lat: "-25", lng: "999" });
    expect(errors.some((e) => e.property === "lng")).toBe(true);
  });

  it("rejeita lat/lng não numéricos", async () => {
    const errors = await build({ lat: "abc", lng: "xyz" });
    expect(errors.some((e) => e.property === "lat")).toBe(true);
    expect(errors.some((e) => e.property === "lng")).toBe(true);
  });
});
