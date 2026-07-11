import { useEffect, useState } from "react";
import { DRIVER_LOCATION_EVENT } from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import type { DriverLocationEvent } from "@/api/marketplace";
import type { LatLng } from "@/lib/mapRegion";

/**
 * Posição do entregador ao vivo (story 51). Assina o canal `/delivery` do pedido
 * e devolve a última posição recebida (`driver:location`) como `LatLng`, ou null
 * enquanto não houver. Só conecta quando `enabled` (macro-etapa de entrega em
 * andamento com entrega own-store). Cleanup: desinscreve/desconecta no unmount ou
 * quando `enabled` volta a false.
 */
export function useDeliveryLocation(
  orderId: string,
  enabled: boolean,
): { driver: LatLng | null; heading: number | null } {
  const { realtimeDelivery } = useAuth();
  const [position, setPosition] = useState<{ driver: LatLng; heading: number | null } | null>(null);

  useEffect(() => {
    if (!orderId || !enabled) {
      setPosition(null);
      return;
    }

    const onLocation = (payload: unknown) => {
      const p = payload as DriverLocationEvent;
      if (typeof p?.lat !== "number" || typeof p?.lng !== "number") return;
      setPosition({
        driver: { latitude: p.lat, longitude: p.lng },
        heading: typeof p.heading === "number" ? p.heading : null,
      });
    };
    const onConnect = () => realtimeDelivery.subscribeOrder(orderId);

    realtimeDelivery.on(DRIVER_LOCATION_EVENT, onLocation);
    realtimeDelivery.on("connect", onConnect);
    realtimeDelivery.connect();
    if (realtimeDelivery.connected) onConnect();

    return () => {
      realtimeDelivery.disconnect();
      setPosition(null);
    };
  }, [orderId, enabled, realtimeDelivery]);

  return { driver: position?.driver ?? null, heading: position?.heading ?? null };
}
