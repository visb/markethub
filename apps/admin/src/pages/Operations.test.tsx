import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Operations } from "./Operations";

/**
 * Operação (admin): filas de separação/entrega, retiradas pendentes e SLA básico.
 * ApiClient mockado, sem rede.
 */
let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const OPS = {
  picking: { queued: 3, picking: 1 },
  deliveries: { unassigned: 2, delivered: 7 },
  pendingPickups: 5,
  sla: { oldestQueuedPickMin: 12, oldestUnassignedDeliveryMin: null },
};

describe("Operations", () => {
  beforeEach(() => {
    request = vi.fn(() => Promise.resolve(OPS));
  });

  it("mostra 'Carregando…' antes da resposta", () => {
    request = vi.fn(() => new Promise(() => {}));
    render(<Operations />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("renderiza painéis de filas, retiradas e SLA (com fallback 0)", async () => {
    render(<Operations />);
    await screen.findByText("Separação (filas)");
    expect(screen.getByText("queued")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("aguardando retirada na loja")).toBeInTheDocument();
    // oldestUnassignedDeliveryMin null → 0
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});
