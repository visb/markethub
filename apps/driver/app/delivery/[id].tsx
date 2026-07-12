import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useConfirmDelivery, useConfirmPickup, useDeliveryDetail } from "@/api/hooks/useDriverDeliveries";
import { useDeliveryTracking } from "@/hooks/useDeliveryTracking";
import { DeliveryMapView } from "@/components/DeliveryMapView";

export default function DeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detail = useDeliveryDetail(id);
  const confirmPickup = useConfirmPickup(id);
  const confirmDelivery = useConfirmDelivery(id);
  const [pickupCode, setPickupCode] = useState("");
  const [deliveryCode, setDeliveryCode] = useState("");

  const delivery = detail.data;
  // Rastreio ao vivo: inicia ao coletar (picked_up), para ao entregar/sair.
  const { permissionDenied } = useDeliveryTracking(delivery);
  const busy = confirmPickup.isPending || confirmDelivery.isPending;
  const error =
    detail.isError
      ? "Falha ao carregar a entrega"
      : confirmPickup.isError || confirmDelivery.isError
        ? "Erro"
        : null;

  if (detail.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!delivery) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: "Entrega" }} />
        <Text>Entrega concluída ou indisponível.</Text>
        <Button title="Voltar" variant="secondary" onPress={() => router.replace("/home")} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
      <Stack.Screen options={{ headerShown: true, title: `Pedido #${delivery.orderId.slice(-6)}` }} />

      {error && <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{error}</Text>}

      {/* Mapa da entrega (story 59): loja, cliente, posição atual + navegação por fase */}
      <DeliveryMapView delivery={delivery} />

      {/* Resumo */}
      <View style={styles.card}>
        <Text style={{ fontWeight: "700" }}>{delivery.storeName}</Text>
        <Text muted variant="caption">
          Coleta na loja
        </Text>
        <View style={styles.hr} />
        <Text style={{ fontWeight: "700" }}>{delivery.customerName}</Text>
        {delivery.address && (
          <Text muted variant="caption">
            {delivery.address}
          </Text>
        )}
        <Text muted variant="caption">
          {delivery.itemCount} item(ns)
        </Text>
      </View>

      {/* Etapa de coleta */}
      {delivery.status === "assigned" && (
        <View style={styles.action}>
          <Text variant="title" style={{ marginBottom: spacing.sm }}>
            1. Coleta na loja
          </Text>
          <Text muted variant="caption" style={{ marginBottom: spacing.sm }}>
            Pegue o pedido e digite o código de coleta da loja.
          </Text>
          <TextInput
            value={pickupCode}
            onChangeText={setPickupCode}
            placeholder="Código de coleta"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            style={styles.input}
          />
          <Button
            title="Confirmar coleta"
            loading={busy}
            disabled={pickupCode.trim().length === 0}
            onPress={() => confirmPickup.mutate(pickupCode.trim())}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      )}

      {/* Rastreio ao vivo: permissão de background negada (fluxo segue funcionando) */}
      {delivery.status === "picked_up" && permissionDenied && (
        <View style={styles.banner}>
          <Text variant="caption" style={{ color: colors.text }}>
            Rastreio ao vivo indisponível: permita o acesso à localização "o tempo todo"
            nas configurações para o cliente acompanhar a entrega no mapa.
          </Text>
        </View>
      )}

      {/* Etapa de entrega */}
      {delivery.status === "picked_up" && (
        <View style={styles.action}>
          <Text variant="title" style={{ marginBottom: spacing.sm }}>
            2. Entrega ao cliente
          </Text>
          <Text muted variant="caption" style={{ marginBottom: spacing.sm }}>
            Peça o código de entrega ao cliente e digite para confirmar.
          </Text>
          <TextInput
            value={deliveryCode}
            onChangeText={setDeliveryCode}
            placeholder="Código de entrega"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            style={styles.input}
          />
          <Button
            title="Confirmar entrega"
            loading={busy}
            disabled={deliveryCode.trim().length === 0}
            onPress={() => confirmDelivery.mutate(deliveryCode.trim())}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      )}

      {delivery.status === "delivered" && (
        <View style={{ marginTop: spacing.lg }}>
          <Text variant="h2" style={{ color: colors.success }}>
            Entregue! 🎉
          </Text>
          <Button title="Voltar" onPress={() => router.replace("/home")} style={{ marginTop: spacing.md }} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background, padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  action: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  banner: {
    marginTop: spacing.lg,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 20,
    letterSpacing: 4,
    color: colors.text,
  },
});
