import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import {
  brl,
  marketplace,
  type OrderTracking,
  type Review,
  type TipView,
} from "@/api/marketplace";
import { useAuth } from "@/auth-context";
import { QtyStepper } from "@/components/QtyStepper";

/** Linha de avaliação da tela "Tudo certo!" (ref: Order Completed.jpg). */
interface AxisRow {
  key: string; // "platform" | "delivery" | `merchant:<id>`
  title: string;
  subtitle: string;
  axis: "platform" | "delivery" | "merchant";
  merchantId?: string;
}

const TIP_STEP_CENTS = 100;

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.xs }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} hitSlop={6} onPress={() => onChange(n)}>
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={28}
            color={n <= value ? "#f6c445" : colors.textMuted}
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
  const router = useRouter();

  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [done, setDone] = useState<Review[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [tipChecked, setTipChecked] = useState(false);
  const [tipCents, setTipCents] = useState(200);
  const [tip, setTip] = useState<TipView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, reviews] = await Promise.all([mkt.tracking(id), mkt.reviews(id)]);
      setTracking(t);
      setDone(reviews);
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

  const driver = tracking?.groups.find((g) => g.delivery?.driverName)?.delivery?.driverName ?? null;

  // Eixos: plataforma, entrega (se houve) e cada mercado do pedido.
  const rows = useMemo<AxisRow[]>(() => {
    if (!tracking) return [];
    const r: AxisRow[] = [
      {
        key: "platform",
        title: "MarketHub",
        subtitle: "(sua experiência em geral na plataforma)",
        axis: "platform",
      },
    ];
    if (tracking.hasDelivery && driver) {
      r.push({
        key: "delivery",
        title: "Entrega",
        subtitle: "(tempo de entrega, qualidade do atendimento, etc)",
        axis: "delivery",
      });
    }
    const seen = new Set<string>();
    for (const g of tracking.groups) {
      if (seen.has(g.merchantId)) continue;
      seen.add(g.merchantId);
      r.push({
        key: `merchant:${g.merchantId}`,
        title: g.merchantName,
        subtitle: "(tempo de preparo, embalagem, etc)",
        axis: "merchant",
        merchantId: g.merchantId,
      });
    }
    return r;
  }, [tracking, driver]);

  const doneFor = (row: AxisRow): Review | undefined =>
    done.find((r) =>
      row.axis === "merchant"
        ? r.axis === "merchant" && r.targetMerchantId === row.merchantId
        : r.axis === row.axis,
    );

  const pendingRated = rows.filter((r) => !doneFor(r) && (ratings[r.key] ?? 0) > 0);
  const canConclude = pendingRated.length > 0 || (tipChecked && !tip);

  async function conclude() {
    setBusy(true);
    try {
      for (const row of pendingRated) {
        const r = await mkt.createReview(id, {
          axis: row.axis,
          rating: ratings[row.key]!,
          comment: comment.trim() || undefined,
          merchantId: row.merchantId,
        });
        setDone((d) => [...d, r]);
      }
      if (tipChecked && !tip && tipCents > 0) {
        setTip(await mkt.createTip(id, tipCents));
      }
      setFinished(true);
    } finally {
      setBusy(false);
    }
  }

  async function payTip() {
    setBusy(true);
    try {
      await mkt.mockPayTip(id);
      setTip(await mkt.tip(id));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.closeRow}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        {/* Cabeçalho "Tudo certo!" (ref: Order Completed.jpg) */}
        <View style={{ alignItems: "center", gap: spacing.md }}>
          <Text variant="h1">Tudo certo!</Text>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={64} color={colors.white} />
          </View>
          <Text muted>Avalie sua experiência</Text>
        </View>

        {/* Gorjeta ao entregador (S5.2) — só com entrega própria */}
        {tracking?.hasDelivery && driver && !tip && (
          <View style={styles.tipRow}>
            <Pressable style={styles.checkboxRow} onPress={() => setTipChecked((v) => !v)}>
              <View style={[styles.checkbox, tipChecked && styles.checkboxOn]}>
                {tipChecked && <Ionicons name="checkmark" size={14} color={colors.white} />}
              </View>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Gorjeta</Text>
            </Pressable>
            {tipChecked && (
              <QtyStepper
                label={brl(tipCents)}
                onDec={() => setTipCents((c) => Math.max(TIP_STEP_CENTS, c - TIP_STEP_CENTS))}
                onInc={() => setTipCents((c) => c + TIP_STEP_CENTS)}
              />
            )}
          </View>
        )}

        {rows.map((row) => {
          const existing = doneFor(row);
          return (
            <View key={row.key} style={{ gap: spacing.xs }}>
              <Text style={{ fontWeight: "700" }}>{row.title}</Text>
              <Text variant="caption" muted>{row.subtitle}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Stars
                  value={existing?.rating ?? ratings[row.key] ?? 0}
                  onChange={(v) => {
                    if (!existing) setRatings((r) => ({ ...r, [row.key]: v }));
                  }}
                />
                {existing && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
              </View>
            </View>
          );
        })}

        <TextInput
          style={styles.input}
          multiline
          placeholder="Enviar um comentário (opcional)"
          placeholderTextColor={colors.textMuted}
          value={comment}
          onChangeText={setComment}
        />

        {/* Cobrança da gorjeta após o Concluir */}
        {tip && tip.status !== "paid" && tip.qrCode && (
          <View style={styles.tipPayCard}>
            <Text variant="caption" muted>
              Gorjeta de {brl(tip.amountCents)} para {driver} — pague via PIX:
            </Text>
            <Text selectable style={styles.tipQr}>{tip.qrCode}</Text>
            <Button title="Já paguei (simular)" size="sm" disabled={busy} onPress={payTip} />
          </View>
        )}
        {tip?.status === "paid" && (
          <Text style={{ color: colors.success, fontWeight: "600", textAlign: "center" }}>
            Gorjeta de {brl(tip.amountCents)} enviada. Obrigado!
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {finished && !canConclude ? (
          <Button title="Fechar" variant="outline" onPress={() => router.back()} />
        ) : (
          <Button
            title="Concluir"
            variant="outline"
            disabled={!canConclude || busy}
            loading={busy}
            onPress={conclude}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  closeRow: { alignItems: "flex-end", paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  checkCircle: {
    width: 110,
    height: 110,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.md,
  },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.primary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    minHeight: 90,
    color: colors.text,
    textAlignVertical: "top",
  },
  tipPayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tipQr: {
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: radius.sm,
    fontSize: 11,
    color: colors.text,
  },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
});
