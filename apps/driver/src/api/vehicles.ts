import type { ApiClient, DriverVehicleDTO } from "@markethub/api-client";

/**
 * Módulo de API tipado da seleção de veículo (CLAUDE.md: toda chamada HTTP entra
 * aqui, tipada — nunca `request`/`fetch` cru em tela). Recebe o `ApiClient`
 * injetado via auth-context.
 */
export type { DriverVehicleDTO };

export function vehicles(client: ApiClient) {
  return {
    /** Veículos `active` da rede da(s) loja(s) do entregador. */
    list: (): Promise<DriverVehicleDTO[]> => client.driverVehicles(),
    /** Veículo atualmente selecionado (ou null). */
    current: (): Promise<DriverVehicleDTO | null> => client.driverCurrentVehicle(),
    /** Seleciona/troca o veículo do turno. */
    select: (vehicleId: string): Promise<DriverVehicleDTO> => client.driverSelectVehicle(vehicleId),
  };
}
