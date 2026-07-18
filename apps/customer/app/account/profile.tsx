import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@markethub/api-client";
import { colors, spacing } from "@markethub/ui";
import { useMe, useUpdateMe } from "@/api/hooks/useAccount";
import { Header } from "@/components/Header";
import { ProfileForm, type ProfilePatch } from "@/components/ProfileForm";
import { useToast } from "@/components/Toast";

/** Mensagem exibível de um erro de mutation (body pt-BR da API quando houver). */
function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof ApiClientError) return err.body.message;
  return "Algo deu errado. Tente novamente.";
}

/**
 * "Meus dados" (story 78): tela dedicada para nome/telefone editáveis e e-mail
 * read-only. Só orquestra — fetch/mutation nos hooks de useAccount, form no
 * componente ProfileForm. Erro do PATCH fica inline no form; sucesso mostra toast.
 */
export default function ProfileScreen() {
  const toast = useToast();
  const me = useMe();
  const updateMe = useUpdateMe();

  const saveProfile = (patch: ProfilePatch) =>
    updateMe.mutateAsync(patch).then(
      () => toast.show("Dados atualizados ✓"),
      () => undefined, // erro exibido inline no form via updateMe.error
    );

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Meus dados" />
      <ScrollView contentContainerStyle={styles.content}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
});
