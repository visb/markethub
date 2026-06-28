import type { Job } from "bullmq";
import { EnrichmentProcessor } from "./enrichment.processor";
import type { EnrichmentService } from "./enrichment.service";
import type { EnrichJobData, EnrichJobName } from "./enrichment.queue";

/**
 * Backfill de cobertura (story 26). Processor de fila (excluído do coverage pelo
 * gate 19); o spec garante o roteamento de cada job ao método do service.
 */

function makeProcessor() {
  const enrichment = {
    enrichProduct: jest.fn().mockResolvedValue({ ok: "product" }),
    enrichStore: jest.fn().mockResolvedValue({ ok: "store" }),
    enrichPending: jest.fn().mockResolvedValue({ ok: "pending" }),
  } as unknown as EnrichmentService;
  return { processor: new EnrichmentProcessor(enrichment), enrichment };
}

function job(name: EnrichJobName, data: EnrichJobData): Job<EnrichJobData, unknown, EnrichJobName> {
  return { name, data } as Job<EnrichJobData, unknown, EnrichJobName>;
}

describe("EnrichmentProcessor.process", () => {
  it("roteia product → enrichProduct", async () => {
    const { processor, enrichment } = makeProcessor();
    const res = await processor.process(job("product", { productId: "p1" }));
    expect(enrichment.enrichProduct).toHaveBeenCalledWith("p1");
    expect(res).toEqual({ ok: "product" });
  });

  it("roteia store → enrichStore", async () => {
    const { processor, enrichment } = makeProcessor();
    const res = await processor.process(job("store", { storeId: "s1" }));
    expect(enrichment.enrichStore).toHaveBeenCalledWith("s1");
    expect(res).toEqual({ ok: "store" });
  });

  it("roteia pending → enrichPending", async () => {
    const { processor, enrichment } = makeProcessor();
    const res = await processor.process(job("pending", {}));
    expect(enrichment.enrichPending).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: "pending" });
  });

  it("lança para job desconhecido", async () => {
    const { processor } = makeProcessor();
    await expect(
      processor.process(job("xpto" as EnrichJobName, {})),
    ).rejects.toThrow(/Unknown enrichment job/);
  });
});
