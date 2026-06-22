import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { DriverVehicleDTO } from "@markethub/api-client";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { vehicleIcon, vehicleLabel } from "@/vehicle";

interface Props {
  vehicle: DriverVehicleDTO | null | undefined;
  /** Toque no indicador → abre o seletor (clique 1 do fluxo de ≤2 cliques). */
  onPress: () => void;
}

/**
 * Indicador do veículo selecionado na home. Tocável: abre o seletor de veículo.
 * Quando não há veículo, convida a selecionar.
 */
export function VehicleIndicator({ vehicle, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        vehicle ? `Trocar veículo (atual ${vehicle.plate})` : "Selecionar veículo"
      }
      style={styles.card}
      onPress={onPress}
    >
      <Text style={styles.icon}>{vehicle ? vehicleIcon(vehicle.type) : "🚙"}</Text>
      <View style={{ flex: 1 }}>
        <Text muted variant="caption">
          Veículo do turno
        </Text>
        {vehicle ? (
          <Text style={{ fontWeight: "700" }}>
            {vehicle.plate} · {vehicleLabel(vehicle.type)}
          </Text>
        ) : (
          <Text style={{ fontWeight: "700", color: colors.primary }}>Selecionar veículo</Text>
        )}
      </View>
      <Text style={{ color: colors.primary, fontWeight: "700" }}>Trocar</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  icon: { fontSize: 24 },
});
