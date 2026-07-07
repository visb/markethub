/**
 * Espera de efeito ASSÍNCRONO nos e2e (story 46). Desde a story 45 os
 * side-effects de domínio (gerar picking, cobrança PIX, criação da Delivery…)
 * rodam via outbox → relay (poll BullMQ) → handler — não existem logo após a
 * resposta HTTP. Este helper faz poll do banco até o efeito materializar,
 * exercitando o pipeline REAL (Redis/BullMQ de teste), sem sleep cego.
 */
export async function waitFor<T>(
  probe: () => Promise<T | null | undefined>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const intervalMs = opts.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await probe();
    if (result !== null && result !== undefined) return result;
    if (Date.now() > deadline) {
      throw new Error(
        `waitFor: efeito assíncrono não materializou em ${timeoutMs}ms${opts.label ? ` (${opts.label})` : ""}`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
