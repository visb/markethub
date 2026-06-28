import type { ConnectorContext } from "../erp.types";
import { CsvErpConnector } from "./csv.connector";

/**
 * Backfill de cobertura (story 26). Lê as fixtures CSV reais em
 * services/api/fixtures/erp/<merchant>/<store.externalId>/{products,prices,stock}.csv
 * (cwd do jest = services/api). Cobre mapeamento de colunas, coerção de
 * preço/estoque, gtin/brand vazios → null, baseDir/externalId ausentes e
 * arquivo inexistente.
 */

function ctx(over: Partial<ConnectorContext> = {}): ConnectorContext {
  return {
    merchantId: "m1",
    store: { id: "s1", externalId: "loja-1" },
    config: { baseDir: "fixtures/erp/supermercado-condor" },
    ...over,
  };
}

describe("CsvErpConnector.fetchProducts", () => {
  const connector = new CsvErpConnector();

  it("expõe o type csv", () => {
    expect(connector.type).toBe("csv");
  });

  it("mapeia as colunas da fixture de produtos", async () => {
    const products = await connector.fetchProducts(ctx());
    expect(products).toHaveLength(5);

    const c001 = products.find((p) => p.externalId === "C001");
    expect(c001).toEqual({
      externalId: "C001",
      gtin: "7891000100103",
      name: "Leite Ninho Integral 1L",
      brand: "Nestlé Ninho",
      unit: "1L",
      categoryName: "Bebidas",
      imageUrl: null,
      priceCents: 569,
      promoPriceCents: null,
      available: true,
      stockQuantity: 90,
    });
  });

  it("converte gtin e brand vazios em null", async () => {
    const products = await connector.fetchProducts(ctx());
    const c005 = products.find((p) => p.externalId === "C005")!;
    expect(c005.gtin).toBeNull();

    const c004 = products.find((p) => p.externalId === "C004")!;
    expect(c004.brand).toBeNull();
    expect(c004.promoPriceCents).toBe(4490);
  });
});

describe("CsvErpConnector.fetchPrices", () => {
  const connector = new CsvErpConnector();

  it("mapeia preço, promo e disponibilidade da fixture", async () => {
    const prices = await connector.fetchPrices(ctx());
    expect(prices).toEqual([
      { externalId: "C001", priceCents: 559, promoPriceCents: null, available: true },
      { externalId: "C002", priceCents: 859, promoPriceCents: 799, available: true },
      { externalId: "C004", priceCents: 4690, promoPriceCents: 4390, available: true },
    ]);
  });
});

describe("CsvErpConnector.fetchStock", () => {
  const connector = new CsvErpConnector();

  it("mapeia quantidade e disponibilidade, incluindo zerado/indisponível", async () => {
    const stock = await connector.fetchStock(ctx());
    expect(stock).toContainEqual({ externalId: "C001", quantity: 85, available: true });
    expect(stock).toContainEqual({ externalId: "C005", quantity: 0, available: false });
  });
});

describe("CsvErpConnector.read guards", () => {
  const connector = new CsvErpConnector();

  it("retorna vazio quando baseDir não está configurado", async () => {
    const warn = jest.spyOn(connector["logger"], "warn").mockImplementation(() => undefined);
    await expect(connector.fetchProducts(ctx({ config: {} }))).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("retorna vazio quando a loja não tem externalId", async () => {
    const warn = jest.spyOn(connector["logger"], "warn").mockImplementation(() => undefined);
    await expect(
      connector.fetchProducts(ctx({ store: { id: "s1", externalId: null } })),
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("retorna vazio e avisa quando o arquivo não existe", async () => {
    const warn = jest.spyOn(connector["logger"], "warn").mockImplementation(() => undefined);
    await expect(
      connector.fetchPrices(ctx({ store: { id: "s1", externalId: "loja-inexistente" } })),
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("csv file not found"));
    warn.mockRestore();
  });
});

describe("CsvErpConnector.pushOrder / acknowledge", () => {
  const connector = new CsvErpConnector();

  it("ecoa o orderId no externalOrderId", async () => {
    const res = await connector.pushOrder(ctx(), { orderId: "o1", items: [] });
    expect(res).toEqual({ externalOrderId: "csv-o1" });
  });

  it("acknowledge resolve sem efeito", async () => {
    await expect(connector.acknowledge(ctx(), "csv-o1")).resolves.toBeUndefined();
  });
});
