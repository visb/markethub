import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { marketplace, type Address } from "@/api/marketplace";
import { Header } from "@/components/Header";
import { AddressForm, type AddressFormValue } from "@/components/AddressForm";

/**
 * Endereços do cliente (S6.2): lista com seleção do padrão, adicionar/editar via
 * AddressForm (CEP-first + GPS), excluir. Endereço fora da área de cobertura (S6.3)
 * fica marcado e não pode ser escolhido como padrão.
 */
export default function AddressesScreen() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [editing, setEditing] = useState<Address | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setAddresses(await mkt.addresses());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function choose(id: string) {
    await mkt.setDefaultAddress(id);
    await load();
  }

  async function save(value: AddressFormValue) {
    setBusy(true);
    setError(null);
    const body = {
      label: value.label,
      zipCode: value.zipCode,
      street: value.street,
      number: value.number,
      district: value.district || null,
      city: value.city,
      state: value.state,
      complement: value.complement || null,
      latitude: value.latitude,
      longitude: value.longitude,
    };
    try {
      if (editing) await mkt.updateAddress(editing.id, body);
      else await mkt.addAddress(body);
      setAdding(false);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o endereço");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await mkt.removeAddress(id);
    await load();
  }

  if (adding || editing) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <Header title={editing ? "Editar endereço" : "Novo endereço"} />
        <ScrollView contentContainerStyle={{ padding: spacing.md }}>
          {error && (
            <Text variant="caption" style={{ color: colors.danger, marginBottom: spacing.sm }}>
              {error}
            </Text>
          )}
          <AddressForm
            initial={editing}
            submitLabel={editing ? "Salvar alterações" : "Adicionar endereço"}
            busy={busy}
            onSubmit={save}
          />
          <Button
            title="Cancelar"
            variant="ghost"
            style={{ marginTop: spacing.sm }}
            onPress={() => {
              setAdding(false);
              setEditing(null);
              setError(null);
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Meus endereços" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
        {addresses.map((a) => {
          const noCoords = a.latitude == null || a.longitude == null;
          return (
            <View key={a.id} style={[styles.addr, a.isDefault && styles.addrOn]}>
              <Pressable
                style={styles.addrMain}
                onPress={() => (a.isDefault ? undefined : choose(a.id))}
              >
                <Ionicons
                  name={a.isDefault ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={a.isDefault ? colors.primary : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600" }}>{a.label}</Text>
                  <Text variant="caption" muted>
                    {a.street}, {a.number} — {a.city}/{a.state}
                  </Text>
                  {noCoords && (
                    <Text variant="caption" style={{ color: colors.warning }}>
                      Sem localização precisa
                    </Text>
                  )}
                </View>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => setEditing(a)}>
                <Ionicons name="pencil" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => remove(a.id)}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          );
        })}

        <Button
          title="+ Adicionar endereço"
          variant="outline"
          style={{ marginTop: spacing.sm }}
          onPress={() => setAdding(true)}
        />

        {/* Livro de endereços dedicado (story 71) — o seletor continua como está. */}
        <Pressable style={styles.manage} onPress={() => router.push("/addresses")}>
          <Text variant="caption" style={styles.manageText}>
            Gerenciar endereços
          </Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Confirmar" variant="outline" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
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
  addrMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  manage: { alignSelf: "center", paddingVertical: spacing.sm },
  manageText: { color: colors.primary, fontWeight: "600", textDecorationLine: "underline" },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
});
