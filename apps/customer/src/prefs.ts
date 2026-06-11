import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/** Preferências locais do app (S6.4): raio de busca e modo de recebimento. */
const RADIUS_KEY = "mh.search-radius-km";
const MODE_KEY = "mh.fulfillment-mode";

// SecureStore não existe no browser → localStorage no web, igual token-store.ts.
const isWeb = Platform.OS === "web";
async function storeGet(key: string): Promise<string | null> {
  if (isWeb) return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  return SecureStore.getItemAsync(key);
}
async function storeSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export const RADIUS_MIN = 5;
export const RADIUS_MAX = 25;
export const RADIUS_DEFAULT = 13;

export async function getRadiusKm(): Promise<number> {
  try {
    const raw = await storeGet(RADIUS_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, n));
  } catch {
    /* primeira execução */
  }
  return RADIUS_DEFAULT;
}

export async function setRadiusKm(km: number): Promise<void> {
  await storeSet(RADIUS_KEY, String(Math.round(km)));
}

export type FulfillmentMode = "deliver" | "pickup";

export async function getFulfillmentMode(): Promise<FulfillmentMode> {
  try {
    const raw = await storeGet(MODE_KEY);
    if (raw === "pickup") return "pickup";
  } catch {
    /* default */
  }
  return "deliver";
}

export async function setFulfillmentMode(mode: FulfillmentMode): Promise<void> {
  await storeSet(MODE_KEY, mode);
}
