import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { PickTaskDTO } from "@markethub/api-client";
import { Button, Screen, Text, colors, radius, spacing } from "@markethub/ui";
import { APP_TITLE } from "@/config";
import { useAuth } from "@/auth-context";
import { usePickStores, usePickQueue, usePickAssign } from "@/api/hooks/usePickQueue";

const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  assigned: "Atribuída",
  picking: "Separando",
  packed: "Empacotada",
  ready_for_pickup: "Pronta",
};

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  // Estado de UI local: loja selecionada (server-state vai pra React Query).
  const [storeId, setStoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storesQuery = usePickStores();
  const stores = storesQuery.data ?? [];
  const { tasks, loading, refetch } = usePickQueue(storeId);
  const assign = usePickAssign(storeId);

  // Seleção default: primeira loja assim que a lista chega (sem sobrescrever escolha).
  useEffect(() => {
    if (!storeId && stores.length > 0) setStoreId(stores[0]!.id);
  }, [storeId, stores]);

  const assume = async (task: PickTaskDTO) => {
    setError(null);
    try {
      if (task.status === "queued") await assign.mutateAsync(task.id);
      router.push(`/task/${task.id}`);
    } catch {
      setError("Não foi possível assumir a tarefa (talvez já assumida)");
    }
  };

  const storesError = storesQuery.isError ? "Falha ao carregar lojas" : null;

  return (
    <Screen>
      <View style={styles.top}>
        <Text muted variant="caption">
          {APP_TITLE} · separador
        </Text>
        <Text variant="h1">Olá, {user?.name ?? "—"}</Text>
      </View>

      {stores.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          {stores.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setStoreId(s.id)}
              style={[styles.chip, storeId === s.id && styles.chipOn]}
            >
              <Text style={{ color: storeId === s.id ? colors.white : colors.text }}>{s.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {storeId && (
        <Button
          title="Entregas da loja"
          variant="outline"
          onPress={() => router.push(`/deliveries?storeId=${storeId}`)}
          style={{ marginBottom: spacing.md }}
        />
      )}

      {(error || storesError) && (
        <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{error ?? storesError}</Text>
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refetch()} />}
        >
          {tasks.length === 0 && (
            <Text muted style={{ marginTop: spacing.lg }}>
              Nenhuma tarefa na fila.
            </Text>
          )}
          {tasks.map((t) => {
            const mine = t.pickerId === user?.id;
            const resolved = t.items.filter((i) => i.status !== "pending").length;
            return (
              <Pressable key={t.id} style={styles.card} onPress={() => void assume(t)}>
                <View style={{ flex: 1 }}>
                  <Text variant="title">Pedido #{t.orderGroupId.slice(-6)}</Text>
                  <Text muted variant="caption">
                    {t.items.length} itens · {resolved}/{t.items.length} resolvidos
                  </Text>
                </View>
                <View style={styles.badge}>
                  <Text variant="caption" style={{ color: colors.primary }}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </Text>
                </View>
                <Text style={{ color: colors.primary, marginLeft: spacing.sm }}>
                  {mine ? "Continuar ›" : "Assumir ›"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Button title="Sair" variant="secondary" onPress={() => void logout()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { marginTop: spacing.lg, marginBottom: spacing.md },
  chips: { flexGrow: 0, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  chipOn: { backgroundColor: colors.primary },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
