import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { marketplace, type Address } from "@/api/marketplace";
import { Header } from "@/components/Header";

type Mode = "deliver" | "pickup";
const DISTANCES = [5, 10, 13, 15, 20, 25];

export default function DeliveryConfig() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("deliver");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [radius_, setRadius] = useState(13);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "Casa", street: "", number: "", city: "", state: "", zipCode: "" });

  const load = useCallback(async () => {
    const list = await mkt.addresses();
    setAddresses(list);
    setSelected(list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function choose(id: string) {
    setSelected(id);
    await mkt.setDefaultAddress(id);
  }
  async function addAddress() {
    const a = await mkt.addAddress(form);
    setAddresses((p) => [a, ...p]);
    setSelected(a.id);
    setAdding(false);
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Configuração de entrega" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        {/* Entregar / Retirar */}
        <View style={styles.toggleRow}>
          <Pressable style={styles.toggle} onPress={() => setMode("deliver")}>
            <View style={[styles.radio, mode === "deliver" && styles.radioOn]}>
              {mode === "deliver" && <View style={styles.radioDot} />}
            </View>
            <Text>Entregar</Text>
          </Pressable>
          <Pressable style={styles.toggle} onPress={() => setMode("pickup")}>
            <View style={[styles.radio, mode === "pickup" && styles.radioOn]}>
              {mode === "pickup" && <View style={styles.radioDot} />}
            </View>
            <Text>Retirar na loja</Text>
          </Pressable>
        </View>

        {/* Endereços */}
        {mode === "deliver" && (
          <View style={{ gap: spacing.sm }}>
            {addresses.map((a) => (
              <Pressable
                key={a.id}
                style={[styles.addr, selected === a.id && styles.addrOn]}
                onPress={() => choose(a.id)}
              >
                <Ionicons name="location-outline" size={18} color={colors.primary} />
                <Text style={{ flex: 1 }}>
                  {a.street}, {a.number}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}

            {adding ? (
              <View style={{ gap: spacing.sm }}>
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
            ) : (
              <Button title="+ Adicionar endereço" variant="ghost" onPress={() => setAdding(true)} />
            )}
          </View>
        )}

        {/* Distância */}
        {mode === "deliver" && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="caption" muted>
              Mercados nesta área
            </Text>
            <View style={styles.chips}>
              {DISTANCES.map((d) => (
                <Pressable
                  key={d}
                  style={[styles.chip, radius_ === d && styles.chipOn]}
                  onPress={() => setRadius(d)}
                >
                  <Text style={radius_ === d ? styles.chipOnText : undefined}>{d}km</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Confirmar" variant="outline" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  toggleRow: { flexDirection: "row", gap: spacing.xl },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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
  addr: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  addrOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipOnText: { color: colors.white, fontWeight: "700" },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
});
