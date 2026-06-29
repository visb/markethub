import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Stock } from "./Stock";

/**
 * Estoque (merchant): edição de quantidade (blur), toggle disponível e
 * destravamento de lockedFields. Métodos tipados do ApiClient mockados.
 */
const merchantStores = vi.fn();
const merchantStocks = vi.fn();
const merchantUpdateStock = vi.fn();
const merchantUnlockStock = vi.fn();
const apiStub = {
  merchantStores: () => merchantStores(),
  merchantStocks: (...a: unknown[]) => merchantStocks(...a),
  merchantUpdateStock: (...a: unknown[]) => merchantUpdateStock(...a),
  merchantUnlockStock: (...a: unknown[]) => merchantUnlockStock(...a),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const STORES = [{ id: "s1", name: "Centro" }];
const STOCKS = [
  {
    id: "k1",
    product: { id: "p1", name: "Leite", brand: "Boa Vaca" },
    quantity: 10,
    available: true,
    lockedFields: ["quantity"],
  },
];

describe("Stock", () => {
  beforeEach(() => {
    merchantStores.mockResolvedValue(STORES);
    merchantStocks.mockResolvedValue(STOCKS);
    merchantUpdateStock.mockResolvedValue({});
    merchantUnlockStock.mockResolvedValue({});
  });

  it("renderiza estoque com cadeado em quantidade travada", async () => {
    render(<Stock />);
    await screen.findByText("Leite");
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
    expect(screen.getByTitle("Destravar (volta ao ERP)")).toBeInTheDocument();
  });

  it("salva nova quantidade no blur e destrava", async () => {
    render(<Stock />);
    const qty = await screen.findByDisplayValue("10");
    fireEvent.change(qty, { target: { value: "25" } });
    fireEvent.blur(qty);
    await waitFor(() => {
      expect(merchantUpdateStock).toHaveBeenCalledWith("k1", { quantity: 25 });
    });
    fireEvent.click(screen.getByTitle("Destravar (volta ao ERP)"));
    await waitFor(() => {
      expect(merchantUnlockStock).toHaveBeenCalledWith("k1", "quantity");
    });
  });

  it("alterna disponibilidade", async () => {
    render(<Stock />);
    await screen.findByText("Leite");
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      expect(merchantUpdateStock).toHaveBeenCalledWith("k1", { available: false });
    });
  });

  it("mostra erro quando o carregamento falha", async () => {
    merchantStocks.mockRejectedValueOnce(new Error("x"));
    render(<Stock />);
    await screen.findByText("Falha ao carregar estoque");
  });
});
