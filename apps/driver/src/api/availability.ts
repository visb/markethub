import type { ApiClient, DriverAvailabilityDTO } from "@markethub/api-client";

/**
 * Módulo de API tipado do turno on/off do entregador (story 62). CLAUDE.md: toda
 * chamada HTTP entra aqui, tipada — nunca `request`/`fetch` cru em tela. Recebe o
 * `ApiClient` injetado via auth-context.
 */
export type { DriverAvailabilityDTO };

export function availability(client: ApiClient) {
  return {
    /** Estado do turno (disponível + "desde"). */
    get: (): Promise<DriverAvailabilityDTO> => client.driverAvailability(),
    /** Liga/desliga o turno (idempotente). */
    set: (available: boolean): Promise<DriverAvailabilityDTO> => client.driverSetAvailability(available),
  };
}
