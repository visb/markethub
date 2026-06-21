import * as Location from "expo-location";
import type { Address } from "@/api/marketplace";

/** Nome do estado (reverse geocode) → UF. Espelha o mapa do AddressForm. */
const STATE_UF: Record<string, string> = {
  parana: "PR",
  "paraná": "PR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  "são paulo": "SP",
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Endereço a partir da localização do dispositivo (S6.2), headless — sem UI.
 * Pede permissão, obtém lat/lng e faz geocodificação reversa. Retorna o corpo
 * pronto para `addAddress`, ou `null` se a permissão for negada / falhar.
 * Usado no boot da Home para criar o primeiro endereço automaticamente.
 */
/**
 * Posição atual do dispositivo (lat/lng), headless — sem UI e sem reverse geocode.
 * Usado pelo mapa do explore (story 05) p/ centrar na localização do usuário.
 * Retorna `null` se a permissão for negada ou a leitura falhar (a tela cai no
 * fallback de endereço ativo / centro padrão, sem travar).
 */
export async function deviceLatLng(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

export async function deviceAddress(): Promise<Partial<Address> | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const places = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    const p = places[0];
    if (!p) return null;

    const ufRaw = (p.region ?? "").trim();
    const uf = ufRaw.length === 2 ? ufRaw.toUpperCase() : STATE_UF[normalize(ufRaw)] ?? ufRaw;

    return {
      label: "Casa",
      zipCode: p.postalCode ?? "",
      street: p.street ?? "",
      number: p.streetNumber ?? "",
      district: p.district ?? null,
      city: p.city ?? p.subregion ?? "",
      state: uf,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  } catch {
    return null;
  }
}
