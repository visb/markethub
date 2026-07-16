import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { PickerMetricsPeriodDTO } from "@markethub/api-client";
import { Button, Screen, Text, colors, radius, spacing } from "@markethub/ui";
import { usePickerMetrics } from "@/api/hooks/usePickerMetrics";

const PERIODS: { key: PickerMetricsPeriodDTO; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

/** Taxa em fração 0..1 → percentual exibível; null (sem dado) → traço. */
function pct(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1).replace(".", ",")}%`;
}

/**
 * "Meu desempenho" (story 65): métricas próprias do separador por período fixo
 * (hoje/7d/30d — mesma convenção dos ganhos do driver). Sem ranking entre
 * pickers — só os próprios números. A tela orquestra o hook; sem fetch inline.
 */
export default function MetricsScreen() {
  const router = useRouter();
  // Estado de UI local: período selecionado (server-state vai pra React Query).
  const [period, setPeriod] = useState<PickerMetricsPeriodDTO>("today");
  const metricsQuery = usePickerMetrics(period);
  const data = metricsQuery.data;
  const empty = data != null && data.tasksCompleted === 0;

  return (
    <Screen>
      <View style={styles.top}>
        <Text muted variant="caption">
          Separador
        </Text>
        <Text variant="h1">Meu desempenho</Text>
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

      <ScrollView style={{ flex: 1 }}>
        {metricsQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : metricsQuery.isError ? (
          <Text style={{ color: colors.danger, marginTop: spacing.md }}>
            Erro ao carregar as métricas.
          </Text>
        ) : empty ? (
          <Text muted style={{ marginTop: spacing.lg }}>
            Nenhuma separação no período.
          </Text>
        ) : (
          data && (
            <>
              {/* Cards de volume/ritmo */}
              <View style={styles.cards}>
                <View style={styles.card}>
                  <Text muted variant="caption">
                    Tarefas
                  </Text>
                  <Text variant="h1">{data.tasksCompleted}</Text>
                </View>
                <View style={styles.card}>
                  <Text muted variant="caption">
                    Itens
                  </Text>
                  <Text variant="h1">{data.itemsPicked}</Text>
                </View>
                <View style={styles.card}>
                  <Text muted variant="caption">
                    Itens/hora
                  </Text>
                  <Text variant="h1">
                    {data.itemsPerHour == null ? "—" : String(data.itemsPerHour).replace(".", ",")}
                  </Text>
                </View>
              </View>

              {/* Taxas de exceção */}
              <View style={styles.rateRow}>
                <Text>Taxa de substituição</Text>
                <Text style={{ fontWeight: "700" }}>{pct(data.substitutionRate)}</Text>
              </View>
              <View style={styles.rateRow}>
                <Text>Taxa de recusa</Text>
                <Text style={{ fontWeight: "700" }}>{pct(data.refusalRate)}</Text>
              </View>
            </>
          )
        )}
      </ScrollView>

      <Button title="Voltar" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { marginTop: spacing.lg, marginBottom: spacing.md },
  center: { paddingVertical: spacing.lg, alignItems: "center" },
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
  cards: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  card: {
    flex: 1,
    minWidth: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
