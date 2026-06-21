import type { ExpoConfig } from "expo/config";

/**
 * Config dinâmica (substitui app.json) para injetar a chave do Google Maps do
 * AMBIENTE no provider nativo do react-native-maps (story 05). Sem segredo no
 * código: a key vem de `GOOGLE_MAPS_API_KEY` (CLAUDE.md). Sem key, o app sobe
 * igual — o mapa nativo fica sem tiles do Google, mas o web (Leaflet/OSM) não
 * depende dela. Só os blocos `config` são condicionais à presença da key.
 */
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

const config: ExpoConfig = {
  name: "MarketHub",
  slug: "markethub-customer",
  scheme: "markethubcustomer",
  version: "0.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    resizeMode: "contain",
    backgroundColor: "#00A859",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.markethub.customer",
    ...(googleMapsApiKey ? { config: { googleMapsApiKey } } : {}),
  },
  android: {
    package: "com.markethub.customer",
    ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
  },
  web: { bundler: "metro", output: "single" },
  plugins: ["expo-router", "expo-secure-store"],
};

export default config;
