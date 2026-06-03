import { Logger } from "@nestjs/common";
import type {
  PushMessage,
  PushProvider,
  PushSendResult,
  PushTarget,
} from "../push-provider.interface";

/** Provedor de push fake (dev/test): só registra no log. */
export class MockPushProvider implements PushProvider {
  readonly name = "mock";
  private readonly logger = new Logger("MockPushProvider");

  send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult> {
    this.logger.log(
      `[push] -> ${targets.length} device(s): ${message.title} — ${message.body}`,
    );
    return Promise.resolve({ invalidTokens: [] });
  }
}
