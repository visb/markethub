import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DriverVehicleDTO } from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import { vehicles } from "@/api/vehicles";
import { queryKeys } from "@/lib/queryKeys";

/** Veículos `active` da rede do entregador, disponíveis para seleção. */
export function useDriverVehicles() {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.vehicles.all,
    queryFn: () => vehicles(client).list(),
  });
}

/** Veículo atualmente selecionado pelo entregador (ou null). */
export function useCurrentVehicle(options?: { enabled?: boolean }) {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.vehicles.current,
    queryFn: () => vehicles(client).current(),
    enabled: options?.enabled ?? true,
  });
}

/**
 * Seleciona/troca o veículo do turno. Ao concluir, invalida o veículo atual (e a
 * lista) para que o indicador da home reflita imediatamente a escolha.
 */
export function useSelectVehicle() {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<DriverVehicleDTO, unknown, string>({
    mutationFn: (vehicleId: string) => vehicles(client).select(vehicleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.current });
    },
  });
}
