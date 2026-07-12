import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import type { EarningsPeriodDTO } from "@markethub/api-client";
import { brl } from "@/format";
import { useDeliveryHistory, useDriverEarnings } from "@/api/hooks/useDriverEarnings";

const PERIODS: { key: EarningsPeriodDTO; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

const TIP_STATUS_LABEL: Record<string, string> = {
  paid: "Recebida",
  pending: "Pendente",
  failed: "Falhou",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function EarningsScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<EarningsPeriodDTO>("today");
  const earningsQuery = useDriverEarnings(period);
  const history = useDeliveryHistory();

  const data = earningsQuery.data;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
    >
      <View style={styles.top}>
        <Text muted variant="caption">
          Entregador
        </Text>
        <Text variant="h1">Meus ganhos</Text>
      </View>

      {/* Seletor de período */}
      <View style={styles.chips}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            testID={`period-${p.key}`}
            style={[styles.chip, period === p.key && styles.chipOn]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={period === p.key ? styles.chipOnText : undefined}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Cards de resumo */}
      {earningsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : earningsQuery.isError ? (
        <Text style={{ color: colors.danger, marginTop: spacing.md }}>Erro ao carregar os ganhos.</Text>
      ) : (
        <View style={styles.cards}>
          <View style={[styles.card, styles.cardWide]}>
            <Text muted variant="caption">
              Gorjetas recebidas
            </Text>
            <Text variant="h1">{brl(data?.tipsPaidCents ?? 0)}</Text>
            {(data?.tipsPendingCents ?? 0) > 0 && (
              <Text muted variant="caption" style={{ marginTop: 4 }}>
                {brl(data?.tipsPendingCents ?? 0)} pendente(s)
              </Text>
            )}
          </View>
          <View style={styles.card}>
            <Text muted variant="caption">
              Entregas
            </Text>
            <Text variant="h1">{data?.deliveriesCompleted ?? 0}</Text>
          </View>
        </View>
      )}

      {/* Histórico */}
      <Text variant="title" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        Histórico de entregas
      </Text>

      {history.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : history.isError ? (
        <Text style={{ color: colors.danger }}>Erro ao carregar o histórico.</Text>
      ) : history.items.length === 0 ? (
        <Text muted>Você ainda não concluiu nenhuma entrega.</Text>
      ) : (
        <>
          {history.items.map((h) => (
            <View key={h.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600" }}>
                  #{h.orderId.slice(-6)} · {h.storeName}
                </Text>
                {h.destinationArea && (
                  <Text muted variant="caption">
                    {h.destinationArea}
                  </Text>
                )}
                <Text muted variant="caption">
                  {fmtDate(h.date)} · {h.status === "delivered" ? "Entregue" : "Cancelada"}
                </Text>
              </View>
              {h.tip && (
                <View style={styles.tip}>
                  <Text style={{ fontWeight: "700", color: colors.primary }}>{brl(h.tip.amountCents)}</Text>
                  <Text muted variant="caption">
                    {TIP_STATUS_LABEL[h.tip.status] ?? h.tip.status}
                  </Text>
                </View>
              )}
            </View>
          ))}
          {history.hasMore && (
            <Button
              title={history.isLoadingMore ? "Carregando…" : "Carregar mais"}
              variant="secondary"
              onPress={history.loadMore}
              disabled={history.isLoadingMore}
              style={{ marginTop: spacing.md }}
            />
          )}
        </>
      )}

      <Button
        title="Voltar"
        variant="secondary"
        onPress={() => router.back()}
        style={{ marginTop: spacing.xl }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { paddingVertical: spacing.lg, alignItems: "center" },
  top: { marginTop: spacing.lg, marginBottom: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipOnText: { color: colors.white, fontWeight: "700" },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  card: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardWide: { minWidth: 180 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tip: { alignItems: "flex-end" },
});
