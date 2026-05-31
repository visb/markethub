import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, colors, spacing } from "@markethub/ui";

type TabKey = "home" | "explore" | "account";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; route: string }[] = [
  { key: "home", label: "HOME", icon: "home-outline", route: "/home" },
  { key: "explore", label: "EXPLORAR", icon: "compass-outline", route: "/explore" },
  { key: "account", label: "MINHA CONTA", icon: "person-outline", route: "/account" },
];

/** Tab bar inferior das telas principais (Home / Explorar / Minha conta). */
export function BottomTabs({ active }: { active: TabKey }) {
  const router = useRouter();
  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        const color = isActive ? colors.primary : colors.textMuted;
        return (
          <Pressable
            key={t.key}
            style={styles.tab}
            onPress={() => {
              if (!isActive) router.replace(t.route);
            }}
          >
            <Ionicons name={t.icon} size={24} color={color} />
            <Text style={[styles.label, { color }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  label: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
});
