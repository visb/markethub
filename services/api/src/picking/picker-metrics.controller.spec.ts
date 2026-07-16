import { PickerMetricsController } from "./picker-metrics.controller";
import type { PickerMetricsService } from "./picker-metrics.service";
import type { AuthUser } from "../auth";

/** Story 65: controller fino — delega ao service com o período (default today). */
function make() {
  const metrics = { myMetrics: jest.fn().mockResolvedValue({ period: "today", tasksCompleted: 0 }) };
  const controller = new PickerMetricsController(metrics as unknown as PickerMetricsService);
  const user: AuthUser = { id: "u1", email: "p@x.com", roles: ["picker"] };
  return { controller, metrics, user };
}

describe("PickerMetricsController", () => {
  it("GET me sem período usa today", async () => {
    const { controller, metrics, user } = make();
    await controller.me(user, {});
    expect(metrics.myMetrics).toHaveBeenCalledWith("u1", "today");
  });

  it("GET me repassa o período informado", async () => {
    const { controller, metrics, user } = make();
    await controller.me(user, { period: "30d" });
    expect(metrics.myMetrics).toHaveBeenCalledWith("u1", "30d");
  });
});
