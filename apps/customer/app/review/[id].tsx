import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import {
  brl,
  marketplace,
  type OrderTracking,
  type Review,
  type ReviewAxis,
  type TipView,
} from "@/api/marketplace";
import { Header } from "@/components/Header";

const AXIS_LABEL: Record<ReviewAxis, string> = {
  platform: "Sua experiência no app",
  merchant: "A loja / mercado",
  delivery: "A entrega",
};

const TIP_PRESETS = [300, 500, 1000];

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.xs }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} hitSlop={6} onPress={() => onChange(n)}>
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={30}
            color={n <= value ? colors.primary : colors.textMuted}
          />
        </Pressable>
      ))}
    </View>
  );
}

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const mkt = marketplace(api);

  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [done, setDone] = useState<Record<string, Review>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [tip, setTip] = useState<TipView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, reviews] = await Promise.all([mkt.tracking(id), mkt.reviews(id)]);
      setTracking(t);
      setDone(Object.fromEntries(reviews.map((r) => [r.axis, r])));
      try {
        setTip(await mkt.tip(id));
      } catch {
        /* sem gorjeta ainda */
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitAxis = async (axis: ReviewAxis) => {
    const rating = ratings[axis];
    if (!rating) return;
    setBusy(true);
    try {
      const r = await mkt.createReview(id, { axis, rating, comment: comment.trim() || undefined });
      setDone((d) => ({ ...d, [axis]: r }));
    } finally {
      setBusy(false);
    }
  };

  const sendTip = async (amountCents: number) => {
    setBusy(true);
    try {
      setTip(await mkt.createTip(id, amountCents));
    } finally {
      setBusy(false);
    }
  };

  const payTip = async () => {
    setBusy(true);
    try {
      await mkt.mockPayTip(id);
      setTip(await mkt.tip(id));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <Header title="Avaliar pedido" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  // eixo delivery só quando houve entrega própria com entregador
  const driver = tracking?.groups.find((g) => g.delivery?.driverName)?.delivery?.driverName ?? null;
  const axes: ReviewAxis[] = ["platform", "merchant"];
  if (tracking?.hasDelivery && driver) axes.push("delivery");

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Avaliar pedido" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        <Text muted>Como foi seu pedido? Sua avaliação ajuda a melhorar o serviço.</Text>

        {axes.map((axis) => {
          const existing = done[axis];
          return (
            <View key={axis} style={styles.card}>
              <Text style={{ fontWeight: "700" }}>{AXIS_LABEL[axis]}</Text>
              {existing ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Stars value={existing.rating} onChange={() => {}} />
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                </View>
              ) : (
                <>
                  <Stars
                    value={ratings[axis] ?? 0}
                    onChange={(v) => setRatings((r) => ({ ...r, [axis]: v }))}
                  />
                  <Button
                    title="Enviar avaliação"
                    size="sm"
                    disabled={!ratings[axis] || busy}
                    onPress={() => submitAxis(axis)}
                  />
                </>
              )}
            </View>
          );
        })}

        <View style={styles.card}>
          <Text variant="caption" muted>Comentário (opcional)</Text>
          <TextInput
            style={styles.input}
            multiline
            placeholder="Conte como foi sua experiência"
            placeholderTextColor={colors.textMuted}
            value={comment}
            onChangeText={setComment}
          />
        </View>

        {/* Gorjeta ao entregador (S5.2) — só com entrega própria */}
        {tracking?.hasDelivery && driver && (
          <View style={styles.card}>
            <Text style={{ fontWeight: "700" }}>Gorjeta para {driver}</Text>
            {tip?.status === "paid" ? (
              <Text style={{ color: colors.success, fontWeight: "600" }}>
                Gorjeta de {brl(tip.amountCents)} enviada. Obrigado!
              </Text>
            ) : tip && tip.qrCode ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="caption" muted>
                  Gorjeta de {brl(tip.amountCents)} — pague via PIX:
                </Text>
                <Text selectable style={styles.qr}>{tip.qrCode}</Text>
                <Button title="Já paguei (simular)" size="sm" disabled={busy} onPress={payTip} />
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {TIP_PRESETS.map((cents) => (
                  <Button
                    key={cents}
                    title={brl(cents)}
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onPress={() => sendTip(cents)}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    minHeight: 70,
    color: colors.text,
    textAlignVertical: "top",
  },
  qr: {
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: radius.sm,
    fontSize: 11,
    color: colors.text,
  },
});
