import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { brl, type OrderTracking, type SubstitutionView } from "@/api/marketplace";
import { useOrderTracking } from "@/api/hooks/useOrderTracking";
import { useDeliveryLocation } from "@/api/hooks/useDeliveryLocation";
import { DeliveryMap } from "@/components/DeliveryMap";
import { DEFAULT_DELTA, hasCoords, type LatLng, type MapRegion } from "@/lib/mapRegion";
import { Header } from "@/components/Header";
import { MerchantLogo } from "@/components/MerchantLogo";

/** Origem do mapa: coordenadas da 1ª loja de entrega do pedido (own-store). */
function storeCoords(data: OrderTracking): LatLng | null {
  const g = data.groups.find(
    (grp) => grp.fulfillment === "delivery" && grp.storeLat != null && grp.storeLng != null,
  );
  return g ? { latitude: g.storeLat as number, longitude: g.storeLng as number } : null;
}

/** Destino do mapa: coordenadas do endereço de entrega (snapshot). */
function destinationCoords(data: OrderTracking): LatLng | null {
  const a = data.address;
  if (a && hasCoords({ latitude: a.lat, longitude: a.lng })) {
    return { latitude: a.lat as number, longitude: a.lng as number };
  }
  return null;
}

/** Enquadra o mapa: entregador > destino > loja, com zoom de bairro. */
function mapRegionFor(driver: LatLng | null, dest: LatLng | null, store: LatLng | null): MapRegion | null {
  const center = driver ?? dest ?? store;
  return center ? { ...center, ...DEFAULT_DELTA } : null;
}

// Macro-etapas da visão do cliente (ref: Confirmed.jpg / Picking.jpg):
// Pedido confirmado → Comprando (separação) → A caminho (ou Pronto p/ retirar).
const ORDER_RANK = ["created", "paid", "preparing", "picking", "ready_for_pickup", "on_the_way", "delivered"];

type MacroKey = "confirmed" | "shopping" | "on_the_way";

function macroSteps(pickupOnly: boolean): { key: MacroKey; label: string; minRank: number }[] {
  return [
    { key: "confirmed", label: "Pedido confirmado", minRank: ORDER_RANK.indexOf("preparing") },
    { key: "shopping", label: "Comprando", minRank: ORDER_RANK.indexOf("picking") },
    {
      key: "on_the_way",
      label: pickupOnly ? "Pronto para retirar" : "A caminho",
      minRank: ORDER_RANK.indexOf(pickupOnly ? "ready_for_pickup" : "on_the_way"),
    },
  ];
}

export default function TrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // Rastreio em tempo real (socket + fallback REST) encapsulado no hook.
  const { tracking: data, substitutions: subs, loading, busy, decideSubstitution, cancelOrder } =
    useOrderTracking(id);
  const [showItems, setShowItems] = useState(false);

  // Mapa ao vivo só na etapa de entrega em andamento com entrega own-store.
  const deliveryInProgress = data?.status === "on_the_way" && !!data.hasDelivery;
  const { driver } = useDeliveryLocation(id, deliveryInProgress);

  async function decideSub(sub: SubstitutionView, approve: boolean) {
    await decideSubstitution(sub.id, approve);
  }

  function confirmCancel() {
    Alert.alert("Cancelar pedido", "Tem certeza? Se já pago, o valor será estornado.", [
      { text: "Voltar", style: "cancel" },
      {
        text: "Cancelar pedido",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelOrder();
          } catch {
            Alert.alert("Não foi possível cancelar", "A separação já começou.");
          }
        },
      },
    ]);
  }

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <Header title="Acompanhe seu pedido" />
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <Text muted style={{ padding: spacing.md }}>Pedido não encontrado.</Text>
        )}
      </SafeAreaView>
    );
  }

  const pickupOnly = data.hasPickup && !data.hasDelivery;
  const currentRank = ORDER_RANK.indexOf(data.status);
  const canceled = data.status === "canceled";
  const delivered = data.status === "delivered";
  const arrived = data.status === "on_the_way" || (pickupOnly && data.status === "ready_for_pickup");
  const cancelable = ["created", "paid", "preparing"].includes(data.status);
  const steps = macroSteps(pickupOnly);
  const picking = sumProgress(data);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title={arrived ? "Seu pedido chegou" : "Acompanhe seu pedido"} />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        {/* Previsão de entrega (ref: Confirmed.jpg) */}
        {!canceled && !delivered && data.etaWindow && (
          <View>
            <Text variant="caption" muted>
              Previsão de {pickupOnly ? "retirada" : "entrega"}
            </Text>
            <Text style={styles.eta}>{etaLabel(data.etaWindow)}</Text>
          </View>
        )}

        {/* Mapa ao vivo (story 51): loja, destino e entregador em tempo real */}
        {deliveryInProgress &&
          (() => {
            const store = storeCoords(data);
            const dest = destinationCoords(data);
            const region = mapRegionFor(driver, dest, store);
            if (!region) return null;
            return (
              <View style={styles.mapCard} testID="delivery-map">
                <DeliveryMap initialRegion={region} store={store} destination={dest} driver={driver} />
              </View>
            );
          })()}

        {data.address && (
          <View style={styles.card}>
            <Text variant="caption" muted>Entrega em</Text>
            <Text muted>
              {data.address.street}, {data.address.number}
            </Text>
          </View>
        )}

        {canceled ? (
          <View style={styles.card}>
            <Text style={{ fontWeight: "700", color: colors.danger }}>Pedido cancelado</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.xs }}>
            {steps.map((step) => {
              const done = currentRank >= step.minRank || delivered;
              const active =
                !delivered &&
                ((step.key === "confirmed" && currentRank < ORDER_RANK.indexOf("picking")) ||
                  (step.key === "shopping" && data.status === "picking") ||
                  (step.key === "on_the_way" && currentRank >= step.minRank));
              return (
                <View key={step.key}>
                  <View style={styles.stepRow}>
                    <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                      {done && <Ionicons name="checkmark" size={10} color={colors.white} />}
                    </View>
                    <Text style={{ fontWeight: active || done ? "700" : "500", color: done || active ? colors.text : colors.textMuted }}>
                      {step.label}
                    </Text>
                  </View>

                  {/* Detalhe da separação (ref: Picking.jpg) */}
                  {step.key === "shopping" && data.status === "picking" && picking && (
                    <View style={styles.pickingBox}>
                      <PickRow color="#3b5bdb" label={`${picking.toApprove} produto(s) a escolher`} show={picking.toApprove > 0} onShow={() => setShowItems((v) => !v)} />
                      <PickRow color={colors.success} label={`${picking.picked} produto(s) selecionado(s)`} show={false} />
                      <PickRow color="#e8590c" label={`${picking.refused} produto(s) reembolsado(s)`} show={false} />
                      <PickRow color={colors.textMuted} label={`${picking.pending} produto(s) a selecionar`} show={false} />
                    </View>
                  )}

                  {/* Substituições pendentes: aprovar/recusar */}
                  {step.key === "shopping" && (showItems || subs.length > 0) &&
                    subs.map((s) => (
                      <View key={s.id} style={styles.subCard}>
                        <Text variant="caption" muted>Sem estoque:</Text>
                        <Text numberOfLines={1}>{s.originalName}</Text>
                        <Text variant="caption" muted style={{ marginTop: 4 }}>Sugestão do separador:</Text>
                        <Text numberOfLines={1} style={{ fontWeight: "700" }}>{s.substituteName}</Text>
                        <Text variant="caption" style={{ color: s.priceDiffCents > 0 ? colors.danger : colors.success }}>
                          {s.priceDiffCents === 0
                            ? "Mesmo preço"
                            : `${s.priceDiffCents > 0 ? "+" : "−"} ${brl(Math.abs(s.priceDiffCents))}`}
                        </Text>
                        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                          <View style={{ flex: 1 }}>
                            <Button title="Recusar" size="sm" variant="outline" disabled={busy} onPress={() => void decideSub(s, false)} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button title="Aprovar" size="sm" disabled={busy} onPress={() => void decideSub(s, true)} />
                          </View>
                        </View>
                      </View>
                    ))}
                </View>
              );
            })}
          </View>
        )}

        {/* Senha de entrega/retirada (ref: Receive.jpg) */}
        {data.deliveryCode && arrived && (
          <View style={[styles.card, styles.codeCard]}>
            <Text style={{ fontWeight: "700", textAlign: "center" }}>
              {pickupOnly ? "Retire seu pedido na loja" : "O entregador está a caminho!"}
            </Text>
            <Text variant="caption" muted style={{ textAlign: "center" }}>
              {pickupOnly
                ? "Informe a senha abaixo na loja para retirar."
                : "Informe a senha abaixo ao entregador para receber."}
            </Text>
            <Text style={styles.code}>{data.deliveryCode}</Text>
          </View>
        )}

        {delivered && (
          <Button title="Avaliar pedido" onPress={() => router.push(`/review/${data.orderId}`)} />
        )}

        {/* Detalhes do pedido por mercado (ref: Confirmed.jpg) */}
        <View style={styles.detailCard}>
          <Text style={{ fontWeight: "700", padding: spacing.md }}>Detalhes do pedido</Text>
          {data.groups.map((g) => (
            <View key={g.orderGroupId} style={styles.groupRow}>
              <MerchantLogo name={g.merchantName} logoUrl={g.merchantLogoUrl} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600" }}>{g.merchantName}</Text>
                <Text variant="caption" muted>
                  {brl(g.subtotalCents)}
                  {g.fulfillment === "pickup" ? " · retirada" : ""}
                </Text>
                {g.delivery?.driverName && g.delivery.status !== "delivered" && (
                  <Text variant="caption" style={{ color: colors.primary }}>
                    Entregador: {g.delivery.driverName}
                  </Text>
                )}
              </View>
              <Text variant="caption" muted>#{g.orderGroupId.slice(-5)}</Text>
            </View>
          ))}
          <View style={[styles.groupRow, { backgroundColor: colors.surface }]}>
            <Text muted style={{ flex: 1 }}>Valor total</Text>
            <Text style={{ fontWeight: "700" }}>{brl(data.totalCents)}</Text>
          </View>
        </View>

        {cancelable && !canceled && (
          <Pressable onPress={confirmCancel} disabled={busy} style={{ alignSelf: "center", padding: spacing.sm }}>
            <Text style={{ color: colors.text }}>Cancelar pedido</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PickRow({ color, label, show, onShow }: { color: string; label: string; show: boolean; onShow?: () => void }) {
  return (
    <View style={styles.pickRow}>
      <Text variant="caption" style={{ color, flex: 1 }}>{label}</Text>
      {show && onShow && (
        <Pressable onPress={onShow}>
          <Text variant="caption" style={{ textDecorationLine: "underline" }}>mostrar</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Soma o progresso de separação de todos os grupos. */
function sumProgress(data: OrderTracking) {
  const list = data.groups.map((g) => g.picking).filter((p): p is NonNullable<typeof p> => !!p);
  if (list.length === 0) return null;
  return list.reduce(
    (acc, p) => ({
      total: acc.total + p.total,
      toApprove: acc.toApprove + p.toApprove,
      picked: acc.picked + p.picked,
      refused: acc.refused + p.refused,
      pending: acc.pending + p.pending,
    }),
    { total: 0, toApprove: 0, picked: 0, refused: 0, pending: 0 },
  );
}

function etaLabel(w: { from: string; to: string }): string {
  const from = new Date(w.from);
  const to = new Date(w.to);
  const today = new Date().toDateString() === from.toDateString();
  const hh = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const day = today
    ? "Hoje"
    : from.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${day}, ${hh(from)} - ${hh(to)}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  eta: { fontSize: 26, fontWeight: "700", color: colors.text },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  codeCard: { borderColor: colors.primary, alignItems: "center" },
  mapCard: {
    height: 220,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  code: { fontSize: 30, fontWeight: "800", letterSpacing: 6, color: colors.primary },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: { backgroundColor: colors.success },
  dotActive: { backgroundColor: colors.success },
  pickingBox: { marginLeft: 36, gap: 4, paddingBottom: spacing.sm },
  pickRow: { flexDirection: "row", alignItems: "center" },
  subCard: {
    marginLeft: 36,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  detailCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
