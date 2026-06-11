import React, { useEffect, useState } from "react";
import { LayoutChangeEvent, Modal, Pressable, StyleSheet, View } from "react-native";
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
  const hasCoords = address?.latitude != null && address?.longitude != null;
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
        <RadiusSlider value={radiusKm} onChange={onRadiusKm} />
        {!hasCoords && (
          <Text variant="caption" muted>
            Cadastre um endereço com localização para filtrar mercados por distância.
          </Text>
        )}
      </View>
    </Modal>
  );
}

const THUMB = 22;

/**
 * Slider do raio (5–25 km) com bolha de valor que segue o thumb em tempo real.
 * @react-native-community/slider funciona em web e nativo. A bolha é overlay
 * posicionado pela fração do valor; o slider sempre é interativo (o filtro por
 * distância só se aplica quando o endereço tem coordenadas).
 */
function RadiusSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [display, setDisplay] = useState(value);
  const [trackW, setTrackW] = useState(0);
  const [bubbleW, setBubbleW] = useState(0);
  useEffect(() => setDisplay(value), [value]);

  const frac = (display - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN);
  const thumbCenter = THUMB / 2 + frac * (trackW - THUMB);
  const bubbleLeft = Math.max(0, Math.min(trackW - bubbleW, thumbCenter - bubbleW / 2));

  return (
    <View style={styles.sliderRow}>
      <Text variant="caption" muted>
        {RADIUS_MIN}km
      </Text>
      <View
        style={styles.sliderArea}
        onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
      >
        <View
          style={[styles.bubble, { left: bubbleLeft }]}
          onLayout={(e: LayoutChangeEvent) => setBubbleW(e.nativeEvent.layout.width)}
        >
          <Text style={styles.bubbleText}>{display}km</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={RADIUS_MIN}
          maximumValue={RADIUS_MAX}
          step={1}
          value={value}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
          onValueChange={setDisplay}
          onSlidingComplete={onChange}
        />
      </View>
      <Text variant="caption" muted>
        {RADIUS_MAX}km
      </Text>
    </View>
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
  sliderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sliderArea: { flex: 1, height: 46, justifyContent: "flex-end" },
  slider: { alignSelf: "stretch", height: 40 },
  bubble: {
    position: "absolute",
    top: 0,
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
