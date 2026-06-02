import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Permissão + posição atual e, quando `watch`, atualização contínua (entregador
 * disponível/em rota). Retorna a última posição conhecida e o estado da permissão.
 */
export function useLocation(watch: boolean) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  const sub = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!mounted) return;
      const ok = status === "granted";
      setGranted(ok);
      if (!ok) return;
      try {
        const pos = await Location.getCurrentPositionAsync({});
        if (mounted) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // posição indisponível agora; watch pode preencher depois
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!watch || granted === false) return;
    let cancelled = false;
    void (async () => {
      sub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 15000 },
        (pos) => {
          if (!cancelled) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
      );
    })();
    return () => {
      cancelled = true;
      sub.current?.remove();
      sub.current = null;
    };
  }, [watch, granted]);

  return { coords, granted };
}
