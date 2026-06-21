import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiKeyCreatedDTO, ApiKeyDTO } from "@markethub/api-client";

let keysResult: { data?: ApiKeyDTO[]; isLoading: boolean };
const createMutate = vi.fn();
const revokeMutate = vi.fn();

vi.mock("@/api/hooks/useIntegration", () => ({
  useApiKeys: () => keysResult,
  useCreateApiKey: () => ({ mutate: createMutate, isPending: false }),
  useRevokeApiKey: () => ({ mutate: revokeMutate, isPending: false }),
}));

import { ApiKeysPanel } from "./ApiKeysPanel";

const key = (over: Partial<ApiKeyDTO> = {}): ApiKeyDTO => ({
  id: "k1",
  name: "ERP",
  prefix: "mk_live_aaaaaa",
  createdAt: "2026-06-21T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  ...over,
});

describe("ApiKeysPanel (story 09)", () => {
  beforeEach(() => {
    createMutate.mockClear();
    revokeMutate.mockClear();
    keysResult = { data: [key()], isLoading: false };
  });

  it("lista chaves com prefixo (nunca o valor)", () => {
    render(<ApiKeysPanel />);
    expect(screen.getByText("ERP")).toBeInTheDocument();
    expect(screen.getByText(/mk_live_aaaaaa/)).toBeInTheDocument();
  });

  it("criar revela a chave UMA vez no modal", async () => {
    const created: ApiKeyCreatedDTO = {
      id: "k2",
      name: "Nova",
      prefix: "mk_live_bbbbbb",
      createdAt: "2026-06-21T00:00:00.000Z",
      key: "mk_live_supersecretvalue",
    };
    createMutate.mockImplementation((_name, opts) => opts.onSuccess?.(created));
    render(<ApiKeysPanel />);
    fireEvent.change(screen.getByPlaceholderText("Ex.: ERP da loja"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gerar" }));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(screen.getByText("mk_live_supersecretvalue")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Api-key criada" })).toBeInTheDocument();
  });

  it("nome vazio não chama a mutation (validação zod)", async () => {
    render(<ApiKeysPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar" }));
    expect(await screen.findByText("Informe um nome")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("revogar chama a mutation", () => {
    render(<ApiKeysPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Revogar" }));
    expect(revokeMutate).toHaveBeenCalledWith("k1");
  });

  it("chave revogada não mostra botão Revogar", () => {
    keysResult = { data: [key({ revokedAt: "2026-06-21T00:00:00.000Z" })], isLoading: false };
    render(<ApiKeysPanel />);
    expect(screen.getByText("revogada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revogar" })).not.toBeInTheDocument();
  });
});
