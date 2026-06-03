import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { PickItemDTO, PickTaskDTO } from "@markethub/api-client";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";

const ITEM_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "A separar", color: colors.textMuted },
  picked: { label: "Separado", color: colors.success },
  refused: { label: "Recusado", color: colors.danger },
  substituted: { label: "Substituído", color: colors.warning },
};

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useAuth();
  const router = useRouter();
  const [task, setTask] = useState<PickTaskDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickupCode, setPickupCode] = useState("");

  const load = useCallback(async () => {
    try {
      setTask(await client.pickTask(id));
    } catch {
      setError("Falha ao carregar a tarefa");
    } finally {
      setLoading(false);
    }
  }, [client, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const pickItem = (item: PickItemDTO) =>
    run(() =>
      client.pickUpdateItem(id, item.id, {
        action: "pick",
        ...(item.saleType === "weight"
          ? { weightGramsPicked: item.weightGrams ?? 0 }
          : { quantityPicked: item.quantity }),
      }),
    );

  const refuseItem = (item: PickItemDTO) => {
    const doRefuse = (reason: string) =>
      run(() => client.pickUpdateItem(id, item.id, { action: "refuse", refusalReason: reason }));
    Alert.alert("Recusar item", "Motivo da recusa", [
      { text: "Sem estoque", onPress: () => void doRefuse("Sem estoque") },
      { text: "Avariado", onPress: () => void doRefuse("Avariado") },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const substitute = (item: PickItemDTO) => {
    // Substituição manual por id da oferta (busca de substitutos: fase posterior).
    Alert.prompt?.("Substituir", "ID da oferta substituta", (offerId) => {
      if (offerId) void run(() => client.pickSubstitute(id, item.id, offerId));
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!task) {
    return (
      <View style={styles.center}>
        <Text>{error ?? "Tarefa não encontrada"}</Text>
      </View>
    );
  }

  const allResolved = task.items.every((i) => i.status !== "pending");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
      <Stack.Screen options={{ headerShown: true, title: `Pedido #${task.orderGroupId.slice(-6)}` }} />

      <View style={styles.headRow}>
        <Text variant="h2">Separação</Text>
        <View style={styles.badge}>
          <Text variant="caption" style={{ color: colors.primary }}>
            {task.status}
          </Text>
        </View>
      </View>

      {error && <Text style={{ color: colors.danger, marginVertical: spacing.sm }}>{error}</Text>}

      {task.status === "assigned" && (
        <Button title="Iniciar separação" loading={busy} onPress={() => void run(() => client.pickStart(id))} />
      )}

      {/* Itens */}
      <Text variant="title" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        Itens
      </Text>
      {task.items.map((item) => {
        const st = ITEM_STATUS[item.status];
        const qtyLabel =
          item.saleType === "weight" ? `${item.weightGrams ?? 0} g` : `${item.quantity} un`;
        return (
          <View key={item.id} style={styles.item}>
            <View style={styles.itemTop}>
              <Text style={{ flex: 1 }}>{item.nameSnapshot}</Text>
              <Text variant="caption" style={{ color: st.color }}>
                {st.label}
              </Text>
            </View>
            <Text muted variant="caption">
              Pedido: {qtyLabel}
            </Text>
            {task.status === "picking" && item.status === "pending" && (
              <View style={styles.actions}>
                <Action label="Separar" onPress={() => void pickItem(item)} disabled={busy} />
                <Action label="Recusar" onPress={() => refuseItem(item)} disabled={busy} danger />
                <Action label="Substituir" onPress={() => substitute(item)} disabled={busy} />
              </View>
            )}
          </View>
        );
      })}

      {task.status === "picking" && (
        <Button
          title={allResolved ? "Concluir separação" : "Resolva todos os itens"}
          variant="outline"
          disabled={!allResolved || busy}
          onPress={() => void run(() => client.pickCompletePicking(id))}
          style={{ marginTop: spacing.md }}
        />
      )}

      {/* Ensacolado/pronto → liberar para coleta (gera o código) */}
      {task.status === "packed" && (
        <Button
          title="Pronto para coleta"
          disabled={busy}
          onPress={() => void run(() => client.pickReady(id))}
          style={{ marginTop: spacing.md }}
        />
      )}

      {/* Pronto — entrega própria: informe o código de coleta ao entregador da loja */}
      {task.status === "ready_for_pickup" && task.fulfillment === "delivery" && (
        <View style={{ marginTop: spacing.lg }}>
          <Text variant="title" style={{ marginBottom: spacing.sm }}>
            Coleta pelo entregador
          </Text>
          <Text muted variant="caption" style={{ marginBottom: spacing.sm }}>
            Entregue o pedido ao entregador e informe o código de coleta abaixo. Ele confirma a
            coleta no app dele. (A atribuição do entregador é feita na tela de Entregas.)
          </Text>
          <View style={styles.codeBox}>
            <Text muted variant="caption">
              Código de coleta
            </Text>
            <Text variant="h1" style={{ color: colors.primary, letterSpacing: 6 }}>
              {task.pickupCode ?? "----"}
            </Text>
          </View>
        </View>
      )}

      {/* Pronto — retirada na loja: o cliente apresenta o código; a loja confirma a entrega */}
      {task.status === "ready_for_pickup" && task.fulfillment === "pickup" && (
        <View style={{ marginTop: spacing.lg }}>
          <Text variant="title" style={{ marginBottom: spacing.sm }}>
            Confirmar retirada
          </Text>
          <Text muted variant="caption" style={{ marginBottom: spacing.sm }}>
            Peça o código de retirada ao cliente e digite-o para concluir a entrega.
          </Text>
          <TextInput
            value={pickupCode}
            onChangeText={setPickupCode}
            placeholder="Código de retirada"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            style={styles.codeInput}
          />
          <Button
            title="Confirmar retirada"
            disabled={busy || pickupCode.trim().length === 0}
            onPress={() =>
              void run(async () => {
                await client.storeHandover(task.orderGroupId, pickupCode.trim());
                Alert.alert("Retirada concluída", "Pedido entregue ao cliente.");
                router.back();
              })
            }
            style={{ marginTop: spacing.sm }}
          />
        </View>
      )}
    </ScrollView>
  );
}

function Action({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.action, danger && styles.actionDanger]}>
      <Text variant="caption" style={{ color: danger ? colors.danger : colors.primary }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  item: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  itemTop: { flexDirection: "row", alignItems: "center" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  actionDanger: { borderColor: colors.danger },
  codeBox: { alignItems: "center", paddingVertical: spacing.sm },
  codeInput: {
    backgroundColor: colors.surface,
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
