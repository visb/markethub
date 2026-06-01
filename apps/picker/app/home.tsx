import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import type { PickStore, PickTaskDTO } from "@markethub/api-client";
import { Button, Screen, Text, colors, radius, spacing } from "@markethub/ui";
import { APP_TITLE } from "@/config";
import { useAuth } from "@/auth-context";

const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  assigned: "Atribuída",
  picking: "Separando",
  packed: "Empacotada",
  ready_for_pickup: "Pronta",
};

export default function HomeScreen() {
  const { user, client, logout } = useAuth();
  const router = useRouter();
  const [stores, setStores] = useState<PickStore[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PickTaskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    try {
      const s = await client.pickStores();
      setStores(s);
      setStoreId((cur) => cur ?? s[0]?.id ?? null);
    } catch {
      setError("Falha ao carregar lojas");
    }
  }, [client]);

  const loadQueue = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setTasks(await client.pickQueue(storeId));
    } catch {
      setError("Falha ao carregar a fila");
    } finally {
      setLoading(false);
    }
  }, [client, storeId]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);
  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const assume = async (task: PickTaskDTO) => {
    try {
      if (task.status === "queued") await client.pickAssign(task.id);
      router.push(`/task/${task.id}`);
    } catch {
      setError("Não foi possível assumir a tarefa (talvez já assumida)");
      void loadQueue();
    }
  };

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

      {error && <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{error}</Text>}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void loadQueue()} />}
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
