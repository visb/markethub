import React from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button, Text, colors, spacing } from "@markethub/ui";
import type { Address } from "@/api/marketplace";
import { useAddresses, useRemoveAddress, useSetDefaultAddress } from "@/api/hooks/useAddresses";
import { AddressCard } from "@/components/AddressCard";
import { Header } from "@/components/Header";

/**
 * Livro de endereços (story 71): lista de cards com badge "Padrão" e ações
 * editar / remover (confirm — deletar é seguro, pedidos guardam snapshot) /
 * tornar padrão. Criar/editar em /address/[id]. A tela só orquestra — fetch e
 * mutations vivem nos hooks de useAddresses.
 */
export default function AddressBookScreen() {
  const router = useRouter();
  const { addresses, loading } = useAddresses();
  const remove = useRemoveAddress();
  const setDefault = useSetDefaultAddress();
  const busy = remove.isPending || setDefault.isPending;

  const confirmRemove = (a: Address) => {
    Alert.alert("Remover endereço", `Remover "${a.label}"? Pedidos já feitos não são afetados.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: () => remove.mutate(a.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Meus endereços" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : addresses.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="location-outline" size={48} color={colors.textMuted} />
          <Text variant="title">Nenhum endereço ainda</Text>
          <Text muted style={{ textAlign: "center" }}>
            Cadastre um endereço para receber suas compras em casa.
          </Text>
          <Button
            title="Cadastrar primeiro endereço"
            variant="outline"
            style={{ alignSelf: "stretch", marginTop: spacing.sm }}
            onPress={() => router.push("/address/new")}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
          {addresses.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              busy={busy}
              onEdit={() => router.push(`/address/${a.id}`)}
              onRemove={() => confirmRemove(a)}
              onMakeDefault={() => setDefault.mutate(a.id)}
            />
          ))}
          <Button
            title="+ Novo endereço"
            variant="outline"
            style={{ marginTop: spacing.sm }}
            onPress={() => router.push("/address/new")}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
});
