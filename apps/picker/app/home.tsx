import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Screen, Text, colors, spacing } from "@markethub/ui";
import { APP_ROLE, APP_TITLE } from "@/config";
import { useAuth } from "@/auth-context";

export default function HomeScreen() {
  const { user, logout } = useAuth();

  return (
    <Screen>
      <View style={styles.top}>
        <Text muted variant="caption">
          {APP_TITLE} · {APP_ROLE}
        </Text>
        <Text variant="h1">Olá, {user?.name ?? "—"}</Text>
        <Text muted>{user?.email}</Text>
      </View>

      <View style={styles.card}>
        <Text variant="h2">Home (placeholder)</Text>
        <Text muted style={{ marginTop: spacing.xs }}>
          Telas de negócio entram nas próximas fases.
        </Text>
      </View>

      <View style={{ flex: 1 }} />
      <Button title="Sair" variant="secondary" onPress={() => void logout()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { marginTop: spacing.lg, marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
  },
});
