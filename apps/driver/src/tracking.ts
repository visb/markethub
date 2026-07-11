import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";

/**
 * Rastreio de entrega ao vivo — camada de device do entregador (story 51).
 *
 * Ingest REST + fan-out WS: a task de background NÃO sustenta socket, então o
 * entregador publica a posição via `POST /driver/deliveries/:id/location`
 * (throttled) e o backend faz o broadcast no canal `/delivery`. A posição é
 * efêmera (não persistida).
 *
 * `expo-location` background + `expo-task-manager`: o rastreio segue com o app em
 * background/tela bloqueada (o entregador navega com o app de mapas em primeiro
 * plano). A task lê a sessão ativa (deliveryId + baseUrl) e o access token do
 * mesmo SecureStore da API — assim reaproveita o refresh feito em foreground.
 */

export const LOCATION_TASK_NAME = "markethub-delivery-location";
const SESSION_KEY = "mh_tracking_session";
const ACCESS_KEY = "mh_access"; // mesma chave do SecureTokenStore

// Throttle do device: no máx. ~1 leitura a cada 10s OU a cada 50m de deslocamento.
const TIME_INTERVAL_MS = 10_000;
const DISTANCE_INTERVAL_M = 50;

/** Resultado de `startTracking` — distingue negado de não-suportado (web). */
export type StartResult = "started" | "denied" | "unsupported";

/** Sessão de rastreio ativa (uma entrega por vez). */
export interface TrackingSession {
  deliveryId: string;
  /** Base da API já com o prefixo (`.../api/v1`). */
  apiBaseUrl: string;
}

const isWeb = () => Platform.OS === "web";

// ── storage da sessão (cross-platform, mesmo padrão do SecureTokenStore) ──

async function getItem(key: string): Promise<string | null> {
  if (isWeb()) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}
async function setItem(key: string, value: string): Promise<void> {
  if (isWeb()) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
async function removeItem(key: string): Promise<void> {
  if (isWeb()) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function readSession(): Promise<TrackingSession | null> {
  const raw = await getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrackingSession;
  } catch {
    return null;
  }
}

/** Publica uma leitura de posição (best-effort — posição efêmera, engole falha). */
export async function postLocation(
  session: TrackingSession,
  loc: Location.LocationObject,
): Promise<void> {
  const token = await getItem(ACCESS_KEY);
  if (!token) return; // sem sessão autenticada: nada a publicar
  await fetch(`${session.apiBaseUrl}/driver/deliveries/${session.deliveryId}/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      heading: loc.coords.heading ?? null,
      recordedAt: new Date(loc.timestamp).toISOString(),
    }),
  });
}

/** Corpo do callback da task de background (exportado p/ teste). */
export interface LocationTaskBody {
  data?: { locations?: Location.LocationObject[] } | null;
  error?: unknown;
}

/** Handler da task: publica cada leitura recebida na sessão ativa. */
export async function handleLocationTask(body: LocationTaskBody): Promise<void> {
  if (body.error) return;
  const session = await readSession();
  if (!session) return;
  const locations = body.data?.locations ?? [];
  for (const loc of locations) {
    try {
      await postLocation(session, loc);
    } catch {
      // best-effort: uma leitura perdida não interrompe o rastreio
    }
  }
}

// Registra a task de background (idempotente; roda no contexto headless também).
TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) =>
  handleLocationTask({ data: data as LocationTaskBody["data"], error }),
);

/**
 * Inicia o rastreio da entrega ao confirmar a coleta. Pede permissão de
 * background ("Allow all the time"); se negada, devolve `denied` (o app mostra
 * um banner — o fluxo de entrega segue funcionando). No web é `unsupported`.
 */
export async function startTracking(session: TrackingSession): Promise<StartResult> {
  if (isWeb()) return "unsupported";
  const { granted } = await Location.requestBackgroundPermissionsAsync();
  if (!granted) return "denied";
  await setItem(SESSION_KEY, JSON.stringify(session));
  const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(
    () => false,
  );
  if (!already) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: TIME_INTERVAL_MS,
      distanceInterval: DISTANCE_INTERVAL_M,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Rastreio de entrega ativo",
        notificationBody: "Sua localização é compartilhada com o cliente durante a entrega.",
      },
    });
  }
  return "started";
}

/** Para o rastreio (confirmar entrega, cancelamento ou logout). Limpa a sessão. */
export async function stopTracking(): Promise<void> {
  await removeItem(SESSION_KEY);
  if (isWeb()) return;
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(
    () => false,
  );
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
}
