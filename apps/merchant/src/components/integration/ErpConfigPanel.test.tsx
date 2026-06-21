import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErpConfigDTO } from "@markethub/api-client";

let erpResult: { data?: ErpConfigDTO; isLoading: boolean };
const putMutate = vi.fn();
let mutationState: { isPending: boolean; isError: boolean; isSuccess: boolean; error?: unknown };

vi.mock("@/api/hooks/useIntegration", () => ({
  useErpConfig: () => erpResult,
  usePutErpConfig: () => ({ mutate: putMutate, reset: vi.fn(), ...mutationState }),
}));

import { ErpConfigPanel } from "./ErpConfigPanel";

describe("ErpConfigPanel (story 09)", () => {
  beforeEach(() => {
    putMutate.mockClear();
    mutationState = { isPending: false, isError: false, isSuccess: false };
    erpResult = {
      data: {
        connectorType: "csv",
        connectorConfig: { dir: "/data", apiKey: "****cret" },
        availableTypes: ["csv"],
      },
      isLoading: false,
    };
  });

  it("renderiza o form do tipo csv com o diretório atual", () => {
    render(<ErpConfigPanel />);
    expect(screen.getByDisplayValue("/data")).toBeInTheDocument();
  });

  it("salva connectorType + config (csv → dir)", async () => {
    render(<ErpConfigPanel />);
    fireEvent.change(screen.getByDisplayValue("/data"), { target: { value: "/novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(putMutate).toHaveBeenCalledTimes(1));
    expect(putMutate.mock.calls[0][0]).toMatchObject({
      connectorType: "csv",
      connectorConfig: { dir: "/novo" },
    });
  });

  it("mostra erro do backend", () => {
    mutationState = { isPending: false, isError: true, isSuccess: false };
    render(<ErpConfigPanel />);
    expect(screen.getByText("Falha ao salvar a configuração.")).toBeInTheDocument();
  });

  it("loading", () => {
    erpResult = { data: undefined, isLoading: true };
    render(<ErpConfigPanel />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });
});
