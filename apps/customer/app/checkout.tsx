import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Screen, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { marketplace, type Address } from "@/api/marketplace";

type Method = "gate" | "door";

export default function CheckoutScreen() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>("gate");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [form, setForm] = useState({ label: "Casa", street: "", number: "", city: "", state: "", zipCode: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await mkt.addresses();
      setAddresses(list);
      setSelected(list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addAddress() {
    const a = await mkt.addAddress(form);
    setAddresses((prev) => [a, ...prev]);
    setSelected(a.id);
  }

  async function place() {
    if (!selected) return;
    setPlacing(true);
    try {
      const order = await mkt.checkout({ addressId: selected, deliveryMethod: method });
      router.replace(`/payment/${order.id}`);
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="h2">Finalizar compra</Text>

      <Text variant="caption" muted style={{ marginTop: spacing.lg }}>
        Endereço de entrega
      </Text>
      {addresses.map((a) => (
        <Pressable key={a.id} onPress={() => setSelected(a.id)} style={[styles.option, selected === a.id && styles.optionActive]}>
          <Text>
            {a.label} · {a.street}, {a.number}
          </Text>
        </Pressable>
      ))}

      {addresses.length === 0 && (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {(["street", "number", "city", "state", "zipCode"] as const).map((f) => (
            <TextInput
              key={f}
              style={styles.input}
              placeholder={f}
              value={form[f]}
              onChangeText={(v) => setForm({ ...form, [f]: v })}
              placeholderTextColor={colors.textMuted}
            />
          ))}
          <Button title="Salvar endereço" variant="secondary" onPress={addAddress} />
        </View>
      )}

      <Text variant="caption" muted style={{ marginTop: spacing.lg }}>
        Como entregar
      </Text>
      <Pressable onPress={() => setMethod("gate")} style={[styles.option, method === "gate" && styles.optionActive]}>
        <Text>Vou receber na portaria/portão</Text>
      </Pressable>
      <Pressable onPress={() => setMethod("door")} style={[styles.option, method === "door" && styles.optionActive]}>
        <Text>Entregar na minha porta (+R$4,00)</Text>
      </Pressable>

      <View style={{ flex: 1 }} />
      <Button title="Ir para pagamento" loading={placing} onPress={place} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
});
