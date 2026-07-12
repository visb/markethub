import React from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { DeliveryFailReasonDTO, FailDeliveryInput } from "@markethub/api-client";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";

/** Motivos de falha na entrega (story 61), na ordem exibida ao entregador. */
export const FAIL_REASONS: { value: DeliveryFailReasonDTO; label: string }[] = [
  { value: "customer_absent", label: "Cliente ausente" },
  { value: "wrong_address", label: "Endereço errado / não localizado" },
  { value: "refused", label: "Cliente recusou o pedido" },
  { value: "other", label: "Outro motivo" },
];

const schema = z.object({
  reason: z.enum(["customer_absent", "wrong_address", "refused", "other"], {
    required_error: "Escolha o motivo",
  }),
  note: z.string().trim().max(500).optional(),
});
type ProblemFormValues = z.infer<typeof schema>;

interface Props {
  visible: boolean;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: FailDeliveryInput) => void;
}

/**
 * Sheet de "Problema na entrega" (story 61): escolha de um dos 4 motivos +
 * observação opcional, com confirmação ("o pedido volta para a loja"). Formulário
 * com react-hook-form + zod (Controller no RN, CLAUDE.md). Só orquestra o form —
 * a mutation vive no hook, chamada via `onSubmit`.
 */
export function ProblemDeliverySheet({ visible, submitting, error, onClose, onSubmit }: Props) {
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProblemFormValues>({ resolver: zodResolver(schema) });

  const selected = watch("reason");

  const close = () => {
    reset({ reason: undefined, note: "" });
    onClose();
  };

  const submit = handleSubmit((values) => {
    onSubmit({ reason: values.reason, note: values.note?.trim() || undefined });
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text variant="title" style={{ marginBottom: spacing.xs }}>
            Problema na entrega
          </Text>
          <Text muted variant="caption" style={{ marginBottom: spacing.md }}>
            Escolha o que aconteceu. O pedido volta para a loja, que decide os próximos passos.
          </Text>

          <Controller
            control={control}
            name="reason"
            render={({ field: { value, onChange } }) => (
              <View style={{ gap: spacing.xs }}>
                {FAIL_REASONS.map((r) => {
                  const active = value === r.value;
                  return (
                    <Pressable
                      key={r.value}
                      accessibilityRole="button"
                      accessibilityLabel={r.label}
                      disabled={submitting}
                      style={[styles.reason, active && styles.reasonActive]}
                      onPress={() => onChange(r.value)}
                    >
                      <Text style={{ flex: 1, fontWeight: active ? "700" : "400" }}>{r.label}</Text>
                      {active && <Text style={{ color: colors.primary, fontWeight: "700" }}>✓</Text>}
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
          {errors.reason && (
            <Text style={{ color: colors.danger, marginTop: spacing.xs }}>{errors.reason.message}</Text>
          )}

          <Controller
            control={control}
            name="note"
            render={({ field: { value, onChange } }) => (
              <TextInput
                value={value ?? ""}
                onChangeText={onChange}
                placeholder="Observação (opcional)"
                placeholderTextColor={colors.textMuted}
                multiline
                editable={!submitting}
                style={styles.note}
              />
            )}
          />

          {error && <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{error}</Text>}

          <Button
            title="Confirmar problema"
            loading={submitting}
            disabled={!selected}
            onPress={submit}
            style={{ marginTop: spacing.md }}
          />
          <Button
            title="Voltar"
            variant="secondary"
            disabled={submitting}
            onPress={close}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  reason: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  reasonActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  note: {
    marginTop: spacing.md,
    minHeight: 64,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    textAlignVertical: "top",
  },
});
