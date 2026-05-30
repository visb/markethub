import type { RoleName } from "@markethub/api-client";

/** Papel exigido por este app. Cada app (customer/picker/driver) fixa o seu. */
export const APP_ROLE: RoleName = "picker";
export const APP_TITLE = "MarketHub Separador";

/** URL da API. Em device físico, troque localhost pelo IP da máquina via EXPO_PUBLIC_API_URL. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
