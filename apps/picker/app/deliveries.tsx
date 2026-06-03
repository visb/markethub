import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { DeliveryDTO, StoreDriverDTO } from "@markethub/api-client";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";

const STATUS_LABEL: Record<string, string> = {
  unassigned: "Sem entregador",
  assigned: "Atribuída",
  picked_up: "A caminho",
};

export default function DeliveriesScreen() {
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const { client } = useAuth();
  const [deliveries, setDeliveries] = useState<DeliveryDTO[]>([]);
  const [drivers, setDrivers] = useState<StoreDriverDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    try {
      const [list, drv] = await Promise.all([
        client.storeDeliveries(storeId),
        client.storeDrivers(storeId),
      ]);
      setDeliveries(list);
      setDrivers(drv);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [client, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setExpanded(null);
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: "Entregas" }} />

      {error && <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{error}</Text>}

      {deliveries.length === 0 ? (
        <Text muted style={{ marginTop: spacing.lg }}>
          Nenhuma entrega no momento.
        </Text>
      ) : (
        deliveries.map((d) => (
          <View key={d.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text variant="title">#{d.orderId.slice(-6)} · {d.customerName}</Text>
                {d.address && (
                  <Text muted variant="caption">
                    {d.address}
                  </Text>
                )}
                <Text muted variant="caption">
                  {STATUS_LABEL[d.status] ?? d.status}
                  {d.driverName ? ` · ${d.driverName}` : ""}
                </Text>
              </View>
            </View>

            {d.status === "unassigned" && (
              <View style={{ marginTop: spacing.sm }}>
                {expanded === d.id ? (
                  <View style={{ gap: spacing.xs }}>
                    {drivers.length === 0 && (
                      <Text muted variant="caption">
                        Nenhum entregador vinculado à loja.
                      </Text>
                    )}
                    {drivers.map((drv) => (
                      <Pressable
                        key={drv.id}
                        style={styles.driverRow}
                        disabled={busy}
                        onPress={() => void run(() => client.assignDelivery(d.id, drv.id))}
                      >
                        <Text style={{ flex: 1 }}>{drv.name}</Text>
                        <Text muted variant="caption">
                          {drv.activeDeliveries} em aberto
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Button title="Atribuir entregador" onPress={() => setExpanded(d.id)} />
                )}
              </View>
            )}

            {d.status === "assigned" && (
              <Button
                title="Desatribuir"
                variant="outline"
                loading={busy}
                onPress={() => void run(() => client.unassignDelivery(d.id))}
                style={{ marginTop: spacing.sm }}
              />
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center" },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
