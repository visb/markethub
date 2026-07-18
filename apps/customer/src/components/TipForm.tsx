import React, { useMemo } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Ionicons } from "@expo/vector-icons";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { brl, type TipItemInput, type TipTarget, type TipTargets } from "@/api/marketplace";

/** Valor monetário inicial de cada linha (R$ 2,00). */
const DEFAULT_AMOUNT = "2,00";

/** Linha de gorjeta: um alvo do pedido (plataforma, entregador ou um mercado). */
interface TipRow {
  key: string;
  target: TipTarget;
  targetId?: string;
  title: string;
  subtitle: string;
}

/** "2,00" → 200 centavos. Aceita ponto de milhar e vírgula decimal; inválido → 0. */
export function parseAmountCents(input: string): number {
  const normalized = input.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

/** Monta as linhas a partir dos alvos do pedido — entregador só com entrega própria. */
function buildRows(targets: TipTargets): TipRow[] {
  const rows: TipRow[] = [
    { key: "platform", target: "platform", title: "MarketHub", subtitle: "Plataforma" },
  ];
  if (targets.hasDelivery) {
    rows.push({
      key: "driver",
      target: "driver",
      title: targets.driverName ?? "Entregador",
      subtitle: "Entrega",
    });
  }
  for (const m of targets.merchants) {
    rows.push({
      key: `merchant:${m.merchantId}`,
      target: "merchant",
      targetId: m.merchantId,
      title: m.merchantName,
      subtitle: "Mercado",
    });
  }
  return rows;
}

const schema = z.object({
  items: z.array(z.object({ checked: z.boolean(), amount: z.string() })),
});
type TipFormValues = z.infer<typeof schema>;

interface Props {
  targets: TipTargets;
  submitting?: boolean;
  onSubmit: (items: TipItemInput[]) => void;
}

/**
 * Gorjeta individual por alvo (story 77). Cada linha (Plataforma, Entregador se
 * houve entrega, cada Mercado) vem marcada por padrão com R$ 2,00 editável. O
 * rodapé soma as linhas marcadas e um único botão gera a cobrança PIX do total.
 * react-hook-form + zod + Controller (RN não suporta register).
 */
export function TipForm({ targets, submitting, onSubmit }: Props) {
  const rows = useMemo(() => buildRows(targets), [targets]);
  const { control, handleSubmit, watch } = useForm<TipFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { items: rows.map(() => ({ checked: true, amount: DEFAULT_AMOUNT })) },
  });

  const values = watch("items");
  const totalCents = rows.reduce((sum, _row, i) => {
    const v = values?.[i];
    return v?.checked ? sum + parseAmountCents(v.amount) : sum;
  }, 0);

  const submit = handleSubmit((form) => {
    const items: TipItemInput[] = [];
    rows.forEach((row, i) => {
      const v = form.items[i];
      const cents = parseAmountCents(v.amount);
      if (v.checked && cents > 0) {
        items.push({ target: row.target, targetId: row.targetId, amountCents: cents });
      }
    });
    if (items.length === 0) return;
    onSubmit(items);
  });

  return (
    <View style={styles.wrap} testID="tip-form">
      <Text style={styles.heading}>Deixe uma gorjeta</Text>
      {rows.map((row, i) => (
        <View key={row.key} style={styles.row} testID={`tip-row-${row.key}`}>
          <Controller
            control={control}
            name={`items.${i}.checked`}
            render={({ field: { value, onChange } }) => (
              <Pressable
                style={styles.checkRow}
                testID={`tip-check-${row.key}`}
                onPress={() => onChange(!value)}
              >
                <View style={[styles.checkbox, value && styles.checkboxOn]}>
                  {value && <Ionicons name="checkmark" size={14} color={colors.white} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text variant="caption" muted>
                    {row.subtitle}
                  </Text>
                </View>
              </Pressable>
            )}
          />
          <Controller
            control={control}
            name={`items.${i}.amount`}
            render={({ field: { value, onChange, onBlur } }) => (
              <View style={styles.amountBox}>
                <Text style={styles.currency}>R$</Text>
                <TextInput
                  testID={`tip-amount-${row.key}`}
                  style={styles.amountInput}
                  keyboardType="numeric"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  editable={values?.[i]?.checked ?? true}
                  placeholder="0,00"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}
          />
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.total} testID="tip-total">
          Total: {brl(totalCents)}
        </Text>
        <Button
          title="Dar gorjeta"
          testID="tip-submit"
          disabled={totalCents <= 0 || submitting}
          loading={submitting}
          onPress={submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  heading: { fontWeight: "700", color: colors.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.primary },
  rowTitle: { fontWeight: "600", color: colors.text },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
    minWidth: 96,
  },
  currency: { color: colors.textMuted },
  amountInput: { flex: 1, paddingVertical: spacing.sm, color: colors.text, textAlign: "right" },
  footer: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  total: { fontWeight: "700", color: colors.text, textAlign: "right" },
});
