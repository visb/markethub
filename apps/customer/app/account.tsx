import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ApiClientError } from "@markethub/api-client";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { useChangePassword, useMe, useUpdateMe } from "@/api/hooks/useAccount";
import { BottomTabs } from "@/components/BottomTabs";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { ProfileForm, type ProfilePatch } from "@/components/ProfileForm";
import { useToast } from "@/components/Toast";

/** Mensagem exibível de um erro de mutation (body pt-BR da API quando houver). */
function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof ApiClientError) return err.body.message;
  return "Algo deu errado. Tente novamente.";
}

/**
 * Conta do cliente (story 70): "Meus dados" (nome/telefone editáveis, e-mail
 * read-only), "Segurança" (troca de senha) e navegação (compras, favoritos,
 * endereços, sair). A tela só orquestra — fetch/mutations nos hooks de
 * useAccount, formulários nos componentes.
 */
export default function AccountScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const me = useMe();
  const updateMe = useUpdateMe();
  const changePassword = useChangePassword();

  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [
    { icon: "receipt-outline", label: "Minhas compras", onPress: () => router.push("/orders") },
    { icon: "heart-outline", label: "Favoritos", onPress: () => router.push("/favorites") },
    // Livro de endereços dedicado fica na story 71 — por ora leva à tela de entrega.
    { icon: "location-outline", label: "Endereços", onPress: () => router.push("/delivery") },
    { icon: "log-out-outline", label: "Sair", onPress: () => void logout() },
  ];

  const saveProfile = (patch: ProfilePatch) =>
    updateMe.mutateAsync(patch).then(
      () => toast.show("Dados atualizados ✓"),
      () => undefined, // erro exibido inline no form via updateMe.error
    );

  const savePassword = async (input: { currentPassword: string; newPassword: string }) => {
    await changePassword.mutateAsync(input);
    toast.show("Senha alterada ✓");
  };

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

        <View style={styles.section}>
          <Text variant="title">Meus dados</Text>
          {me.data ? (
            <ProfileForm
              me={me.data}
              saving={updateMe.isPending}
              error={errorMessage(updateMe.error)}
              onSubmit={saveProfile}
            />
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>

        <View style={styles.section}>
          <Text variant="title">Segurança</Text>
          <ChangePasswordForm
            submitting={changePassword.isPending}
            error={errorMessage(changePassword.error)}
            onSubmit={savePassword}
          />
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
  section: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
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
