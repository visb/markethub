import React from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { formatPhoneBR, onlyDigits } from "@/lib/phone";

const schema = z.object({
  name: z.string().trim().min(1, "Informe seu nome"),
  phone: z.string().refine((v) => {
    const d = onlyDigits(v);
    return d.length === 0 || d.length === 10 || d.length === 11;
  }, "Telefone inválido — use DDD + número (10 ou 11 dígitos)"),
});
type ProfileFormValues = z.infer<typeof schema>;

/** PATCH parcial: só os campos alterados; `phone: null` limpa o telefone. */
export interface ProfilePatch {
  name?: string;
  phone?: string | null;
}

interface Props {
  me: { name: string; email: string; phone: string | null };
  saving?: boolean;
  error?: string | null;
  onSubmit: (patch: ProfilePatch) => void | Promise<void>;
}

/**
 * Seção "Meus dados" da conta (story 70): nome e telefone editáveis
 * (react-hook-form + zod com Controller — RN não suporta register), e-mail
 * read-only (identidade de login; troca fica fora do escopo). No submit envia
 * apenas o diff (PATCH parcial padrão do repo); telefone vai só-dígitos.
 */
export function ProfileForm({ me, saving, error, onSubmit }: Props) {
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    // `values` mantém o form sincronizado ao servidor: após salvar, o cache
    // atualizado re-renderiza com o novo baseline e o dirty zera.
    values: { name: me.name, phone: me.phone ? formatPhoneBR(me.phone) : "" },
  });

  const submit = handleSubmit((v) => {
    const patch: ProfilePatch = {};
    const name = v.name.trim();
    if (name !== me.name) patch.name = name;
    const digits = onlyDigits(v.phone);
    if (digits !== (me.phone ?? "")) patch.phone = digits === "" ? null : digits;
    if (Object.keys(patch).length === 0) return;
    return onSubmit(patch);
  });

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="caption" muted>
        Nome
      </Text>
      <Controller
        control={control}
        name="name"
        render={({ field: { value, onChange } }) => (
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChange}
            placeholder="Seu nome"
            placeholderTextColor={colors.textMuted}
            editable={!saving}
            accessibilityLabel="Nome"
          />
        )}
      />
      {errors.name && <Text style={styles.error}>{errors.name.message}</Text>}

      <Text variant="caption" muted>
        Telefone
      </Text>
      <Controller
        control={control}
        name="phone"
        render={({ field: { value, onChange } }) => (
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={(raw) => onChange(formatPhoneBR(raw))}
            placeholder="(41) 99999-9999"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            editable={!saving}
            accessibilityLabel="Telefone"
          />
        )}
      />
      {errors.phone && <Text style={styles.error}>{errors.phone.message}</Text>}

      <Text variant="caption" muted>
        E-mail
      </Text>
      {/* E-mail NÃO editável — exibição pura, sem input. */}
      <View style={styles.readonly} accessibilityLabel="E-mail (não editável)">
        <Text muted>{me.email}</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Button
        title="Salvar alterações"
        variant="outline"
        disabled={!isDirty || !!saving}
        loading={saving}
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
  readonly: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    backgroundColor: colors.background,
    opacity: 0.7,
  },
  error: { color: colors.danger, fontSize: 12 },
});
