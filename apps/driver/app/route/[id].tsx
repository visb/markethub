import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { DeliveryRouteDTO, RouteStopDTO } from "@markethub/api-client";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { RouteMap, type MapPoint } from "@/components/RouteMap";

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

export default function RouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useAuth();
  const router = useRouter();
  const [route, setRoute] = useState<DeliveryRouteDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryCode, setDeliveryCode] = useState("");

  const load = useCallback(async () => {
    try {
      const me = await client.driverMe();
      setRoute(me.activeRoute);
    } catch {
      setError("Falha ao carregar a rota");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
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

  if (!route) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: "Rota" }} />
        <Text>Rota concluída ou indisponível.</Text>
        <Button title="Voltar" variant="secondary" onPress={() => router.replace("/home")} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  const current = route.stops.find((s) => s.status !== "done");
  const dropoffCount = route.stops.filter((s) => s.type === "dropoff").length;
  const dropoffIndex = current?.type === "dropoff"
    ? route.stops.filter((s) => s.type === "dropoff" && s.sequence <= current.sequence).length
    : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
      <Stack.Screen options={{ headerShown: true, title: "Rota ativa" }} />

      <RouteMap height={180} points={pointsOf(route)} />

      {error && <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{error}</Text>}

      {/* Roteiro */}
      <Text variant="title" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        Roteiro
      </Text>
      {route.stops.map((s) => (
        <StopRow key={s.id} stop={s} active={current?.id === s.id} />
      ))}

      {/* Ação da parada corrente */}
      {current && (
        <View style={styles.action}>
          {current.type === "pickup" ? (
            <PickupActions
              stop={current}
              busy={busy}
              onArrive={() => void run(() => client.driverArrive(route.id, current.id))}
              onLeave={() => void run(() => client.driverLeavePickup(route.id, current.id))}
            />
          ) : (
            <DropoffActions
              stop={current}
              index={dropoffIndex}
              total={dropoffCount}
              busy={busy}
              code={deliveryCode}
              setCode={setDeliveryCode}
              onArrive={() => void run(() => client.driverArrive(route.id, current.id))}
              onConfirm={() => void run(() => client.driverConfirmDelivery(route.id, current.id, deliveryCode.trim()))}
              onComplete={() => void run(() => client.driverCompleteDelivery(route.id, current.id))}
            />
          )}
        </View>
      )}

      {!current && (
        <View style={{ marginTop: spacing.lg }}>
          <Text variant="h2" style={{ color: colors.success }}>
            Rota concluída! 🎉
          </Text>
          <Button title="Voltar para a home" onPress={() => router.replace("/home")} style={{ marginTop: spacing.md }} />
        </View>
      )}
    </ScrollView>
  );
}

function StopRow({ stop, active }: { stop: RouteStopDTO; active: boolean }) {
  const done = stop.status === "done";
  return (
    <View style={[styles.stop, active && styles.stopActive]}>
      <View
        style={[
          styles.dot,
          { backgroundColor: done ? colors.success : stop.type === "pickup" ? colors.primary : colors.textMuted },
        ]}
      >
        <Text style={{ color: colors.white, fontWeight: "700" }}>{done ? "✓" : stop.sequence}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "600" }}>
          {stop.type === "pickup" ? `Coleta · ${stop.storeName ?? "Loja"}` : `Entrega · ${stop.customerName ?? "Cliente"}`}
        </Text>
        {stop.address && (
          <Text muted variant="caption">
            {stop.address}
          </Text>
        )}
      </View>
    </View>
  );
}

function PickupActions({
  stop,
  busy,
  onArrive,
  onLeave,
}: {
  stop: RouteStopDTO;
  busy: boolean;
  onArrive: () => void;
  onLeave: () => void;
}) {
  if (stop.status === "pending") {
    return <Button title="Cheguei à loja" loading={busy} onPress={onArrive} />;
  }
  // arrived → mostra códigos a apresentar à loja
  return (
    <View>
      <Text variant="title" style={{ marginBottom: spacing.sm }}>
        Apresente o código de coleta na loja
      </Text>
      {(stop.groups ?? []).map((g) => (
        <View key={g.orderGroupId} style={styles.codeBox}>
          <Text muted variant="caption">
            Pedido #{g.orderId.slice(-6)} · {g.itemCount} item(ns)
          </Text>
          <Text variant="h1" style={{ color: colors.primary, letterSpacing: 6 }}>
            {g.pickupCode ?? "----"}
          </Text>
        </View>
      ))}
      <Text muted variant="caption" style={{ marginVertical: spacing.sm }}>
        A loja digita o código para liberar. Depois toque em "Saí da coleta".
      </Text>
      <Button title="Saí da coleta" loading={busy} onPress={onLeave} />
    </View>
  );
}

function DropoffActions({
  stop,
  index,
  total,
  busy,
  code,
  setCode,
  onArrive,
  onConfirm,
  onComplete,
}: {
  stop: RouteStopDTO;
  index: number;
  total: number;
  busy: boolean;
  code: string;
  setCode: (s: string) => void;
  onArrive: () => void;
  onConfirm: () => void;
  onComplete: () => void;
}) {
  if (stop.status === "pending") {
    return (
      <View>
        <Text variant="title" style={{ marginBottom: spacing.sm }}>
          Entrega ({index}/{total})
        </Text>
        <Button title="Cheguei ao cliente" loading={busy} onPress={onArrive} />
      </View>
    );
  }
  // arrived → confirmar por deliveryCode e finalizar
  return (
    <View>
      <Text variant="title" style={{ marginBottom: spacing.sm }}>
        Entrega ({index}/{total})
      </Text>
      <Text muted variant="caption" style={{ marginBottom: spacing.sm }}>
        Peça o código de entrega ao cliente e digite para confirmar.
      </Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Código de entrega"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        style={styles.input}
      />
      <Button
        title="Confirmar entrega"
        loading={busy}
        disabled={code.trim().length === 0}
        onPress={onConfirm}
        style={{ marginTop: spacing.sm }}
      />
      <Button
        title="Finalizar entrega"
        variant="outline"
        loading={busy}
        onPress={onComplete}
        style={{ marginTop: spacing.sm }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background, padding: spacing.lg },
  stop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm, padding: spacing.sm, borderRadius: radius.sm },
  stopActive: { backgroundColor: colors.surface },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  action: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  codeBox: { alignItems: "center", paddingVertical: spacing.sm },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 20,
    letterSpacing: 4,
    color: colors.text,
  },
});
