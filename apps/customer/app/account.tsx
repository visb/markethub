import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { BottomTabs } from "@/components/BottomTabs";

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [
    { icon: "receipt-outline", label: "Minhas compras", onPress: () => router.push("/orders") },
    { icon: "heart-outline", label: "Favoritos", onPress: () => router.push("/favorites") },
    { icon: "location-outline", label: "Endereços", onPress: () => router.push("/delivery") },
    { icon: "log-out-outline", label: "Sair", onPress: () => void logout() },
  ];

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color={colors.white} />
        </View>
        <View>
          <Text variant="h2">{user?.name}</Text>
          <Text muted>{user?.email}</Text>
        </View>
      </View>

      <View style={{ padding: spacing.md, gap: spacing.sm }}>
        {rows.map((r) => (
          <Pressable key={r.label} style={styles.row} onPress={r.onPress}>
            <Ionicons name={r.icon} size={22} color={colors.primary} />
            <Text style={{ flex: 1 }}>{r.label}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>

      <View style={{ flex: 1 }} />
      <BottomTabs active="account" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
