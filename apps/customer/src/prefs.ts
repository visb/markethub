import * as SecureStore from "expo-secure-store";

/** Preferências locais do app (S6.4): raio de busca e modo de recebimento. */
const RADIUS_KEY = "mh.search-radius-km";
const MODE_KEY = "mh.fulfillment-mode";

export const RADIUS_MIN = 5;
export const RADIUS_MAX = 25;
export const RADIUS_DEFAULT = 13;

export async function getRadiusKm(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(RADIUS_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, n));
  } catch {
    /* primeira execução */
  }
  return RADIUS_DEFAULT;
}

export async function setRadiusKm(km: number): Promise<void> {
  await SecureStore.setItemAsync(RADIUS_KEY, String(Math.round(km)));
}

export type FulfillmentMode = "deliver" | "pickup";

export async function getFulfillmentMode(): Promise<FulfillmentMode> {
  try {
    const raw = await SecureStore.getItemAsync(MODE_KEY);
    if (raw === "pickup") return "pickup";
  } catch {
    /* default */
  }
  return "deliver";
}

export async function setFulfillmentMode(mode: FulfillmentMode): Promise<void> {
  await SecureStore.setItemAsync(MODE_KEY, mode);
}
