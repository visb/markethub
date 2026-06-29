import React, { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { VehicleIndicator } from "@/components/VehicleIndicator";
import { useCurrentVehicle } from "@/api/hooks/useDriverVehicle";
import {
  useAcceptDelivery,
  useAvailableDeliveries,
  useDriverDeliveries,
  useDriverStores,
} from "@/api/hooks/useDriverDeliveries";

const STATUS_LABEL: Record<string, string> = {
  assigned: "A coletar",
  picked_up: "A caminho",
};

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const currentVehicle = useCurrentVehicle();

  const storesQuery = useDriverStores();
  const stores = storesQuery.data ?? [];
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  // Loja ativa: a selecionada manualmente, senão a primeira da lista.
  const storeId = selectedStoreId ?? stores[0]?.id ?? null;

  const ready = storesQuery.isSuccess;
  const deliveriesQuery = useDriverDeliveries(storeId, { enabled: ready });
  const availableQuery = useAvailableDeliveries(storeId, { enabled: ready });
  const accept = useAcceptDelivery();

  const deliveries = deliveriesQuery.data ?? [];
  const available = availableQuery.data ?? [];
  const loading = storesQuery.isLoading || (ready && deliveriesQuery.isLoading);
  const error =
    storesQuery.isError || deliveriesQuery.isError || availableQuery.isError
      ? "Erro ao carregar"
      : accept.isError
        ? "Não foi possível aceitar"
        : null;

  const refresh = () => {
    void storesQuery.refetch();
    void deliveriesQuery.refetch();
    void availableQuery.refetch();
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
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
    >
      <View style={styles.top}>
        <Text muted variant="caption">
          Entregador
        </Text>
        <Text variant="h1">Olá, {user?.name ?? "—"}</Text>
      </View>

      {/* Indicador do veículo do turno — tocável, abre o seletor (≤2 cliques). */}
      <View style={{ marginBottom: spacing.md }}>
        <VehicleIndicator
          vehicle={currentVehicle.data ?? null}
          onPress={() => router.push("/select-vehicle")}
        />
      </View>

      {error && <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{error}</Text>}

      {/* Lojas */}
      {stores.length > 1 && (
        <View style={styles.chips}>
          {stores.map((s) => (
            <Pressable
              key={s.id}
              style={[styles.chip, storeId === s.id && styles.chipOn]}
              onPress={() => setSelectedStoreId(s.id)}
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
              title={accept.isPending && accept.variables === d.id ? "Aceitando…" : "Aceitar"}
              onPress={() => accept.mutate(d.id)}
              disabled={accept.isPending}
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
