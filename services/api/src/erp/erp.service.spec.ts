import { NotFoundException } from "@nestjs/common";
import { ErpService, stripLocked } from "./erp.service";

/**
 * Foco: sync incremental de preço/estoque respeitando lockedFields (S3.9) e a
 * contabilidade de counters (processed/updated/failed) gravada no SyncRun.
 * catalog-normalize (slugify/gtin/saleType) é coberto em catalog-normalize.spec.ts.
 */

describe("stripLocked", () => {
  it("retorna o objeto inteiro quando não há campo travado", () => {
    expect(stripLocked({ a: 1, b: 2 }, [])).toEqual({ a: 1, b: 2 });
  });

  it("remove apenas os campos travados", () => {
    expect(stripLocked({ priceCents: 100, available: true }, ["priceCents"])).toEqual({
      available: true,
    });
  });

  it("retorna vazio quando todos os campos estão travados", () => {
    expect(stripLocked({ priceCents: 100 }, ["priceCents"])).toEqual({});
  });
});

const STORE = {
  id: "store1",
  externalId: "ext-store",
  merchantId: "m1",
  merchant: { connectorType: "csv", connectorConfig: {} },
};

function makeService(opts: {
  fetchPrices?: unknown[];
  fetchStock?: unknown[];
  offers?: Record<string, { id: string; productId: string; lockedFields: string[] } | null>;
  stocks?: Record<string, { lockedFields: string[] } | null>;
  store?: unknown;
}) {
  const offerUpdate = jest.fn().mockResolvedValue({});
  const stockUpsert = jest.fn().mockResolvedValue({});
  const syncRunUpdate = jest.fn().mockResolvedValue({});

  const prisma = {
    store: { findUnique: jest.fn().mockResolvedValue("store" in opts ? opts.store : STORE) },
    syncRun: {
      create: jest.fn().mockResolvedValue({ id: "run1" }),
      update: syncRunUpdate,
    },
    offer: {
      findUnique: jest.fn(({ where }: { where: { storeId_externalId: { externalId: string } } }) =>
        Promise.resolve(opts.offers?.[where.storeId_externalId.externalId] ?? null),
      ),
      update: offerUpdate,
    },
    stock: {
      findUnique: jest.fn(({ where }: { where: { storeId_productId: { productId: string } } }) =>
        Promise.resolve(opts.stocks?.[where.storeId_productId.productId] ?? null),
      ),
      upsert: stockUpsert,
    },
  } as never;

  const connector = {
    fetchPrices: jest.fn().mockResolvedValue(opts.fetchPrices ?? []),
    fetchStock: jest.fn().mockResolvedValue(opts.fetchStock ?? []),
  };
  const registry = { resolve: jest.fn().mockReturnValue(connector) } as never;
  const enrichmentQueue = { enqueueStore: jest.fn().mockResolvedValue(undefined) } as never;

  const svc = new ErpService(prisma, registry, enrichmentQueue);
  return { svc, offerUpdate, stockUpsert, syncRunUpdate };
}

describe("ErpService.runSync (via runPriceSync)", () => {
  it("lança STORE_NOT_FOUND quando a loja não existe", async () => {
    const { svc } = makeService({ store: null });
    await expect(svc.runPriceSync("store1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("grava o SyncRun com counters após sucesso", async () => {
    const { svc, syncRunUpdate } = makeService({
      fetchPrices: [{ externalId: "p1", priceCents: 500 }],
      offers: { p1: { id: "o1", productId: "prod1", lockedFields: [] } },
    });
    const runId = await svc.runPriceSync("store1");
    expect(runId).toBe("run1");
    expect(syncRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run1" },
        data: expect.objectContaining({
          status: "success",
          itemsProcessed: 1,
          itemsUpdated: 1,
          itemsFailed: 0,
        }),
      }),
    );
  });
});

describe("ErpService.runPriceSync", () => {
  it("atualiza a oferta com preço, promo e disponibilidade", async () => {
    const { svc, offerUpdate } = makeService({
      fetchPrices: [{ externalId: "p1", priceCents: 500, promoPriceCents: 400, available: false }],
      offers: { p1: { id: "o1", productId: "prod1", lockedFields: [] } },
    });
    await svc.runPriceSync("store1");
    expect(offerUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { priceCents: 500, promoPriceCents: 400, available: false },
    });
  });

  it("default: promoPriceCents null e available true quando ausentes", async () => {
    const { svc, offerUpdate } = makeService({
      fetchPrices: [{ externalId: "p1", priceCents: 500 }],
      offers: { p1: { id: "o1", productId: "prod1", lockedFields: [] } },
    });
    await svc.runPriceSync("store1");
    expect(offerUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { priceCents: 500, promoPriceCents: null, available: true },
    });
  });

  it("não sobrescreve campos travados pelo manager", async () => {
    const { svc, offerUpdate } = makeService({
      fetchPrices: [{ externalId: "p1", priceCents: 500, available: false }],
      offers: { p1: { id: "o1", productId: "prod1", lockedFields: ["priceCents"] } },
    });
    await svc.runPriceSync("store1");
    expect(offerUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { promoPriceCents: null, available: false },
    });
  });

  it("não chama update quando todos os campos estão travados", async () => {
    const { svc, offerUpdate } = makeService({
      fetchPrices: [{ externalId: "p1", priceCents: 500 }],
      offers: {
        p1: {
          id: "o1",
          productId: "prod1",
          lockedFields: ["priceCents", "promoPriceCents", "available"],
        },
      },
    });
    await svc.runPriceSync("store1");
    expect(offerUpdate).not.toHaveBeenCalled();
  });

  it("conta failed quando a oferta não existe na loja", async () => {
    const { svc, offerUpdate, syncRunUpdate } = makeService({
      fetchPrices: [{ externalId: "desconhecido", priceCents: 500 }],
      offers: {},
    });
    await svc.runPriceSync("store1");
    expect(offerUpdate).not.toHaveBeenCalled();
    expect(syncRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ itemsProcessed: 1, itemsFailed: 1, itemsUpdated: 0 }),
      }),
    );
  });
});

describe("ErpService.runStockSync", () => {
  it("faz upsert de estoque com quantidade e disponibilidade", async () => {
    const { svc, stockUpsert } = makeService({
      fetchStock: [{ externalId: "p1", quantity: 12, available: true }],
      offers: { p1: { id: "o1", productId: "prod1", lockedFields: [] } },
      stocks: { prod1: null },
    });
    await svc.runStockSync("store1");
    expect(stockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId_productId: { storeId: "store1", productId: "prod1" } },
        update: { quantity: 12, available: true },
        create: { storeId: "store1", productId: "prod1", quantity: 12, available: true },
      }),
    );
  });

  it("não sobrescreve estoque travado no update, mas mantém o create", async () => {
    const { svc, stockUpsert } = makeService({
      fetchStock: [{ externalId: "p1", quantity: 12, available: false }],
      offers: { p1: { id: "o1", productId: "prod1", lockedFields: [] } },
      stocks: { prod1: { lockedFields: ["quantity"] } },
    });
    await svc.runStockSync("store1");
    expect(stockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { available: false },
        create: { storeId: "store1", productId: "prod1", quantity: 12, available: false },
      }),
    );
  });

  it("conta failed e não faz upsert quando a oferta não existe", async () => {
    const { svc, stockUpsert, syncRunUpdate } = makeService({
      fetchStock: [{ externalId: "desconhecido", quantity: 1, available: true }],
      offers: {},
    });
    await svc.runStockSync("store1");
    expect(stockUpsert).not.toHaveBeenCalled();
    expect(syncRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ itemsProcessed: 1, itemsFailed: 1 }),
      }),
    );
  });
});
