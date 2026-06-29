import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Offers } from "./Offers";

/**
 * Ofertas (merchant): tabela com edição de preço/promo (blur), toggle de
 * disponibilidade e destravamento de lockedFields. Métodos tipados do ApiClient
 * mockados, sem rede.
 */
const merchantStores = vi.fn();
const merchantOffers = vi.fn();
const merchantUpdateOffer = vi.fn();
const merchantUnlockOffer = vi.fn();
const apiStub = {
  merchantStores: () => merchantStores(),
  merchantOffers: (...a: unknown[]) => merchantOffers(...a),
  merchantUpdateOffer: (...a: unknown[]) => merchantUpdateOffer(...a),
  merchantUnlockOffer: (...a: unknown[]) => merchantUnlockOffer(...a),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const STORES = [
  { id: "s1", name: "Centro" },
  { id: "s2", name: "Sul" },
];
const OFFERS = [
  {
    id: "o1",
    product: { id: "p1", name: "Leite", brand: "Boa Vaca" },
    priceCents: 599,
    promoPriceCents: 499,
    available: true,
    lockedFields: ["priceCents"],
    stock: { quantity: 10, available: false },
  },
];

describe("Offers", () => {
  beforeEach(() => {
    merchantStores.mockResolvedValue(STORES);
    merchantOffers.mockResolvedValue(OFFERS);
    merchantUpdateOffer.mockResolvedValue({});
    merchantUnlockOffer.mockResolvedValue({});
  });

  it("renderiza ofertas, estoque off e cadeado em campo travado", async () => {
    render(<Offers />);
    await screen.findByText("Leite");
    expect(screen.getByDisplayValue("5.99")).toBeInTheDocument();
    expect(screen.getByText(/\(off\)/)).toBeInTheDocument();
    expect(screen.getByTitle(/destravar/i)).toBeInTheDocument();
  });

  it("salva o preço no blur e destrava o campo", async () => {
    render(<Offers />);
    const price = await screen.findByDisplayValue("5.99");
    fireEvent.change(price, { target: { value: "6.49" } });
    fireEvent.blur(price);
    await waitFor(() => {
      expect(merchantUpdateOffer).toHaveBeenCalledWith("o1", { priceCents: 649 });
    });
    fireEvent.click(screen.getByTitle(/destravar/i));
    await waitFor(() => {
      expect(merchantUnlockOffer).toHaveBeenCalledWith("o1", "priceCents");
    });
  });

  it("alterna disponibilidade", async () => {
    render(<Offers />);
    await screen.findByText("Leite");
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      expect(merchantUpdateOffer).toHaveBeenCalledWith("o1", { available: false });
    });
  });

  it("busca dispara nova carga e troca de loja recarrega", async () => {
    render(<Offers />);
    await screen.findByText("Leite");
    fireEvent.change(screen.getByPlaceholderText("Buscar produto…"), {
      target: { value: "leite" },
    });
    await waitFor(() => {
      expect(merchantOffers).toHaveBeenCalledWith(
        expect.objectContaining({ search: "leite" }),
      );
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "s2" } });
    await waitFor(() => {
      expect(merchantOffers).toHaveBeenCalledWith(expect.objectContaining({ storeId: "s2" }));
    });
  });

  it("mostra erro quando o carregamento falha", async () => {
    merchantOffers.mockRejectedValueOnce(new Error("x"));
    render(<Offers />);
    await screen.findByText("Falha ao carregar ofertas");
  });
});
