import { PickingGateway } from "./picking.gateway";

/**
 * Story 12: subscribe:store autoriza o DONO da rede (RoleName merchant) cuja rede
 * possui a loja, além de admin/StoreStaff. Terceiros seguem negados.
 */

function makeGateway(opts: {
  staff?: { id: string } | null;
  store?: { merchantId: string } | null;
  owned?: { id: string } | null;
}) {
  const findFirst = jest
    .fn()
    // 1ª chamada: vínculo StoreStaff direto na loja
    .mockResolvedValueOnce(opts.staff ?? null)
    // 2ª chamada (só p/ owner): vínculo em alguma loja da mesma rede
    .mockResolvedValueOnce(opts.owned ?? null);
  const prisma = {
    storeStaff: { findFirst },
    store: { findUnique: jest.fn().mockResolvedValue(opts.store ?? null) },
  } as never;
  const gateway = new PickingGateway({} as never, {} as never, prisma);
  return { gateway };
}

function clientWith(roles: string[], userId = "u1") {
  const joined: string[] = [];
  return {
    data: { user: { id: userId, roles } },
    join: jest.fn((room: string) => joined.push(room)),
    joined,
  };
}

describe("PickingGateway.subscribeStore — autorização (story 12)", () => {
  it("dono da rede que possui a loja: autoriza e entra na store room", async () => {
    const { gateway } = makeGateway({
      staff: null,
      store: { merchantId: "m1" },
      owned: { id: "ss1" },
    });
    const client = clientWith(["merchant"]);
    const res = await gateway.subscribeStore(client as never, { storeId: "s1" });
    expect(res).toEqual({ ok: true });
    expect(client.join).toHaveBeenCalledWith("store:s1");
  });

  it("staff ativo da loja: autoriza (regressão)", async () => {
    const { gateway } = makeGateway({ staff: { id: "ss1" } });
    const client = clientWith(["picker"]);
    const res = await gateway.subscribeStore(client as never, { storeId: "s1" });
    expect(res).toEqual({ ok: true });
  });

  it("dono de OUTRA rede (sem vínculo na rede da loja): nega", async () => {
    const { gateway } = makeGateway({
      staff: null,
      store: { merchantId: "m1" },
      owned: null,
    });
    const client = clientWith(["merchant"]);
    const res = await gateway.subscribeStore(client as never, { storeId: "s1" });
    expect(res).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(client.join).not.toHaveBeenCalled();
  });

  it("terceiro sem papel/vínculo: nega", async () => {
    const { gateway } = makeGateway({ staff: null });
    const client = clientWith(["customer"]);
    const res = await gateway.subscribeStore(client as never, { storeId: "s1" });
    expect(res).toEqual({ ok: false, code: "FORBIDDEN" });
  });
});
