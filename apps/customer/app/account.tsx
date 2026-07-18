import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { useMe } from "@/api/hooks/useAccount";
import { BottomTabs } from "@/components/BottomTabs";

/**
 * Conta do cliente (story 70 → 78): hub de navegação. "Meus dados" e "Segurança"
 * viraram itens de menu com tela própria (app/account/profile e
 * app/account/security); a conta só orquestra header (useMe p/ nome/e-mail) e a
 * lista de linhas. Fetch/mutations de perfil e senha vivem nas telas de destino.
 */
export default function AccountScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const me = useMe();

  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [
    { icon: "person-outline", label: "Meus dados", onPress: () => router.push("/account/profile") },
    {
      icon: "shield-checkmark-outline",
      label: "Segurança",
      onPress: () => router.push("/account/security"),
    },
    { icon: "receipt-outline", label: "Minhas compras", onPress: () => router.push("/orders") },
    { icon: "heart-outline", label: "Favoritos", onPress: () => router.push("/favorites") },
    // Livro de endereços dedicado (story 71).
    { icon: "location-outline", label: "Endereços", onPress: () => router.push("/addresses") },
    { icon: "log-out-outline", label: "Sair", onPress: () => void logout() },
  ];

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={28} color={colors.white} />
          </View>
          <View>
            <Text variant="h2">{me.data?.name ?? user?.name}</Text>
            <Text muted>{me.data?.email ?? user?.email}</Text>
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
      </ScrollView>
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
