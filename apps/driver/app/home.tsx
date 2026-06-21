import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { DeliveryDTO } from "@markethub/api-client";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";

interface Store {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<string, string> = {
  assigned: "A coletar",
  picked_up: "A caminho",
};

export default function HomeScreen() {
  const { user, client, logout } = useAuth();
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryDTO[]>([]);
  const [available, setAvailable] = useState<DeliveryDTO[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (sid?: string | null) => {
      try {
        const myStores = (await client.driverMyStores()) as Store[];
        setStores(myStores);
        const active = sid !== undefined ? sid : (storeId ?? myStores[0]?.id ?? null);
        setStoreId(active);
        const scope = active ? { storeId: active } : {};
        const [mine, pool] = await Promise.all([
          client.driverDeliveries(scope),
          client.driverAvailableDeliveries(scope),
        ]);
        setDeliveries(mine);
        setAvailable(pool);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    },
    [client, storeId],
  );

  const accept = useCallback(
    async (id: string) => {
      setAccepting(id);
      try {
        await client.driverAcceptDelivery(id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível aceitar");
      } finally {
        setAccepting(null);
      }
    },
    [client, load],
  );

  // Recarrega ao focar e a cada 10s.
  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), 10000);
      return () => clearInterval(t);
    }, [load]),
  );

  const selectStore = (id: string) => void load(id);

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
      <View style={styles.top}>
        <Text muted variant="caption">
          Entregador
        </Text>
        <Text variant="h1">Olá, {user?.name ?? "—"}</Text>
      </View>

      {error && <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{error}</Text>}

      {/* Lojas */}
      {stores.length > 1 && (
        <View style={styles.chips}>
          {stores.map((s) => (
            <Pressable
              key={s.id}
              style={[styles.chip, storeId === s.id && styles.chipOn]}
              onPress={() => selectStore(s.id)}
            >
              <Text style={storeId === s.id ? styles.chipOnText : undefined}>{s.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Pool: entregas prontas e sem entregador — qualquer um pode aceitar. */}
      <Text variant="title" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        Disponíveis
      </Text>
      {available.length === 0 ? (
        <Text muted>Nenhuma entrega disponível.</Text>
      ) : (
        available.map((d) => (
          <View key={d.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600" }}>
                #{d.orderId.slice(-6)} · {d.customerName}
              </Text>
              {d.address && (
                <Text muted variant="caption">
                  {d.address}
                </Text>
              )}
              <Text muted variant="caption">
                {d.itemCount} item(ns)
              </Text>
            </View>
            <Button
              title={accepting === d.id ? "Aceitando…" : "Aceitar"}
              onPress={() => void accept(d.id)}
              disabled={accepting !== null}
            />
          </View>
        ))
      )}

      <Text variant="title" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        Minhas entregas
      </Text>

      {deliveries.length === 0 ? (
        <Text muted>Nenhuma entrega atribuída.</Text>
      ) : (
        deliveries.map((d) => (
          <Pressable key={d.id} style={styles.row} onPress={() => router.push(`/delivery/${d.id}`)}>
            <View style={[styles.badge, d.status === "picked_up" ? styles.badgeWay : styles.badgeAssigned]}>
              <Text style={{ color: colors.white, fontWeight: "700", fontSize: 12 }}>
                {STATUS_LABEL[d.status] ?? d.status}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600" }}>
                #{d.orderId.slice(-6)} · {d.customerName}
              </Text>
              {d.address && (
                <Text muted variant="caption">
                  {d.address}
                </Text>
              )}
              <Text muted variant="caption">
                {d.itemCount} item(ns)
              </Text>
            </View>
          </Pressable>
        ))
      )}

      <View style={{ flex: 1 }} />
      <Button title="Sair" variant="secondary" onPress={() => void logout()} style={{ marginTop: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  top: { marginTop: spacing.lg, marginBottom: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipOnText: { color: colors.white, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeAssigned: { backgroundColor: colors.textMuted },
  badgeWay: { backgroundColor: colors.primary },
});
