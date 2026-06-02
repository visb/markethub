import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { DeliveryRouteDTO, DriverEarningsDTO, DriverProfileDTO } from "@markethub/api-client";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { RouteMap } from "@/components/RouteMap";
import { brl, distance } from "@/format";
import { useLocation } from "@/use-location";

export default function HomeScreen() {
  const { user, client, logout } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<DriverProfileDTO | null>(null);
  const [activeRoute, setActiveRoute] = useState<DeliveryRouteDTO | null>(null);
  const [offer, setOffer] = useState<DeliveryRouteDTO | null>(null);
  const [earnings, setEarnings] = useState<DriverEarningsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = profile?.status === "available" || profile?.status === "on_route";
  const { coords } = useLocation(available);
  const lastSent = useRef<number>(0);

  const load = useCallback(async () => {
    try {
      const me = await client.driverMe();
      setProfile(me.profile);
      setActiveRoute(me.activeRoute);
      setOffer(await client.driverOffer());
      setEarnings(await client.driverEarnings());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Recarrega ao focar e a cada 8s (ofertas/rota).
  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), 8000);
      return () => clearInterval(t);
    }, [load]),
  );

  // Heartbeat de localização quando disponível/em rota (a cada ~15s).
  useEffect(() => {
    if (!coords || !available) return;
    const now = Date.now();
    if (now - lastSent.current < 15000) return;
    lastSent.current = now;
    void client.driverLocation(coords.lat, coords.lng).catch(() => undefined);
  }, [coords, available, client]);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (profile?.status === "available") {
        await client.driverSetStatus("offline");
      } else {
        if (!coords) {
          setError("Sem localização — permita o acesso para ficar disponível.");
          return;
        }
        await client.driverSetStatus("available", coords.lat, coords.lng);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const onRoute = profile?.status === "on_route";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
    >
      <View style={styles.top}>
        <Text muted variant="caption">
          Entregador
        </Text>
        <Text variant="h1">Olá, {user?.name ?? "—"}</Text>
      </View>

      {error && <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{error}</Text>}

      {/* Disponibilidade */}
      <Pressable
        onPress={() => void toggle()}
        disabled={busy || onRoute}
        style={[styles.toggle, available ? styles.toggleOn : styles.toggleOff]}
      >
        <View>
          <Text style={{ color: colors.white, fontWeight: "700", fontSize: 18 }}>
            {onRoute ? "Em rota" : available ? "Disponível" : "Indisponível"}
          </Text>
          <Text style={{ color: colors.white, opacity: 0.85 }} variant="caption">
            {onRoute
              ? "Conclua a rota para alterar"
              : available
                ? "Toque para ficar indisponível"
                : "Toque para receber ofertas"}
          </Text>
        </View>
        {busy && <ActivityIndicator color={colors.white} />}
      </Pressable>

      {/* Mapa */}
      <View style={{ marginTop: spacing.md }}>
        <RouteMap
          height={200}
          points={coords ? [{ lat: coords.lat, lng: coords.lng, label: "Você", kind: "driver" }] : []}
        />
      </View>

      {/* Rota ativa */}
      {activeRoute && (
        <Button
          title="Abrir rota ativa"
          style={{ marginTop: spacing.md }}
          onPress={() => router.push(`/route/${activeRoute.id}`)}
        />
      )}

      {/* Oferta corrente */}
      {!activeRoute && offer && (
        <Pressable style={styles.offer} onPress={() => router.push("/offer")}>
          <Text style={{ color: colors.white, fontWeight: "700" }}>Nova oferta de rota!</Text>
          <Text style={{ color: colors.white }}>
            {brl(offer.estimatedEarningsCents)} · {distance(offer.distanceMeters)} ·{" "}
            {offer.stops.length} paradas
          </Text>
          <Text variant="caption" style={{ color: colors.white, opacity: 0.85 }}>
            Toque para ver e aceitar
          </Text>
        </Pressable>
      )}

      {/* Stats do dia */}
      <View style={styles.statsRow}>
        <Stat label="Hoje" value={brl(earnings?.totalCents ?? 0)} />
        <Stat label="Finalizadas" value={String(earnings?.routesCompleted ?? 0)} />
        <Stat label="Aceitas" value={String(earnings?.routesAccepted ?? 0)} />
      </View>

      <View style={{ flex: 1 }} />
      <Button title="Sair" variant="secondary" onPress={() => void logout()} style={{ marginTop: spacing.xl }} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="h2">{value}</Text>
      <Text muted variant="caption">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  top: { marginTop: spacing.lg, marginBottom: spacing.md },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  toggleOn: { backgroundColor: colors.success },
  toggleOff: { backgroundColor: colors.textMuted },
  offer: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
  },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
});
