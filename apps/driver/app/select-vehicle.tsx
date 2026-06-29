import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { ApiClientError } from "@markethub/api-client";
import { Screen, Text, spacing } from "@markethub/ui";
import { VehiclePicker } from "@/components/VehiclePicker";
import {
  useCurrentVehicle,
  useDriverVehicles,
  useSelectVehicle,
} from "@/api/hooks/useDriverVehicle";

/**
 * Tela de seleção de veículo (story 15). Gate pós-login: o entregador escolhe com
 * qual veículo vai rodar antes de chegar na home. Também é o destino do "Trocar"
 * do indicador na home. A route só orquestra hooks + componentes.
 */
export default function SelectVehicleScreen() {
  const router = useRouter();
  const vehiclesQuery = useDriverVehicles();
  const currentQuery = useCurrentVehicle();
  const select = useSelectVehicle();
  const [error, setError] = useState<string | null>(null);

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  };

  const onSelect = (vehicleId: string) => {
    setError(null);
    select.mutate(vehicleId, {
      onSuccess: () => goHome(),
      onError: (e) => {
        setError(e instanceof ApiClientError ? e.body.message : "Não foi possível selecionar o veículo");
      },
    });
  };

  return (
    <Screen>
      <View style={{ marginTop: spacing.xl, marginBottom: spacing.lg }}>
        <Text variant="h1">Seu veículo</Text>
        <Text muted>Escolha com qual veículo você vai rodar agora.</Text>
      </View>

      <VehiclePicker
        vehicles={vehiclesQuery.data ?? []}
        selectedId={currentQuery.data?.id ?? null}
        pendingId={select.isPending ? select.variables ?? null : null}
        loading={vehiclesQuery.isLoading}
        error={vehiclesQuery.isError ? "Erro ao carregar veículos." : error}
        onSelect={onSelect}
      />
    </Screen>
  );
}
