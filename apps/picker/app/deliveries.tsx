import React, { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ApiClientError, type DeliveryFailReasonDTO } from "@markethub/api-client";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useDeliveryActions, useStoreDeliveries, useStoreDrivers } from "@/api/hooks/useStoreDeliveries";

const STATUS_LABEL: Record<string, string> = {
  unassigned: "Sem entregador",
  assigned: "Atribuída",
  picked_up: "A caminho",
  failed: "Falha na entrega",
};

const FAIL_REASON_LABEL: Record<DeliveryFailReasonDTO, string> = {
  customer_absent: "Cliente ausente",
  wrong_address: "Endereço errado",
  refused: "Pedido recusado",
  other: "Outro motivo",
};

/** HH:MM da falha (hora local) para o card. */
function failTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Despacho de entregas da loja (picker). Story 61: migrada para React Query
 * (hooks em src/api/hooks) e destaca a entrega com FALHA (motivo + hora) com as
 * ações "Reenviar" (retry) e "Cancelar sub-pedido" (story 54). A tela orquestra
 * hooks + componentes — sem fetch inline (CLAUDE.md).
 */
export default function DeliveriesScreen() {
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const id = storeId ?? null;
  const deliveriesQuery = useStoreDeliveries(id);
  const driversQuery = useStoreDrivers(id);
  const { assign, unassign, retry, cancel } = useDeliveryActions(id);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Toast de corrida (story 62): driver ficou indisponível entre o load e o clique.
  const [toast, setToast] = useState<string | null>(null);

  const deliveries = deliveriesQuery.data ?? [];
  const drivers = driversQuery.data ?? [];
  const busy = assign.isPending || unassign.isPending || retry.isPending || cancel.isPending;
  const error =
    deliveriesQuery.isError || unassign.isError || retry.isError || cancel.isError
      ? "Erro ao carregar ou executar a ação."
      : null;

  const closeExpanded = () => setExpanded(null);

  /**
   * Atribui um entregador. Trata a corrida (story 62): se ele ficou indisponível
   * entre o carregamento da lista e o clique, o backend responde DRIVER_UNAVAILABLE
   * — mostra o toast e revalida a lista de entregadores (o badge fica indisponível).
   */
  const handleAssign = (deliveryId: string, driverId: string) => {
    setToast(null);
    assign.mutate(
      { id: deliveryId, driverId },
      {
        onSuccess: closeExpanded,
        onError: (err) => {
          if (err instanceof ApiClientError && err.body.code === "DRIVER_UNAVAILABLE") {
            setToast("Entregador ficou indisponível. Atualizamos a lista.");
            void driversQuery.refetch();
          } else {
            setToast("Não foi possível atribuir. Tente novamente.");
          }
        },
      },
    );
  };

  if (deliveriesQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={
        <RefreshControl refreshing={deliveriesQuery.isRefetching} onRefresh={() => void deliveriesQuery.refetch()} />
      }
    >
      <Stack.Screen options={{ headerShown: true, title: "Entregas" }} />

      {error && <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{error}</Text>}

      {toast && (
        <View testID="assign-toast" style={styles.toast}>
          <Text style={{ color: colors.white }} variant="caption">
            {toast}
          </Text>
        </View>
      )}

      {deliveries.length === 0 ? (
        <Text muted style={{ marginTop: spacing.lg }}>
          Nenhuma entrega no momento.
        </Text>
      ) : (
        deliveries.map((d) => {
          const failed = d.status === "failed";
          return (
            <View key={d.id} style={[styles.card, failed && styles.cardFailed]}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text variant="title">
                    #{d.orderId.slice(-6)} · {d.customerName}
                  </Text>
                  {d.address && (
                    <Text muted variant="caption">
                      {d.address}
                    </Text>
                  )}
                  <Text style={{ color: failed ? colors.danger : colors.textMuted }} variant="caption">
                    {STATUS_LABEL[d.status] ?? d.status}
                    {d.driverName ? ` · ${d.driverName}` : ""}
                  </Text>
                  {failed && (
                    <Text style={{ color: colors.danger, fontWeight: "700" }} variant="caption">
                      {d.failReason ? FAIL_REASON_LABEL[d.failReason] : "Falha"}
                      {d.failedAt ? ` · ${failTime(d.failedAt)}` : ""}
                    </Text>
                  )}
                </View>
              </View>

              {d.status === "unassigned" && (
                <View style={{ marginTop: spacing.sm }}>
                  {expanded === d.id ? (
                    <View style={{ gap: spacing.xs }}>
                      {drivers.length === 0 && (
                        <Text muted variant="caption">
                          Nenhum entregador vinculado à loja.
                        </Text>
                      )}
                      {drivers.map((drv) => (
                        <Pressable
                          key={drv.id}
                          style={[styles.driverRow, !drv.available && styles.driverRowOff]}
                          disabled={busy || !drv.available}
                          onPress={() => handleAssign(d.id, drv.id)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={!drv.available ? { color: colors.textMuted } : undefined}>
                              {drv.name}
                            </Text>
                            <Text muted variant="caption">
                              {drv.activeDeliveries} em aberto
                            </Text>
                          </View>
                          {/* Badge de turno (story 62): disponível (verde) / indisponível (cinza). */}
                          <View
                            style={[styles.badge, drv.available ? styles.badgeOn : styles.badgeOff]}
                          >
                            <Text style={{ color: colors.white, fontSize: 11, fontWeight: "700" }}>
                              {drv.available ? "Disponível" : "Indisponível"}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Button title="Atribuir entregador" onPress={() => setExpanded(d.id)} />
                  )}
                </View>
              )}

              {d.status === "assigned" && (
                <Button
                  title="Desatribuir"
                  variant="outline"
                  loading={busy}
                  onPress={() => unassign.mutate(d.id)}
                  style={{ marginTop: spacing.sm }}
                />
              )}

              {failed && (
                <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                  <Button
                    title="Reenviar"
                    loading={retry.isPending}
                    disabled={busy}
                    onPress={() => retry.mutate(d.id)}
                  />
                  <Button
                    title="Cancelar sub-pedido"
                    variant="outline"
                    loading={cancel.isPending}
                    disabled={busy}
                    onPress={() => cancel.mutate(d.orderGroupId)}
                  />
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  cardFailed: { borderWidth: 1, borderColor: colors.danger },
  cardTop: { flexDirection: "row", alignItems: "center" },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  driverRowOff: { opacity: 0.6, backgroundColor: colors.surface },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeOn: { backgroundColor: colors.success },
  badgeOff: { backgroundColor: colors.textMuted },
  toast: {
    backgroundColor: colors.textMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
});
