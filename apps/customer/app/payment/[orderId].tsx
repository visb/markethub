import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type PaymentView } from "@/api/marketplace";
import { Header } from "@/components/Header";

const INSTRUCTIONS = [
  "Copie o código Pix acima.",
  "Acesse o app do seu banco ou internet banking de preferência.",
  "Escolha pagar com o Pix, cole o código e finalize o pagamento.",
  "Seu pagamento será aprovado em alguns segundos.",
];

export default function PaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const init = useCallback(async () => {
    if (!orderId) return;
    setPayment(await mkt.pay(orderId));
    pollRef.current = setInterval(async () => {
      const s = await mkt.paymentStatus(orderId);
      setPayment(s);
      if (s.status === "paid" || s.status === "expired") stop();
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    void init();
    return stop;
  }, [init]);

  if (!payment) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <Header title="Pague com PIX" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  if (payment.status === "paid") {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <View style={styles.success}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={56} color={colors.white} />
          </View>
          <Text variant="h1" style={{ textAlign: "center", marginTop: spacing.lg }}>
            Pagamento realizado com sucesso!
          </Text>
          <Button
            title="Acompanhe seu pedido"
            variant="outline"
            style={{ marginTop: spacing.xl, alignSelf: "stretch" }}
            onPress={() => router.replace(`/track/${orderId}`)}
          />
        </View>
      </SafeAreaView>
    );
  }

  const expires = payment.expiresAt ? new Date(payment.expiresAt) : null;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Pague com PIX" showBack={false} />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        <View style={styles.row}>
          <Text style={{ fontWeight: "700" }}>Valor total</Text>
          <Text style={styles.total}>{brl(payment.amountCents)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={{ fontWeight: "700" }}>Pagar até</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>30 mins</Text>
            {expires ? (
              <Text variant="caption" muted>
                Vence em {expires.toLocaleString("pt-BR")}
              </Text>
            ) : null}
          </View>
        </View>

        {/* QR do payload PIX copia-e-cola */}
        <View style={styles.qr}>
          {payment.qrCode ? (
            <QRCode value={payment.qrCode} size={180} />
          ) : (
            <Ionicons name="qr-code" size={140} color={colors.text} />
          )}
        </View>

        <Text muted style={{ textAlign: "center" }}>
          Escaneie o QR Code ou copie o código abaixo, cole em seu banco
        </Text>

        <Pressable
          style={styles.codeBox}
          onPress={async () => {
            if (!payment.qrCode) return;
            await Clipboard.setStringAsync(payment.qrCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          <Text selectable style={styles.code} numberOfLines={2}>
            {payment.qrCode}
          </Text>
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={20} color={copied ? colors.success : colors.primary} />
        </Pressable>
        {copied && (
          <Text variant="caption" style={{ color: colors.success, textAlign: "center" }}>
            Código copiado!
          </Text>
        )}

        <View>
          <Text style={{ fontWeight: "700", marginBottom: spacing.sm }}>Siga essas instruções:</Text>
          {INSTRUCTIONS.map((t, i) => (
            <Text key={i} style={{ marginBottom: 4 }}>
              {i + 1}. {t}
            </Text>
          ))}
        </View>

        {/* Dev: confirma com provider mock */}
        <Button
          title="Simular pagamento (mock)"
          variant="secondary"
          onPress={async () => {
            if (orderId) await mkt.mockPay(orderId);
          }}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Aguardando pagamento..." variant="outline" disabled onPress={() => {}} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  total: { color: colors.primary, fontSize: 20, fontWeight: "700" },
  qr: {
    alignSelf: "center",
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  code: { flex: 1, fontSize: 13 },
  success: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
});
