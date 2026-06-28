import { SubstitutionScheduler } from "./substitution.scheduler";
import type { SubstitutionService } from "./substitution.service";

/**
 * Backfill de cobertura (story 22). O scheduler só delega à política de timeout
 * do service no disparo do cron — garante que resolveExpired é chamado e que o
 * log de resumo só sai quando houve resolução.
 */

function makeScheduler(resolved: number) {
  const resolveExpired = jest.fn().mockResolvedValue(resolved);
  const service = { resolveExpired } as unknown as SubstitutionService;
  const scheduler = new SubstitutionScheduler(service);
  const log = jest.spyOn(scheduler["logger"], "log").mockImplementation(() => undefined);
  return { scheduler, resolveExpired, log };
}

describe("SubstitutionScheduler.resolveExpired", () => {
  it("dispara a política de timeout do service e loga quando resolve algo", async () => {
    const { scheduler, resolveExpired, log } = makeScheduler(3);
    await scheduler.resolveExpired();
    expect(resolveExpired).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("3"));
  });

  it("não loga quando nada foi resolvido", async () => {
    const { scheduler, resolveExpired, log } = makeScheduler(0);
    await scheduler.resolveExpired();
    expect(resolveExpired).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });
});
