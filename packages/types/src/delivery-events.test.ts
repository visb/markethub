import { describe, expect, it } from "vitest";
import {
  DELIVERY_EVENTS_VERSION,
  DELIVERY_NAMESPACE,
  DRIVER_LOCATION_EVENT,
} from "./delivery-events";

/**
 * Contrato de eventos da entrega ao vivo (story 51). Nomes/namespace acordados
 * com `delivery.gateway.ts` do backend (que NÃO importa este pacote) — valores
 * cravados p/ pegar mudança acidental que quebraria os clientes.
 */
describe("delivery-events — contrato versionado", () => {
  it("versão e namespace do canal", () => {
    expect(DELIVERY_EVENTS_VERSION).toBe(1);
    expect(DELIVERY_NAMESPACE).toBe("/delivery");
  });

  it("nome do evento de posição do entregador", () => {
    expect(DRIVER_LOCATION_EVENT).toBe("driver:location");
  });
});
