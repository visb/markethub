import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, colors, radius } from "@markethub/ui";

interface QtyStepperProps {
  label: string; // "1" ou "300g"
  onDec: () => void;
  onInc: () => void;
}

/** Stepper boxed vermelho: [ − | valor | + ] como nos screenshots. */
export function QtyStepper({ label, onDec, onInc }: QtyStepperProps) {
  return (
    <View style={styles.box}>
      <Pressable style={styles.btn} hitSlop={6} onPress={onDec}>
        <Text style={styles.sign}>−</Text>
      </Pressable>
      <View style={styles.value}>
        <Text style={styles.valueText}>{label}</Text>
      </View>
      <Pressable style={styles.btn} hitSlop={6} onPress={onInc}>
        <Text style={styles.sign}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    overflow: "hidden",
    height: 40, // paridade com Button size="sm" (packages/ui Button.tsx)
  },
  // botões quadrados nas extremidades; paddingBottom fino centra oticamente o glifo −/+
  btn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 2,
  },
  sign: { color: colors.primary, fontSize: 20, fontWeight: "600" },
  value: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 6,
  },
  valueText: { color: colors.text, fontWeight: "600" },
});
