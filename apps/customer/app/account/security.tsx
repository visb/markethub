import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@markethub/api-client";
import { colors, spacing } from "@markethub/ui";
import { useChangePassword } from "@/api/hooks/useAccount";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Header } from "@/components/Header";
import { useToast } from "@/components/Toast";

/** Mensagem exibível de um erro de mutation (body pt-BR da API quando houver). */
function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof ApiClientError) return err.body.message;
  return "Algo deu errado. Tente novamente.";
}

/**
 * "Segurança" (story 78): tela dedicada para troca de senha. Só orquestra — a
 * mutation vive no hook useChangePassword e o form no componente
 * ChangePasswordForm. Sucesso mostra toast; erro da API aparece inline no form.
 */
export default function SecurityScreen() {
  const toast = useToast();
  const changePassword = useChangePassword();

  const savePassword = async (input: { currentPassword: string; newPassword: string }) => {
    await changePassword.mutateAsync(input);
    toast.show("Senha alterada ✓");
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Segurança" />
      <ScrollView contentContainerStyle={styles.content}>
        <ChangePasswordForm
          submitting={changePassword.isPending}
          error={errorMessage(changePassword.error)}
          onSubmit={savePassword}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
});
