import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { colors } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { useCurrentVehicle } from "@/api/hooks/useDriverVehicle";

/**
 * Gate de entrada. Sem sessão → login. Autenticado mas SEM veículo selecionado →
 * tela de seleção (story 15) antes da home. Com veículo já escolhido → home.
 */
export default function Index() {
  const { user, loading } = useAuth();
  // Só consulta o veículo atual quando há sessão (evita 401 no estado deslogado).
  const currentVehicle = useCurrentVehicle({ enabled: !!user });

  if (loading || (user && currentVehicle.isLoading)) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (!currentVehicle.data) return <Redirect href="/select-vehicle" />;
  return <Redirect href="/home" />;
}
