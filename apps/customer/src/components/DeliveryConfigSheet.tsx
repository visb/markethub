import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { Text, colors, radius, spacing } from "@markethub/ui";
import type { Address } from "@/api/marketplace";
import { RADIUS_MAX, RADIUS_MIN, type FulfillmentMode } from "@/prefs";

/**
 * Bottom sheet "Configuração de entrega" (ref: Configuração de entrega.png):
 * tipo de recebimento, endereço atual (toque → lista de endereços) e slider do
 * raio de busca de mercados.
 */
export function DeliveryConfigSheet({
  visible,
  onClose,
  mode,
  onMode,
  address,
  onPressAddress,
  radiusKm,
  onRadiusKm,
}: {
  visible: boolean;
  onClose: () => void;
  mode: FulfillmentMode;
  onMode: (m: FulfillmentMode) => void;
  address: Address | null;
  onPressAddress: () => void;
  radiusKm: number;
  onRadiusKm: (km: number) => void;
}) {
  const radiusEnabled = address?.latitude != null && address?.longitude != null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.row}>
          <Radio label="Entregar" selected={mode === "deliver"} onPress={() => onMode("deliver")} />
          <Radio
            label="Retirar na loja"
            selected={mode === "pickup"}
            onPress={() => onMode("pickup")}
            green
          />
          <Pressable hitSlop={8} onPress={onClose} style={{ marginLeft: "auto" }}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <Pressable style={styles.addrRow} onPress={onPressAddress}>
          <Ionicons name="location-outline" size={18} color={colors.text} />
          <Text style={{ flex: 1 }} numberOfLines={1}>
            {address ? `${address.street}, ${address.number}` : "Adicionar endereço"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Text variant="caption" muted style={{ marginTop: spacing.md }}>
          Mercados nesta área
        </Text>
        <View style={styles.sliderRow}>
          <Text variant="caption" muted>
            {RADIUS_MIN}km
          </Text>
          <View style={{ flex: 1, alignItems: "center" }}>
            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>{radiusKm}km</Text>
            </View>
            <Slider
              style={{ alignSelf: "stretch" }}
              minimumValue={RADIUS_MIN}
              maximumValue={RADIUS_MAX}
              step={1}
              value={radiusKm}
              disabled={!radiusEnabled}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
              onSlidingComplete={onRadiusKm}
            />
          </View>
          <Text variant="caption" muted>
            {RADIUS_MAX}km
          </Text>
        </View>
        {!radiusEnabled && (
          <Text variant="caption" muted>
            Cadastre um endereço para filtrar mercados por distância.
          </Text>
        )}
      </View>
    </Modal>
  );
}

function Radio({
  label,
  selected,
  onPress,
  green,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  green?: boolean;
}) {
  const color = green ? colors.success : colors.primary;
  return (
    <Pressable style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }} onPress={onPress}>
      <View style={[styles.radio, { borderColor: selected ? color : colors.border }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: color }]} />}
      </View>
      <Text>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  addrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  sliderRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  bubble: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  bubbleText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: radius.full },
});
