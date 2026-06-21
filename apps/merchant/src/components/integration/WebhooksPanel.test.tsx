import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebhookCreatedDTO, WebhookDTO } from "@markethub/api-client";

let hooksResult: { data?: WebhookDTO[]; isLoading: boolean };
const createMutate = vi.fn();
const removeMutate = vi.fn();
const testMutate = vi.fn();

vi.mock("@/api/hooks/useIntegration", () => ({
  useWebhooks: () => hooksResult,
  useCreateWebhook: () => ({ mutate: createMutate, isPending: false }),
  useDeleteWebhook: () => ({ mutate: removeMutate, isPending: false }),
  useTestWebhook: () => ({ mutate: testMutate, isPending: false }),
}));

import { WebhooksPanel } from "./WebhooksPanel";

const hook = (over: Partial<WebhookDTO> = {}): WebhookDTO => ({
  id: "w1",
  url: "https://erp.example/wh",
  events: ["order.created"],
  active: true,
  secretMasked: "****abcd",
  lastDeliveryStatus: "ok",
  lastDeliveryAt: "2026-06-21T00:00:00.000Z",
  createdAt: "2026-06-21T00:00:00.000Z",
  ...over,
});

describe("WebhooksPanel (story 09)", () => {
  beforeEach(() => {
    createMutate.mockClear();
    removeMutate.mockClear();
    testMutate.mockClear();
    hooksResult = { data: [hook()], isLoading: false };
  });

  it("lista webhooks com secret mascarado e status da última entrega", () => {
    render(<WebhooksPanel />);
    expect(screen.getByText("https://erp.example/wh")).toBeInTheDocument();
    expect(screen.getByText(/secret \*\*\*\*abcd/)).toBeInTheDocument();
    expect(screen.getByText(/última entrega: ok/)).toBeInTheDocument();
  });

  it("criar revela o secret UMA vez", async () => {
    const created: WebhookCreatedDTO = { ...hook({ id: "w2" }), secret: "whsec_revealed" };
    createMutate.mockImplementation((_input, opts) => opts.onSuccess?.(created));
    render(<WebhooksPanel />);
    fireEvent.change(screen.getByPlaceholderText("https://seu-erp/webhooks"), {
      target: { value: "https://novo.example/wh" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar webhook" }));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(screen.getByText("whsec_revealed")).toBeInTheDocument();
  });

  it("URL inválida não chama a mutation (zod)", async () => {
    render(<WebhooksPanel />);
    fireEvent.change(screen.getByPlaceholderText("https://seu-erp/webhooks"), {
      target: { value: "nada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar webhook" }));
    expect(await screen.findByText("URL inválida")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("testar dispara a mutation e mostra confirmação", async () => {
    testMutate.mockImplementation((_id, opts) => opts.onSuccess?.());
    render(<WebhooksPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Testar" }));
    expect(testMutate).toHaveBeenCalledWith("w1", expect.any(Object));
    expect(await screen.findByText("Ping de teste enfileirado.")).toBeInTheDocument();
  });

  it("remover dispara a mutation", () => {
    render(<WebhooksPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(removeMutate).toHaveBeenCalledWith("w1");
  });
});
