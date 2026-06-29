import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { useCart } from "../use-cart";
import type { SaleType } from "../api/marketplace";

/**
 * Story 40: cobre o hook do carrinho (`src/use-cart.ts`) — atualização otimista,
 * stepper unit/weight (gramas), remoção ao zerar e o sync com debounce ao servidor.
 * `useAuth` é mockado com um ApiClient falso (api.request roteado por URL); sem rede.
 */

let cartFixture: {
  groups: {
    storeId: string;
    merchantId: string;
    merchant: string;
    merchantLogoUrl: string | null;
    items: { id: string; offerId: string; quantity: number; weightGrams: number | null; saleType: SaleType }[];
  }[];
  totals: { totalCents: number };
};

const mockRequest = jest.fn((url: string) => {
  if (url === "/cart") return Promise.resolve(cartFixture);
  return Promise.resolve({});
});

const mockApi = { request: mockRequest };
jest.mock("../auth-context", () => ({
  useAuth: () => ({ api: mockApi }),
}));

let latest: ReturnType<typeof useCart>;
function Harness({ offerId, saleType }: { offerId: string; saleType: SaleType }) {
  latest = useCart();
  return <Text>{`${latest.total}|${latest.labelFor(offerId, saleType) ?? "-"}`}</Text>;
}

async function mount(offerId = "o1", saleType: SaleType = "unit") {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Harness offerId={offerId} saleType={saleType} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return tree;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockRequest.mockClear();
  cartFixture = {
    groups: [
      {
        storeId: "s1",
        merchantId: "m1",
        merchant: "Rede A",
        merchantLogoUrl: null,
        items: [{ id: "it1", offerId: "o1", quantity: 2, weightGrams: null, saleType: "unit" }],
      },
    ],
    totals: { totalCents: 5000 },
  };
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useCart — carga inicial", () => {
  it("refresh popula total, stores e labels a partir do getCart", async () => {
    await mount();
    expect(mockRequest).toHaveBeenCalledWith("/cart", { auth: true });
    expect(latest.total).toBe(5000);
    expect(latest.stores).toEqual([
      { storeId: "s1", merchantId: "m1", merchant: "Rede A", logoUrl: null },
    ]);
    expect(latest.labelFor("o1", "unit")).toBe("2");
    expect(latest.labelFor("inexistente", "unit")).toBeNull();
  });
});

describe("useCart — stepper unit", () => {
  it("add inicia em 1, inc soma e dec subtrai (otimista)", async () => {
    await mount("oNew", "unit");
    await act(async () => {
      latest.add("oNew", "unit");
    });
    expect(latest.labelFor("oNew", "unit")).toBe("1");
    await act(async () => {
      latest.inc("oNew", "unit");
    });
    expect(latest.labelFor("oNew", "unit")).toBe("2");
    await act(async () => {
      latest.dec("oNew", "unit");
    });
    expect(latest.labelFor("oNew", "unit")).toBe("1");
  });

  it("dec abaixo de 1 num item novo (sem itemId) remove a entrada", async () => {
    await mount("oNew", "unit");
    await act(async () => {
      latest.add("oNew", "unit");
    });
    await act(async () => {
      latest.dec("oNew", "unit");
    });
    expect(latest.labelFor("oNew", "unit")).toBeNull();
  });
});

describe("useCart — stepper weight (gramas)", () => {
  it("add inicia em 300g e inc soma 100g", async () => {
    await mount("oW", "weight");
    await act(async () => {
      latest.add("oW", "weight");
    });
    expect(latest.labelFor("oW", "weight")).toBe("300g");
    await act(async () => {
      latest.inc("oW", "weight");
    });
    expect(latest.labelFor("oW", "weight")).toBe("400g");
  });
});

describe("useCart — sync com debounce", () => {
  it("add de oferta nova dispara addItem (POST) após o debounce", async () => {
    await mount("oNew", "unit");
    await act(async () => {
      latest.add("oNew", "unit");
    });
    await act(async () => {
      jest.advanceTimersByTime(450);
      await Promise.resolve();
    });
    expect(mockRequest).toHaveBeenCalledWith("/cart/items", {
      method: "POST",
      auth: true,
      body: { offerId: "oNew", quantity: 1 },
    });
  });

  it("zerar item existente dispara removeItem (DELETE) após o debounce", async () => {
    await mount("o1", "unit");
    // o1 começa em 2 → dec, dec → 0 (mantém itemId pois é item do servidor)
    await act(async () => {
      latest.dec("o1", "unit");
    });
    await act(async () => {
      latest.dec("o1", "unit");
    });
    expect(latest.labelFor("o1", "unit")).toBe("0");
    await act(async () => {
      jest.advanceTimersByTime(450);
      await Promise.resolve();
    });
    expect(mockRequest).toHaveBeenCalledWith("/cart/items/it1", { method: "DELETE", auth: true });
  });
});
