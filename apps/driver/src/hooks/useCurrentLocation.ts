import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import type { LatLng } from "@markethub/ui";

/**
 * Posição atual do entregador em **foreground** para o mapa da entrega (story 59).
 * Pede permissão de localização foreground; negada → `permissionDenied` e a
 * posição segue `null` (o mapa desenha só loja/cliente, sem quebrar). É
 * independente do rastreio em **background** da story 51 (que publica a posição
 * pro cliente). No web é no-op silencioso.
 */
export function useCurrentLocation(enabled = true): {
  position: LatLng | null;
  permissionDenied: boolean;
} {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;

    void (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (cancelled) return;
      setPosition({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 25 },
        (loc) => setPosition({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
      );
      if (cancelled) sub.remove();
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);

  return { position, permissionDenied };
}
