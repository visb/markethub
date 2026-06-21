import { BadRequestException } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import type { CatalogService } from "./catalog.service";
import type { StoresNearbyQueryDto } from "./dto/stores-nearby.dto";

function makeController() {
  const listStoresInBounds = jest.fn().mockResolvedValue([{ id: "a" }]);
  const controller = new CatalogController({ listStoresInBounds } as unknown as CatalogService);
  return { controller, listStoresInBounds };
}

describe("CatalogController.storesNearby", () => {
  it("bounds válidos → delega ao service", async () => {
    const { controller, listStoresInBounds } = makeController();
    const q: StoresNearbyQueryDto = { north: 10, south: -10, east: 10, west: -10 };
    const res = await controller.storesNearby(q);
    expect(listStoresInBounds).toHaveBeenCalledWith(q);
    expect(res).toEqual([{ id: "a" }]);
  });

  it("north < south → 400 INVALID_BOUNDS", () => {
    const { controller, listStoresInBounds } = makeController();
    const q: StoresNearbyQueryDto = { north: -10, south: 10, east: 10, west: -10 };
    expect(() => controller.storesNearby(q)).toThrow(BadRequestException);
    expect(listStoresInBounds).not.toHaveBeenCalled();
    try {
      controller.storesNearby(q);
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({ code: "INVALID_BOUNDS" });
    }
  });

  it("east < west → 400 INVALID_BOUNDS", () => {
    const { controller } = makeController();
    const q: StoresNearbyQueryDto = { north: 10, south: -10, east: -10, west: 10 };
    expect(() => controller.storesNearby(q)).toThrow(BadRequestException);
  });
});
