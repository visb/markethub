jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

import * as Location from "expo-location";
import { deviceAddress } from "../location";

const reqPerm = Location.requestForegroundPermissionsAsync as jest.Mock;
const getPos = Location.getCurrentPositionAsync as jest.Mock;
const revGeo = Location.reverseGeocodeAsync as jest.Mock;

/**
 * C21: endereço a partir do device (S6.2). Permissão negada → null; nome de
 * estado vira UF; região já em UF de 2 letras é preservada.
 */
describe("deviceAddress", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPos.mockResolvedValue({ coords: { latitude: -25.4, longitude: -49.2 } });
  });

  it("retorna null quando a permissão é negada", async () => {
    reqPerm.mockResolvedValue({ granted: false });
    expect(await deviceAddress()).toBeNull();
  });

  it("mapeia nome do estado para UF e preenche os campos", async () => {
    reqPerm.mockResolvedValue({ granted: true });
    revGeo.mockResolvedValue([
      { region: "Paraná", city: "Curitiba", street: "Rua A", streetNumber: "10", postalCode: "80000-000", district: "Centro" },
    ]);
    const addr = await deviceAddress();
    expect(addr).toMatchObject({
      state: "PR",
      city: "Curitiba",
      street: "Rua A",
      number: "10",
      latitude: -25.4,
      longitude: -49.2,
    });
  });

  it("preserva UF de 2 letras vinda do reverse geocode", async () => {
    reqPerm.mockResolvedValue({ granted: true });
    revGeo.mockResolvedValue([{ region: "sc", city: "Joinville" }]);
    const addr = await deviceAddress();
    expect(addr?.state).toBe("SC");
  });

  it("retorna null quando não há resultado de geocode", async () => {
    reqPerm.mockResolvedValue({ granted: true });
    revGeo.mockResolvedValue([]);
    expect(await deviceAddress()).toBeNull();
  });
});
