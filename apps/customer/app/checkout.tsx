import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { marketplace, type Address } from "@/api/marketplace";
import { Header } from "@/components/Header";

type Method = "gate" | "door";
type When = "now" | "schedule";

export default function CheckoutScreen() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>("gate");
  const [when, setWhen] = useState<When>("now");
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
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <Header title="Finalizar compra" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  const addr = addresses.find((a) => a.id === selected);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Finalizar compra" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {/* Entrega */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="bicycle" size={20} color={colors.primary} />
            <Text style={{ flex: 1, fontWeight: "700" }}>Entrega</Text>
            <Text style={styles.link}>alterar endereço</Text>
          </View>
          {addr ? (
            <View style={styles.cardBody}>
              <Text>{addr.label}</Text>
              <Text muted>
                {addr.street}, {addr.number}
              </Text>
              <Text muted>
                {addr.city} - {addr.state}
              </Text>
            </View>
          ) : (
            <View style={[styles.cardBody, { gap: spacing.sm }]}>
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
              <Button title="Salvar endereço" variant="outline" onPress={addAddress} />
            </View>
          )}
        </View>

        {/* Como entregar */}
        <Text style={styles.sectionLabel}>Como entregar</Text>
        <View style={styles.card}>
          <Radio label="Vou receber na portaria/portão" selected={method === "gate"} onPress={() => setMethod("gate")} />
          <Radio label="Entregar na minha porta (+R$4,00)" selected={method === "door"} onPress={() => setMethod("door")} last />
        </View>

        {/* Quando entregar */}
        <Text style={styles.sectionLabel}>Quando entregar</Text>
        <View style={styles.card}>
          <Radio label="Receber assim que possível" selected={when === "now"} onPress={() => setWhen("now")} />
          <Radio label="Agendar entrega" selected={when === "schedule"} onPress={() => setWhen("schedule")} last />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Prosseguir para Pagamento" variant="outline" loading={placing} onPress={place} />
      </View>
    </SafeAreaView>
  );
}

function Radio({
  label,
  selected,
  onPress,
  last,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.radioRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardBody: { padding: spacing.md, gap: 2 },
  link: { color: colors.primary, textDecorationLine: "underline", fontSize: 13 },
  sectionLabel: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  radioRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: radius.full, backgroundColor: colors.primary },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
});
