import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import type { Env } from "../config/env";
import { OutboxRelayScheduler } from "./outbox-relay.scheduler";

/**
 * Story 45: o scheduler registra o poll do outbox como repeatable job BullMQ
 * (upsert idempotente) respeitando OUTBOX_RELAY_ENABLED/OUTBOX_POLL_INTERVAL_MS.
 */

function makeScheduler(opts: { enabled: boolean; every?: number }) {
  const config = {
    get: jest.fn((key: string) => {
      if (key === "OUTBOX_RELAY_ENABLED") return opts.enabled;
      if (key === "OUTBOX_POLL_INTERVAL_MS") return opts.every ?? 2000;
      return undefined;
    }),
  } as unknown as ConfigService<Env, true>;
  const upsertJobScheduler = jest.fn().mockResolvedValue({});
  const queue = { upsertJobScheduler } as unknown as Queue;
  return { scheduler: new OutboxRelayScheduler(config, queue), upsertJobScheduler };
}

describe("OutboxRelayScheduler.onModuleInit", () => {
  it("desabilitado: não registra o repeatable job", async () => {
    const { scheduler, upsertJobScheduler } = makeScheduler({ enabled: false });
    await scheduler.onModuleInit();
    expect(upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("habilitado: upsert do poll com o intervalo do env", async () => {
    const { scheduler, upsertJobScheduler } = makeScheduler({ enabled: true, every: 1500 });
    await scheduler.onModuleInit();
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "outbox-relay-poll",
      { every: 1500 },
      { name: "poll" },
    );
  });
});
