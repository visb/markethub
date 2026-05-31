import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Screen, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type PaymentView } from "@/api/marketplace";

export default function PaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const init = useCallback(async () => {
    if (!orderId) return;
    const p = await mkt.pay(orderId);
    setPayment(p);
    pollRef.current = setInterval(async () => {
      const s = await mkt.paymentStatus(orderId);
      setPayment(s);
      if (s.status === "paid" || s.status === "expired") stopPolling();
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    void init();
    return stopPolling;
  }, [init]);

  if (!payment) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  if (payment.status === "paid") {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.check}>✓</Text>
          <Text variant="h1" style={{ textAlign: "center", marginTop: spacing.md }}>
            Pagamento realizado com sucesso!
          </Text>
          <Button
            title="Acompanhe seu pedido"
            style={{ marginTop: spacing.xl }}
            onPress={() => router.replace("/orders")}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="h2">Pague com PIX</Text>
      <Text muted style={{ marginTop: spacing.xs }}>
        {brl(payment.amountCents)} · aguardando pagamento…
      </Text>

      <View style={styles.qrBox}>
        <Text variant="caption" muted>
          Copia e cola PIX
        </Text>
        <Text selectable style={styles.code}>
          {payment.qrCode}
        </Text>
      </View>

      {/* Dev: confirma pagamento com provider mock */}
      <Button
        title="Simular pagamento (mock)"
        variant="secondary"
        onPress={async () => {
          if (orderId) await mkt.mockPay(orderId);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  check: { fontSize: 64, color: colors.success },
  qrBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginVertical: spacing.lg,
    gap: spacing.sm,
  },
  code: { fontSize: 13 },
});
