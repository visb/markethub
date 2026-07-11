import { useEffect, useState } from "react";
import type { DeliveryDTO } from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import { API_URL } from "@/config";
import { startTracking, stopTracking } from "@/tracking";

/**
 * Rastreio ao vivo da entrega (story 51). Ciclo:
 * - **inicia** quando a entrega está `picked_up` (coletada, a caminho);
 * - **para** ao sair desse estado (entregue/cancelada), ao desmontar e no logout.
 *
 * Permissão de background negada → `permissionDenied` (a tela mostra um banner;
 * o fluxo de entrega segue funcionando). No web o rastreio é no-op silencioso.
 */
export function useDeliveryTracking(delivery: DeliveryDTO | null | undefined): {
  permissionDenied: boolean;
} {
  const { user } = useAuth();
  const [permissionDenied, setPermissionDenied] = useState(false);

  const active = delivery?.status === "picked_up";
  const deliveryId = delivery?.id;

  useEffect(() => {
    if (!active || !deliveryId) {
      setPermissionDenied(false);
      return;
    }
    let cancelled = false;
    void startTracking({ deliveryId, apiBaseUrl: `${API_URL}/api/v1` }).then((result) => {
      if (!cancelled) setPermissionDenied(result === "denied");
    });
    return () => {
      cancelled = true;
      void stopTracking();
    };
  }, [active, deliveryId]);

  // Logout (transição p/ deslogado): garante que o rastreio para.
  useEffect(() => {
    if (!user) void stopTracking();
  }, [user]);

  return { permissionDenied };
}
