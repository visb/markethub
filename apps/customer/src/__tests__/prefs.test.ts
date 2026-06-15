jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

import * as SecureStore from "expo-secure-store";
import {
  getFulfillmentMode,
  getRadiusKm,
  RADIUS_DEFAULT,
  RADIUS_MAX,
  RADIUS_MIN,
} from "../prefs";

const getItem = SecureStore.getItemAsync as jest.Mock;

/**
 * C21: preferências locais (S6.4). getRadiusKm clampa no [MIN,MAX] e cai no
 * default quando vazio/ inválido; getFulfillmentMode default = deliver.
 */
describe("getRadiusKm", () => {
  beforeEach(() => jest.clearAllMocks());

  it("clampa abaixo do mínimo", async () => {
    getItem.mockResolvedValue("2");
    expect(await getRadiusKm()).toBe(RADIUS_MIN);
  });

  it("clampa acima do máximo", async () => {
    getItem.mockResolvedValue("99");
    expect(await getRadiusKm()).toBe(RADIUS_MAX);
  });

  it("mantém valor dentro da faixa", async () => {
    getItem.mockResolvedValue("13");
    expect(await getRadiusKm()).toBe(13);
  });

  it("default quando não há valor salvo", async () => {
    getItem.mockResolvedValue(null);
    expect(await getRadiusKm()).toBe(RADIUS_DEFAULT);
  });

  it("default quando o valor é inválido", async () => {
    getItem.mockResolvedValue("abc");
    expect(await getRadiusKm()).toBe(RADIUS_DEFAULT);
  });
});

describe("getFulfillmentMode", () => {
  beforeEach(() => jest.clearAllMocks());

  it("retorna pickup quando salvo", async () => {
    getItem.mockResolvedValue("pickup");
    expect(await getFulfillmentMode()).toBe("pickup");
  });

  it("default = deliver quando vazio", async () => {
    getItem.mockResolvedValue(null);
    expect(await getFulfillmentMode()).toBe("deliver");
  });
});
