import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import type { ApiClient } from "@markethub/api-client";
import { useAuth } from "@/auth-context";

/**
 * Registro de push no device via Expo Push Service (story 50).
 *
 * - Ao autenticar: pede permissão, obtém o `ExponentPushToken[...]` e faz upsert
 *   em `POST notifications/device-tokens` (idempotente).
 * - No logout: `DELETE notifications/device-tokens` com o token antes de esquecê-lo.
 * - Recebimento em foreground: banner via `setNotificationHandler`.
 * - Tap na notificação: deep-link p/ `data.route` (ex.: `/delivery/<deliveryId>`).
 * - Web ou permissão negada: no-op silencioso.
 *
 * Montado no `_layout.tsx` raiz (dentro do AuthProvider). Best-effort: qualquer
 * falha (rede, permissão) é engolida — não quebra a navegação.
 */

/** Plataforma do device no formato aceito pelo backend (`DevicePlatform`). */
function currentPlatform(): "ios" | "android" | "web" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

/** Extrai a rota de deep-link do payload da notificação, se houver. */
export function routeFromResponse(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | undefined;
  const route = data?.route;
  return typeof route === "string" && route.length > 0 ? route : null;
}

/** Pede permissão (se ainda não concedida) e devolve o Expo push token — ou null. */
async function acquireToken(): Promise<string | null> {
  if (Platform.OS === "web") return null; // sem push no web (fica p/ service worker futuro)
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }
  if (!granted) return null; // permissão negada: no-op
  const { data } = await Notifications.getExpoPushTokenAsync();
  return data;
}

async function register(client: ApiClient, tokenRef: { current: string | null }): Promise<void> {
  try {
    const token = await acquireToken();
    if (!token) return;
    tokenRef.current = token;
    await client.registerDeviceToken(token, currentPlatform());
  } catch {
    // best-effort
  }
}

async function revoke(client: ApiClient, tokenRef: { current: string | null }): Promise<void> {
  const token = tokenRef.current;
  if (!token) return;
  tokenRef.current = null;
  try {
    await client.unregisterDeviceToken(token);
  } catch {
    // best-effort
  }
}

export function usePushRegistration(): void {
  const { user, client } = useAuth();
  const tokenRef = useRef<string | null>(null);
  const prevUserId = useRef<string | null>(null);

  // Registra ao autenticar; revoga na transição p/ deslogado.
  useEffect(() => {
    const uid = user?.id ?? null;
    const prev = prevUserId.current;
    prevUserId.current = uid;
    if (uid && uid !== prev) {
      void register(client, tokenRef);
    } else if (!uid && prev) {
      void revoke(client, tokenRef);
    }
  }, [user, client]);

  // Recebimento em foreground: exibe o banner do sistema (em vez de silenciar).
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }, []);

  // Tap na notificação → deep-link.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeFromResponse(response);
      if (route) router.push(route as never);
    });
    return () => sub.remove();
  }, []);
}
