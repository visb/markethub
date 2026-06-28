import type { Job } from "bullmq";
import { ErpProcessor } from "./erp.processor";
import type { ErpService } from "./erp.service";
import type { ErpJobData, ErpJobName } from "./erp.queue";

/**
 * Backfill de cobertura (story 26). O processor é wiring de fila (excluído do
 * coverage pelo gate 19), mas o roteamento de jobs precisa de spec: cada nome
 * de job aciona o método correto do ErpService, com delta opcional.
 */

function makeProcessor() {
  const erp = {
    runFullSync: jest.fn().mockResolvedValue("run-full"),
    runPriceSync: jest.fn().mockResolvedValue("run-price"),
    runStockSync: jest.fn().mockResolvedValue("run-stock"),
  } as unknown as ErpService;
  return { processor: new ErpProcessor(erp), erp };
}

function job(name: ErpJobName, data: ErpJobData): Job<ErpJobData, unknown, ErpJobName> {
  return { name, data } as Job<ErpJobData, unknown, ErpJobName>;
}

describe("ErpProcessor.process", () => {
  it("roteia full → runFullSync", async () => {
    const { processor, erp } = makeProcessor();
    const res = await processor.process(job("full", { storeId: "s1" }));
    expect(erp.runFullSync).toHaveBeenCalledWith("s1");
    expect(res).toEqual({ runId: "run-full" });
  });

  it("roteia prices → runPriceSync sem delta quando since ausente", async () => {
    const { processor, erp } = makeProcessor();
    const res = await processor.process(job("prices", { storeId: "s1" }));
    expect(erp.runPriceSync).toHaveBeenCalledWith("s1", undefined);
    expect(res).toEqual({ runId: "run-price" });
  });

  it("roteia stock → runStockSync convertendo since em Date", async () => {
    const { processor, erp } = makeProcessor();
    const since = "2026-06-01T00:00:00.000Z";
    const res = await processor.process(job("stock", { storeId: "s1", since }));
    expect(erp.runStockSync).toHaveBeenCalledWith("s1", new Date(since));
    expect(res).toEqual({ runId: "run-stock" });
  });

  it("lança para job desconhecido", async () => {
    const { processor } = makeProcessor();
    await expect(
      processor.process(job("xpto" as ErpJobName, { storeId: "s1" })),
    ).rejects.toThrow(/Unknown ERP job/);
  });
});
