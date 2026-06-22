import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import type { DriverVehicleDTO } from "@markethub/api-client";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { vehicleIcon, vehicleLabel } from "@/vehicle";

interface Props {
  vehicles: DriverVehicleDTO[];
  /** id do veículo atualmente selecionado (destacado na lista). */
  selectedId?: string | null;
  /** id em processo de seleção (mostra estado de carregando na linha). */
  pendingId?: string | null;
  loading?: boolean;
  error?: string | null;
  onSelect: (vehicleId: string) => void;
}

/**
 * Lista de veículos da rede para o entregador escolher. Toque numa linha = seleção
 * (clique de confirmação no fluxo de ≤2 cliques). Estado de UI local; server-state
 * vem dos hooks React Query.
 */
export function VehiclePicker({
  vehicles,
  selectedId,
  pendingId,
  loading,
  error,
  onSelect,
}: Props) {
  if (loading) {
    return (
      <View style={styles.center} accessibilityLabel="carregando veículos">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (error) {
    return <Text style={{ color: colors.danger }}>{error}</Text>;
  }
  if (vehicles.length === 0) {
    return <Text muted>Nenhum veículo disponível na sua rede.</Text>;
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {vehicles.map((v) => {
        const selected = v.id === selectedId;
        return (
          <Pressable
            key={v.id}
            accessibilityRole="button"
            accessibilityLabel={`Selecionar ${vehicleLabel(v.type)} ${v.plate}`}
            disabled={pendingId !== null && pendingId !== undefined}
            style={[styles.row, selected && styles.rowSelected]}
            onPress={() => onSelect(v.id)}
          >
            <Text style={styles.icon}>{vehicleIcon(v.type)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700" }}>{v.plate}</Text>
              <Text muted variant="caption">
                {vehicleLabel(v.type)}
                {v.description ? ` · ${v.description}` : ""}
              </Text>
            </View>
            {pendingId === v.id ? (
              <ActivityIndicator color={colors.primary} />
            ) : selected ? (
              <Text style={{ color: colors.primary, fontWeight: "700" }}>✓</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.lg, alignItems: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  icon: { fontSize: 24 },
});
