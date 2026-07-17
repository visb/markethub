import React from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    // Política mínima = mesma do registro (min 8).
    newPassword: z.string().min(8, "A nova senha precisa de pelo menos 8 caracteres"),
    confirm: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ["confirm"],
    message: "As senhas não conferem",
  });
type PasswordFormValues = z.infer<typeof schema>;

interface Props {
  submitting?: boolean;
  error?: string | null;
  /** Rejeição mantém os campos p/ correção; sucesso limpa o form. */
  onSubmit: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
}

const EMPTY: PasswordFormValues = { currentPassword: "", newPassword: "", confirm: "" };

/**
 * Seção "Segurança" da conta (story 70): troca de senha com senha atual, nova e
 * confirmação (react-hook-form + zod com Controller). No sucesso o form é limpo
 * — o toast de confirmação fica com a tela.
 */
export function ChangePasswordForm({ submitting, error, onSubmit }: Props) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const submit = handleSubmit(async (v) => {
    try {
      await onSubmit({ currentPassword: v.currentPassword, newPassword: v.newPassword });
      reset(EMPTY);
    } catch {
      // erro exibido via prop `error` (a tela mapeia a mutation)
    }
  });

  const field = (
    name: keyof PasswordFormValues,
    placeholder: string,
    accessibilityLabel: string,
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          editable={!submitting}
          accessibilityLabel={accessibilityLabel}
        />
      )}
    />
  );

  return (
    <View style={{ gap: spacing.sm }}>
      {field("currentPassword", "Senha atual", "Senha atual")}
      {errors.currentPassword && <Text style={styles.error}>{errors.currentPassword.message}</Text>}

      {field("newPassword", "Nova senha", "Nova senha")}
      {errors.newPassword && <Text style={styles.error}>{errors.newPassword.message}</Text>}

      {field("confirm", "Confirmar nova senha", "Confirmar nova senha")}
      {errors.confirm && <Text style={styles.error}>{errors.confirm.message}</Text>}

      {error && <Text style={styles.error}>{error}</Text>}

      <Button
        title="Alterar senha"
        variant="outline"
        disabled={submitting}
        loading={submitting}
        onPress={() => void submit()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 12 },
});
