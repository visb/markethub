import type { GeocodingProvider } from "./geocoding-provider.interface";
import { GeocodingService } from "./geocoding.service";

/** Story 76: a fachada só delega o reverso ao provider injetado. */
describe("GeocodingService.reverseGeocode", () => {
  it("delega lat/lng ao provider e devolve o resultado", async () => {
    const addr = {
      street: "Rua X",
      number: "1",
      district: "Centro",
      city: "Curitiba",
      state: "PR",
      zipCode: "80000-000",
    };
    const reverseGeocode = jest.fn().mockResolvedValue(addr);
    const service = new GeocodingService({ reverseGeocode } as unknown as GeocodingProvider);
    await expect(service.reverseGeocode(-25.43, -49.27)).resolves.toEqual(addr);
    expect(reverseGeocode).toHaveBeenCalledWith(-25.43, -49.27);
  });
});
