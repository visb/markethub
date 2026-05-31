import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, colors, radius, spacing } from "@markethub/ui";

interface SelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Select cross-platform: campo + modal com a lista de opções. */
export function Select({ value, options, onChange, placeholder }: SelectProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={!value ? { color: colors.textMuted } : undefined}>
          {value || placeholder || "Selecione…"}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {options.map((opt) => {
              const selected = opt === value;
              return (
                <Pressable
                  key={opt}
                  style={styles.option}
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  <Text style={selected ? { color: colors.primary, fontWeight: "700" } : undefined}>
                    {opt}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingVertical: spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
