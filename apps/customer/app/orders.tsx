import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type OrderSummary } from "@/api/marketplace";
import { Header } from "@/components/Header";

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
      setOrders((await mkt.orders()).items);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Minhas compras" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.md }}
          ListEmptyComponent={<Text muted style={{ padding: spacing.md }}>Nenhum pedido ainda.</Text>}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => item.status === "created" && router.push(`/payment/${item.id}`)}
            >
              <Text style={styles.id}>#{item.id.slice(0, 4)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600" }}>{STATUS_LABEL[item.status] ?? item.status}</Text>
                <Text variant="caption" muted>
                  {new Date(item.createdAt).toLocaleString("pt-BR")}
                </Text>
                {item.refund && item.refund.amountCents > 0 && (
                  <Text variant="caption" style={{ color: colors.success }}>
                    Reembolso: {brl(item.refund.amountCents)} (falta na separação)
                  </Text>
                )}
              </View>
              {item.status === "created" ? (
                <Button title="Pagar" size="sm" onPress={() => router.push(`/payment/${item.id}`)} />
              ) : (
                <Text style={{ fontWeight: "700" }}>{brl(item.totalCents)}</Text>
              )}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  id: { color: colors.textMuted, width: 44 },
  sep: { height: 1, backgroundColor: colors.border },
});
