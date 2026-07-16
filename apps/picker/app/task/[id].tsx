import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { PickItemDTO } from "@markethub/api-client";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { ScannerSheet, type MatchFeedback } from "@/components/ScannerSheet";
import type { ScanMatch } from "@/lib/scanMatcher";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  SUBSTITUTE_MIN_QUERY,
  usePickCompletePicking,
  usePickReady,
  usePickStart,
  usePickSubstitute,
  usePickTask,
  usePickTaskRealtime,
  usePickUpdateItem,
  useStoreHandover,
  useSubstituteSearch,
} from "@/api/hooks/usePickTask";

const ITEM_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "A separar", color: colors.textMuted },
  picked: { label: "Separado", color: colors.success },
  refused: { label: "Recusado", color: colors.danger },
  substituted: { label: "Substituído", color: colors.warning },
};

// Feedback da decisão da substituição ao separador (story 64). O picker não
// propõe mais às cegas: enquanto pendente vê "aguardando cliente"; ao resolver
// (cliente ou timeout) o badge vira aprovada (verde) ou recusada (vermelho),
// atualizado em realtime via evento substitution.resolved.
const SUB_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Substituição: aguardando cliente", color: colors.warning },
  approved: { label: "Substituição aprovada", color: colors.success },
  rejected: { label: "Substituição recusada/removida", color: colors.danger },
};

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const taskQuery = usePickTask(id);
  const task = taskQuery.data ?? null;

  // Realtime: evento substitution.resolved na store room → refetch da task.
  usePickTaskRealtime(id, task?.storeId);

  // ── mutations da tela (cada uma invalida a query da task) ──
  const startMut = usePickStart(id);
  const updateItemMut = usePickUpdateItem(id);
  const substituteMut = usePickSubstitute(id);
  const completePickingMut = usePickCompletePicking(id);
  const readyMut = usePickReady(id);
  const handoverMut = useStoreHandover(id);

  const busy =
    startMut.isPending ||
    updateItemMut.isPending ||
    substituteMut.isPending ||
    completePickingMut.isPending ||
    readyMut.isPending ||
    handoverMut.isPending;

  const mutationError =
    startMut.error ??
    updateItemMut.error ??
    substituteMut.error ??
    completePickingMut.error ??
    readyMut.error ??
    handoverMut.error;
  const error = mutationError
    ? mutationError instanceof Error
      ? mutationError.message
      : "Erro"
    : taskQuery.isError
      ? "Falha ao carregar a tarefa"
      : null;

  // ── estado de UI local (não é server-state) ──
  const [pickupCode, setPickupCode] = useState("");
  const [subFor, setSubFor] = useState<string | null>(null);
  const [subQuery, setSubQuery] = useState("");

  // ── scanner de código de barras (story 63) ──
  const [scannerOpen, setScannerOpen] = useState(false);
  // Item por peso selecionado por um bip: revela o input de gramas (autoFocus).
  const [focusWeightId, setFocusWeightId] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState("");
  // Itens bipados por unidade aguardando commit (janela do "desfazer"): contam
  // no contador do scanner e viram "já separado" se re-bipados.
  const [optimisticPicked, setOptimisticPicked] = useState<Set<string>>(() => new Set());
  const commitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const timers = commitTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // Decide o efeito de cada bip e devolve o aviso a exibir no scanner. O commit
  // do pick por unidade é adiado (janela do "desfazer") — sem endpoint de reset
  // no backend, o desfazer é cancelar o commit antes de disparar.
  const handleScanMatch = (result: ScanMatch): MatchFeedback => {
    switch (result.kind) {
      case "pick-unit": {
        const item = result.item;
        setOptimisticPicked((s) => new Set(s).add(item.id));
        const timer = setTimeout(() => {
          commitTimers.current.delete(item.id);
          updateItemMut.mutate({
            itemId: item.id,
            input: { action: "pick", quantityPicked: item.quantity },
          });
        }, 3500);
        commitTimers.current.set(item.id, timer);
        return {
          message: `${item.nameSnapshot}: separado`,
          tone: "success",
          undo: () => {
            const t = commitTimers.current.get(item.id);
            if (t) clearTimeout(t);
            commitTimers.current.delete(item.id);
            setOptimisticPicked((s) => {
              const next = new Set(s);
              next.delete(item.id);
              return next;
            });
          },
        };
      }
      case "focus-weight": {
        const item = result.item;
        setScannerOpen(false);
        setFocusWeightId(item.id);
        setWeightInput(item.weightGrams != null ? String(item.weightGrams) : "");
        return { message: `${item.nameSnapshot}: pese e confirme`, tone: "success" };
      }
      case "already-resolved":
        return { message: `${result.item.nameSnapshot}: já separado`, tone: "warn" };
      case "unknown":
        return { message: "Produto não é deste pedido", tone: "error" };
    }
  };

  const confirmWeight = (item: PickItemDTO) => {
    const grams = Number(weightInput);
    updateItemMut.mutate(
      { itemId: item.id, input: { action: "pick", weightGramsPicked: grams } },
      {
        onSuccess: () => {
          setFocusWeightId(null);
          setWeightInput("");
        },
      },
    );
  };

  // Autocomplete de substituto: busca com debounce + gate de 2 caracteres.
  const debouncedQuery = useDebouncedValue(subQuery, 300);
  const searchQuery = useSubstituteSearch(task?.storeId, debouncedQuery);
  const subResults = searchQuery.data ?? [];
  const showSearchHint = debouncedQuery.trim().length >= SUBSTITUTE_MIN_QUERY;

  const pickItem = (item: PickItemDTO) =>
    updateItemMut.mutate({
      itemId: item.id,
      input: {
        action: "pick",
        ...(item.saleType === "weight"
          ? { weightGramsPicked: item.weightGrams ?? 0 }
          : { quantityPicked: item.quantity }),
      },
    });

  const refuseItem = (item: PickItemDTO) => {
    const doRefuse = (reason: string) =>
      updateItemMut.mutate({ itemId: item.id, input: { action: "refuse", refusalReason: reason } });
    Alert.alert("Recusar item", "Motivo da recusa", [
      { text: "Sem estoque", onPress: () => doRefuse("Sem estoque") },
      { text: "Avariado", onPress: () => doRefuse("Avariado") },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const openSubFor = (itemId: string) => {
    setSubFor(subFor === itemId ? null : itemId);
    setSubQuery("");
  };

  const proposeSub = (item: PickItemDTO, offerId: string) => {
    substituteMut.mutate(
      { itemId: item.id, substituteOfferId: offerId },
      {
        onSuccess: () => {
          setSubFor(null);
          setSubQuery("");
        },
      },
    );
  };

  if (taskQuery.isLoading) {
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
        <Button title="Iniciar separação" loading={busy} onPress={() => startMut.mutate()} />
      )}

      {/* Scanner de código de barras — só nativo (câmera); atalho da separação. */}
      {task.status === "picking" && Platform.OS !== "web" && (
        <Button
          title="Escanear código"
          onPress={() => setScannerOpen(true)}
          style={{ marginTop: spacing.md }}
        />
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
            {item.substitution && (
              <View style={styles.subBadge}>
                <Text
                  variant="caption"
                  style={{ color: SUB_STATUS[item.substitution.approvalStatus].color, fontWeight: "700" }}
                >
                  {SUB_STATUS[item.substitution.approvalStatus].label}
                </Text>
                <Text muted variant="caption" numberOfLines={1}>
                  → {item.substitution.nameSnapshot}
                </Text>
              </View>
            )}
            {task.status === "picking" && item.status === "pending" && (
              <View style={styles.actions}>
                <Action label="Separar" onPress={() => pickItem(item)} disabled={busy} />
                <Action label="Recusar" onPress={() => refuseItem(item)} disabled={busy} danger />
                <Action label="Substituir" onPress={() => openSubFor(item.id)} disabled={busy} />
              </View>
            )}
            {/* Input de gramas revelado por um bip em item por peso (story 63). */}
            {focusWeightId === item.id && item.status === "pending" && (
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                <TextInput
                  value={weightInput}
                  onChangeText={(t) => setWeightInput(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  placeholder="Peso em gramas (balança)"
                  placeholderTextColor={colors.textMuted}
                  style={styles.subInput}
                  autoFocus
                />
                <Button
                  title="Confirmar peso"
                  size="sm"
                  disabled={busy || weightInput.trim() === "" || Number(weightInput) <= 0}
                  onPress={() => confirmWeight(item)}
                />
              </View>
            )}
            {subFor === item.id && (
              <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                <TextInput
                  value={subQuery}
                  onChangeText={setSubQuery}
                  placeholder="Buscar substituto na loja..."
                  placeholderTextColor={colors.textMuted}
                  style={styles.subInput}
                  autoFocus
                />
                {subResults.map((o) => (
                  <Pressable
                    key={o.offerId}
                    style={styles.subResult}
                    disabled={busy}
                    onPress={() => proposeSub(item, o.offerId)}
                  >
                    <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                      {o.name}
                    </Text>
                    <Text variant="caption" style={{ color: colors.primary, fontWeight: "700" }}>
                      R$ {((o.promoPriceCents ?? o.priceCents) / 100).toFixed(2).replace(".", ",")}
                    </Text>
                  </Pressable>
                ))}
                {showSearchHint && searchQuery.isFetching && subResults.length === 0 && (
                  <Text variant="caption" muted>
                    Buscando...
                  </Text>
                )}
                {showSearchHint && !searchQuery.isFetching && subResults.length === 0 && (
                  <Text variant="caption" muted>
                    Nenhum produto encontrado.
                  </Text>
                )}
                {!showSearchHint && (
                  <Text variant="caption" muted>
                    Digite ao menos {SUBSTITUTE_MIN_QUERY} letras para buscar.
                  </Text>
                )}
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
          onPress={() => completePickingMut.mutate()}
          style={{ marginTop: spacing.md }}
        />
      )}

      {/* Ensacolado/pronto → liberar para coleta (gera o código) */}
      {task.status === "packed" && (
        <Button
          title="Pronto para coleta"
          disabled={busy}
          onPress={() => readyMut.mutate()}
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
              handoverMut.mutate(
                { orderGroupId: task.orderGroupId, code: pickupCode.trim() },
                {
                  onSuccess: () => {
                    Alert.alert("Retirada concluída", "Pedido entregue ao cliente.");
                    router.back();
                  },
                },
              )
            }
            style={{ marginTop: spacing.sm }}
          />
        </View>
      )}

      {/* Sheet do scanner — só nativo; câmera + matcher de bip contra os itens. */}
      {Platform.OS !== "web" && (
        <ScannerSheet
          visible={scannerOpen}
          onClose={() => setScannerOpen(false)}
          items={task.items}
          resolvedIds={optimisticPicked}
          onMatch={handleScanMatch}
        />
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
  subBadge: { marginTop: spacing.xs, gap: 2 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  actionDanger: { borderColor: colors.danger },
  subInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    color: colors.text,
  },
  subResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
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
