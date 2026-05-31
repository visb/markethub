import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Screen, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type OrderSummary } from "@/api/marketplace";

const STATUS_LABEL: Record<string, string> = {
  created: "Aguardando pagamento",
  paid: "Pago",
  preparing: "Preparando",
  picking: "Em separação",
  on_the_way: "A caminho",
  delivered: "Entregue",
  canceled: "Cancelado",
};

export default function OrdersScreen() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await mkt.orders();
      setOrders(r.items);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen padded={false}>
      <View style={styles.head}>
        <Text variant="h2">Minhas compras</Text>
        <Button title="Mercado" variant="ghost" onPress={() => router.replace("/home")} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          ListEmptyComponent={<Text muted>Nenhum pedido ainda.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text>Pedido #{item.id.slice(0, 8)}</Text>
                <Text variant="caption" muted>
                  {STATUS_LABEL[item.status] ?? item.status} · {brl(item.totalCents)}
                </Text>
              </View>
              {item.status === "created" && (
                <Button title="Pagar" onPress={() => router.push(`/payment/${item.id}`)} />
              )}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
