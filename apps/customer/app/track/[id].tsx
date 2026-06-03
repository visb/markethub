import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { marketplace, type OrderTracking } from "@/api/marketplace";
import { Header } from "@/components/Header";

// Etapas da linha do tempo do pedido. A entrega tem uma etapa "a caminho" que a
// retirada (pickup) não tem.
const DELIVERY_STEPS = [
  { key: "paid", label: "Pagamento confirmado" },
  { key: "preparing", label: "Pedido confirmado" },
  { key: "picking", label: "Em separação" },
  { key: "ready_for_pickup", label: "Pronto, aguardando coleta" },
  { key: "on_the_way", label: "A caminho" },
  { key: "delivered", label: "Entregue" },
] as const;

const PICKUP_STEPS = [
  { key: "paid", label: "Pagamento confirmado" },
  { key: "preparing", label: "Pedido confirmado" },
  { key: "picking", label: "Em separação" },
  { key: "ready_for_pickup", label: "Pronto para retirar" },
  { key: "delivered", label: "Retirado" },
] as const;

const ORDER_RANK = ["created", "paid", "preparing", "picking", "ready_for_pickup", "on_the_way", "delivered"];

export default function TrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const router = useRouter();
  const mkt = marketplace(api);
  const [data, setData] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await mkt.tracking(id);
      setData(t);
      // encerra o polling quando o pedido termina
      if ((t.status === "delivered" || t.status === "canceled") && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
    // poll a cada 8s enquanto a tela estiver aberta (rastreio por status; sem mapa)
    timer.current = setInterval(() => void load(), 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <Header title="Acompanhar pedido" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <Header title="Acompanhar pedido" />
        <Text muted style={{ padding: spacing.md }}>Pedido não encontrado.</Text>
      </SafeAreaView>
    );
  }

  const isPickupOnly = data.hasPickup && !data.hasDelivery;
  const steps = isPickupOnly ? PICKUP_STEPS : DELIVERY_STEPS;
  const currentRank = ORDER_RANK.indexOf(data.status);
  const canceled = data.status === "canceled";

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Acompanhar pedido" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        <View style={styles.card}>
          <Text variant="caption" muted>Pedido</Text>
          <Text style={{ fontWeight: "700", fontSize: 18 }}>#{data.orderId.slice(0, 6)}</Text>
        </View>

        {canceled ? (
          <View style={styles.card}>
            <Text style={{ fontWeight: "700", color: colors.danger }}>Pedido cancelado</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {steps.map((step) => {
              const rank = ORDER_RANK.indexOf(step.key);
              const done = currentRank >= rank;
              const active = data.status === step.key;
              return (
                <View key={step.key} style={styles.stepRow}>
                  <View
                    style={[
                      styles.dot,
                      done && styles.dotDone,
                      active && styles.dotActive,
                    ]}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontWeight: active ? "700" : "500",
                      color: done ? colors.text : colors.textMuted,
                    }}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Código que o cliente apresenta na entrega/retirada */}
        {data.deliveryCode &&
          (data.status === "ready_for_pickup" || data.status === "on_the_way") && (
            <View style={[styles.card, styles.codeCard]}>
              <Text variant="caption" style={{ color: colors.primary }}>
                {isPickupOnly ? "Código de retirada" : "Código de entrega"}
              </Text>
              <Text style={styles.code}>{data.deliveryCode}</Text>
              <Text variant="caption" muted>
                {isPickupOnly
                  ? "Apresente este código na loja para retirar."
                  : "Informe este código ao entregador na porta."}
              </Text>
            </View>
          )}

        {data.status === "delivered" && (
          <Button title="Avaliar pedido" onPress={() => router.push(`/review/${data.orderId}`)} />
        )}

        {/* Por loja (multi-loja): etapa atual + entrega própria */}
        {data.groups.map((g) => (
          <View key={g.orderGroupId} style={styles.card}>
            <Text style={{ fontWeight: "700" }}>{g.storeName}</Text>
            <Text variant="caption" muted>
              {g.fulfillment === "pickup" ? "Retirada na loja" : "Entrega pela loja"}
            </Text>
            {g.delivery?.driverName && g.delivery.status !== "delivered" && (
              <Text variant="caption" style={{ color: colors.primary }}>
                Entregador: {g.delivery.driverName}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  codeCard: { borderWidth: 1, borderColor: colors.primary, alignItems: "center" },
  code: { fontSize: 28, fontWeight: "800", letterSpacing: 4, color: colors.primary },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.success },
  dotActive: { backgroundColor: colors.primary, transform: [{ scale: 1.2 }] },
});
