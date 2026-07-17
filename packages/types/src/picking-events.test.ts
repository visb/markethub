import { describe, expect, it } from "vitest";
import {
  ORDER_CREATED_EVENT,
  ORDER_STATUS_CHANGED_EVENT,
  ORDER_UPDATED_EVENT,
  PICK_TASK_UPDATED_EVENT,
  PICKING_EVENTS_VERSION,
  PICKING_NAMESPACE,
  SUBSTITUTION_RESOLVED_EVENT,
} from "./picking-events";

/**
 * Contrato de eventos de tempo real da separação (S3.8 / stories 02, 12, 64).
 * Os nomes/namespace são strings acordadas com os gateways do backend (que NÃO
 * importa este pacote) — mudar aqui quebra clientes silenciosamente, então os
 * valores ficam cravados no teste.
 */
describe("picking-events — contrato versionado", () => {
  it("versão e namespace do canal", () => {
    expect(PICKING_EVENTS_VERSION).toBe(1);
    expect(PICKING_NAMESPACE).toBe("/picking");
  });

  it("nomes dos eventos batem com os emitidos pelos gateways", () => {
    expect(ORDER_UPDATED_EVENT).toBe("order.updated");
    expect(PICK_TASK_UPDATED_EVENT).toBe("pick_task.updated");
    expect(SUBSTITUTION_RESOLVED_EVENT).toBe("substitution.resolved");
    expect(ORDER_CREATED_EVENT).toBe("order.created");
    expect(ORDER_STATUS_CHANGED_EVENT).toBe("order.status_changed");
  });
});
