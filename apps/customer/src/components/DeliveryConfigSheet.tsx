import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
          <RangeSlider
            value={radiusKm}
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            disabled={!radiusEnabled}
            onChange={onRadiusKm}
          />
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

const THUMB = 22;

/**
 * Slider de raio cross-platform (web + nativo) via PanResponder — comportamento de
 * `<input type="range">`: arrastar move o thumb e a bolha em tempo real; commit do
 * valor (onChange) ao soltar. O `@react-native-community/slider` não recebe gesto no web.
 */
function RangeSlider({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const [display, setDisplay] = useState(value);
  const [trackW, setTrackW] = useState(0);
  const [bubbleW, setBubbleW] = useState(0);
  const areaRef = useRef<View>(null);
  const trackWRef = useRef(0);
  const offsetXRef = useRef(0); // posição da área na janela, p/ converter X absoluto → local
  useEffect(() => setDisplay(value), [value]);
  useEffect(() => {
    trackWRef.current = trackW;
  }, [trackW]);

  // X absoluto (pageX/moveX) → valor; mede o offset da área pra não depender de
  // locationX (que no web vem relativo ao elemento tocado, ex.: o thumb).
  const valueFromPageX = (pageX: number): number => {
    const w = trackWRef.current || 1;
    const local = pageX - offsetXRef.current;
    const frac = Math.max(0, Math.min(1, (local - THUMB / 2) / (w - THUMB)));
    return Math.round(min + frac * (max - min));
  };
  const measure = () => areaRef.current?.measureInWindow((x) => (offsetXRef.current = x));

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          measure();
          setDisplay(valueFromPageX(e.nativeEvent.pageX));
        },
        onPanResponderMove: (_e, g) => setDisplay(valueFromPageX(g.moveX)),
        onPanResponderRelease: (_e, g) => {
          const v = valueFromPageX(g.moveX);
          setDisplay(v);
          onChange(v);
        },
      }),
    // trackW/offset lidos via ref; recria só quando muda disabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled],
  );

  const frac = (display - min) / (max - min);
  const thumbLeft = frac * (trackW - THUMB);
  const thumbCenter = thumbLeft + THUMB / 2;
  const fillW = thumbCenter;
  const bubbleLeft = Math.max(0, Math.min(trackW - bubbleW, thumbCenter - bubbleW / 2));

  return (
    <View
      ref={areaRef}
      style={[styles.sliderArea, disabled && { opacity: 0.4 }]}
      onLayout={(e: LayoutChangeEvent) => {
        setTrackW(e.nativeEvent.layout.width);
        measure();
      }}
      {...pan.panHandlers}
    >
      <View
        style={[styles.bubble, { left: bubbleLeft }]}
        onLayout={(e: LayoutChangeEvent) => setBubbleW(e.nativeEvent.layout.width)}
      >
        <Text style={styles.bubbleText}>{display}km</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: fillW }]} />
      </View>
      <View style={[styles.thumb, { left: thumbLeft }]} />
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
  sliderArea: { flex: 1, height: 46 },
  track: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: { height: 4, backgroundColor: colors.primary },
  thumb: {
    position: "absolute",
    top: 15,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
  },
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
