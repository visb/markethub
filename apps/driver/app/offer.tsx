import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import type { DeliveryRouteDTO } from "@markethub/api-client";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { RouteMap, type MapPoint } from "@/components/RouteMap";
import { brl, distance, secondsUntil } from "@/format";

function pointsOf(route: DeliveryRouteDTO): MapPoint[] {
  return route.stops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({
      lat: s.lat as number,
      lng: s.lng as number,
      label: s.type === "pickup" ? s.storeName : s.customerName,
      kind: s.type,
    }));
}

export default function OfferScreen() {
  const { client } = useAuth();
  const router = useRouter();
  const [offer, setOffer] = useState<DeliveryRouteDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const o = await client.driverOffer();
      setOffer(o);
      setLeft(secondsUntil(o?.offerExpiresAt));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  // Countdown da janela de decisão.
  useEffect(() => {
    if (!offer) return;
    const t = setInterval(() => {
      const s = secondsUntil(offer.offerExpiresAt);
      setLeft(s);
      if (s <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [offer]);

  const accept = async () => {
    if (!offer) return;
    setBusy(true);
    setError(null);
    try {
      const route = await client.driverAcceptRoute(offer.id);
      router.replace(`/route/${route.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Oferta indisponível");
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!offer) return;
    setBusy(true);
    try {
      await client.driverRejectRoute(offer.id);
    } catch {
      // ignora
    } finally {
      router.back();
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!offer || left <= 0) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: "Oferta" }} />
        <Text>{offer ? "Oferta expirada." : "Nenhuma oferta no momento."}</Text>
        <Button title="Voltar" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
      <Stack.Screen options={{ headerShown: true, title: "Oferta de rota" }} />

      <View style={styles.timer}>
        <Text variant="h1" style={{ color: colors.primary }}>
          {left}s
        </Text>
        <Text muted variant="caption">
          para decidir
        </Text>
      </View>

      <View style={styles.head}>
        <Headline label="Ganho" value={brl(offer.estimatedEarningsCents)} />
        <Headline label="Distância" value={distance(offer.distanceMeters)} />
        <Headline label="Paradas" value={String(offer.stops.length)} />
      </View>

      <RouteMap height={200} points={pointsOf(offer)} />

      <Text variant="title" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        Roteiro
      </Text>
      {offer.stops.map((s) => (
        <View key={s.id} style={styles.stop}>
          <View style={[styles.dot, { backgroundColor: s.type === "pickup" ? colors.primary : colors.success }]}>
            <Text style={{ color: colors.white, fontWeight: "700" }}>{s.sequence}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "600" }}>
              {s.type === "pickup" ? `Coleta · ${s.storeName ?? "Loja"}` : `Entrega · ${s.customerName ?? "Cliente"}`}
            </Text>
            {s.address && (
              <Text muted variant="caption">
                {s.address}
              </Text>
            )}
          </View>
        </View>
      ))}

      {error && <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{error}</Text>}

      <Button title="Aceitar rota" loading={busy} onPress={() => void accept()} style={{ marginTop: spacing.lg }} />
      <Button title="Recusar" variant="outline" disabled={busy} onPress={() => void reject()} style={{ marginTop: spacing.sm }} />
    </ScrollView>
  );
}

function Headline({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.headItem}>
      <Text variant="h2">{value}</Text>
      <Text muted variant="caption">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background, padding: spacing.lg },
  timer: { alignItems: "center", marginBottom: spacing.md },
  head: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  headItem: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  stop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
