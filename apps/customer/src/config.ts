import type { RoleName } from "@markethub/api-client";

/** Papel exigido por este app. Cada app (customer/picker/driver) fixa o seu. */
export const APP_ROLE: RoleName = "customer";
export const APP_TITLE = "MarketHub";

// Acesso seguro a process.env (Expo injeta EXPO_PUBLIC_* no build; evita depender de @types/node).
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

/** URL da API. Em device físico, troque localhost pelo IP da máquina via EXPO_PUBLIC_API_URL. */
export const API_URL = env?.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
