import { AddressesController, CoverageController } from "./addresses.controller";
import type { AddressesService } from "./addresses.service";
import { COVERED_CITIES } from "./coverage";
import type { AuthUser } from "../auth";

/** Story 43: controllers finos de endereços + cobertura — delegação pura. */
function make() {
  const svc = {
    list: jest.fn().mockResolvedValue([{ id: "a1" }]),
    create: jest.fn().mockResolvedValue({ id: "a2" }),
    update: jest.fn().mockResolvedValue({ id: "a1" }),
    remove: jest.fn().mockResolvedValue({ removed: true }),
    setDefault: jest.fn().mockResolvedValue({ id: "a1", isDefault: true }),
  };
  const controller = new AddressesController(svc as unknown as AddressesService);
  const user: AuthUser = { id: "u1", email: "c@x.com", roles: ["customer"] };
  return { controller, svc, user };
}

const dto = {
  label: "Casa",
  street: "Rua A",
  number: "10",
  city: "Curitiba",
  state: "PR",
  zipCode: "80000000",
};

describe("AddressesController", () => {
  it("GET list delega com user.id", async () => {
    const { controller, svc, user } = make();
    expect(await controller.list(user)).toEqual([{ id: "a1" }]);
    expect(svc.list).toHaveBeenCalledWith("u1");
  });

  it("POST create delega user.id + dto", async () => {
    const { controller, svc, user } = make();
    await controller.create(user, dto);
    expect(svc.create).toHaveBeenCalledWith("u1", dto);
  });

  it("PATCH :id delega id + dto", async () => {
    const { controller, svc, user } = make();
    await controller.update(user, "a1", { label: "Trabalho" });
    expect(svc.update).toHaveBeenCalledWith("u1", "a1", { label: "Trabalho" });
  });

  it("DELETE :id delega", async () => {
    const { controller, svc, user } = make();
    expect(await controller.remove(user, "a1")).toEqual({ removed: true });
    expect(svc.remove).toHaveBeenCalledWith("u1", "a1");
  });

  it("POST :id/default delega", async () => {
    const { controller, svc, user } = make();
    await controller.setDefault(user, "a1");
    expect(svc.setDefault).toHaveBeenCalledWith("u1", "a1");
  });
});

describe("CoverageController", () => {
  it("GET cities devolve as cidades cobertas", () => {
    expect(new CoverageController().cities()).toBe(COVERED_CITIES);
  });
});
