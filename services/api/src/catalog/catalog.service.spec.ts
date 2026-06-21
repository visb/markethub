import { CatalogService, NEARBY_STORES_CAP, type ViewportBounds } from "./catalog.service";

type StoreRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  avgPrepMinutes: number;
  merchant: { name: string; logoUrl: string | null };
};

function makeStore(id: string, latitude: number | null, longitude: number | null): StoreRow {
  return {
    id,
    name: `Loja ${id}`,
    city: "São Paulo",
    state: "SP",
    latitude,
    longitude,
    avgPrepMinutes: 15,
    merchant: { name: `Mercado ${id}`, logoUrl: null },
  };
}

/**
 * `findMany` recebe o `where`/`take`; o mock devolve `rows` (já filtrados pelo teste
 * conforme o cenário) e expõe os args p/ asserts sobre o filtro/teto enviados ao Prisma.
 */
function makePrisma(rows: StoreRow[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  return { prisma: { store: { findMany } } as never, findMany };
}

const bounds: ViewportBounds = { north: 10, south: -10, east: 10, west: -10 };

describe("CatalogService.listStoresInBounds", () => {
  it("filtra por lat/lng no range e exclui nulos via where do Prisma", async () => {
    const { prisma, findMany } = makePrisma([makeStore("a", 1, 1)]);
    const svc = new CatalogService(prisma);
    await svc.listStoresInBounds(bounds);

    const where = findMany.mock.calls[0][0].where;
    expect(where.active).toBe(true);
    expect(where.latitude).toEqual({ not: null, gte: -10, lte: 10 });
    expect(where.longitude).toEqual({ not: null, gte: -10, lte: 10 });
  });

  it("mapeia para o shape enxuto de marcador (sem produtos)", async () => {
    const { prisma } = makePrisma([makeStore("a", 1, 2)]);
    const svc = new CatalogService(prisma);
    const [s] = await svc.listStoresInBounds(bounds);

    expect(s).toEqual({
      id: "a",
      name: "Loja a",
      latitude: 1,
      longitude: 2,
      city: "São Paulo",
      state: "SP",
      avgPrepMinutes: 15,
      merchantName: "Mercado a",
      merchantLogoUrl: null,
    });
  });

  it("aplica o teto NEARBY_STORES_CAP no take", async () => {
    const { prisma, findMany } = makePrisma([]);
    const svc = new CatalogService(prisma);
    await svc.listStoresInBounds(bounds);
    expect(findMany.mock.calls[0][0].take).toBe(NEARBY_STORES_CAP);
  });

  it("ordena pela proximidade ao centro do box", async () => {
    // centro do box = (0,0). 'perto' a (1,1); 'longe' a (9,9).
    const { prisma } = makePrisma([makeStore("longe", 9, 9), makeStore("perto", 1, 1)]);
    const svc = new CatalogService(prisma);
    const result = await svc.listStoresInBounds(bounds);
    expect(result.map((s) => s.id)).toEqual(["perto", "longe"]);
  });
});
