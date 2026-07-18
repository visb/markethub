import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ApiClientError } from "@markethub/api-client";
import { Text, colors, spacing } from "@markethub/ui";
import { useAddAddress, useAddresses, useUpdateAddress } from "@/api/hooks/useAddresses";
import { AddressForm, type AddressFormValue } from "@/components/AddressForm";
import { Header } from "@/components/Header";
import { useToast } from "@/components/Toast";

/** Mensagem exibível de um erro de mutation (body pt-BR da API quando houver). */
function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof ApiClientError) return err.body.message;
  return "Não foi possível salvar o endereço. Tente novamente.";
}

/**
 * Criar/editar endereço (story 71): `/address/new` cria, `/address/{id}` edita.
 * Reusa o AddressForm (CEP-first + GPS + cobertura); salvar volta para a lista.
 * A rota só orquestra — mutations em useAddresses, formulário no componente.
 */
export default function AddressEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const isNew = id === "new";

  const { addresses, loading } = useAddresses();
  const address = isNew ? null : (addresses.find((a) => a.id === id) ?? null);

  const add = useAddAddress();
  const update = useUpdateAddress(typeof id === "string" ? id : "");
  const saving = add.isPending || update.isPending;
  const error = errorMessage(add.error ?? update.error);

  const save = async (value: AddressFormValue) => {
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
      const saved = isNew ? await add.mutateAsync(body) : await update.mutateAsync(body);
      // geocode best-effort: se o backend não achou a localização exata, avisa
      // sem bloquear (story 75).
      if (saved.latitude == null || saved.longitude == null) {
        toast.show("Não encontramos a localização exata deste endereço");
      }
      router.back();
    } catch {
      // erro exibido inline via add.error / update.error
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title={isNew ? "Novo endereço" : "Editar endereço"} />
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        {error && (
          <Text variant="caption" style={{ color: colors.danger, marginBottom: spacing.sm }}>
            {error}
          </Text>
        )}
        {!isNew && loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : !isNew && !address ? (
          <Text muted>Endereço não encontrado.</Text>
        ) : (
          <AddressForm
            initial={address}
            submitLabel={isNew ? "Adicionar endereço" : "Salvar alterações"}
            busy={saving}
            onSubmit={save}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
});
