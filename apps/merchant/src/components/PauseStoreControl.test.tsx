import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@markethub/api-client";
import type { MerchantStoreDetailDTO } from "@markethub/api-client";

const toggleMutate = vi.fn();
let isPending = false;

vi.mock("@/api/hooks/useStores", () => ({
  useTogglePauseStore: () => ({ mutate: toggleMutate, isPending }),
}));

import { PauseStoreControl } from "./PauseStoreControl";

const store = (over: Partial<MerchantStoreDetailDTO> = {}): MerchantStoreDetailDTO => ({
  id: "s1",
  merchantId: "m1",
  name: "Loja Centro",
  externalId: null,
  street: null,
  number: null,
  district: null,
  city: null,
  state: null,
  zipCode: null,
  latitude: null,
  longitude: null,
  avgPrepMinutes: 15,
  active: true,
  pausedAt: null,
  ...over,
});

describe("PauseStoreControl (story 57)", () => {
  beforeEach(() => {
    toggleMutate.mockReset();
    isPending = false;
  });
  afterEach(() => vi.restoreAllMocks());

  it("loja operando: mostra 'Pausar loja' e pausa após confirmar", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PauseStoreControl store={store()} />);
    expect(screen.getByText("A loja está recebendo pedidos normalmente.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pausar loja" }));
    expect(toggleMutate).toHaveBeenCalledTimes(1);
    expect(toggleMutate.mock.calls[0][0]).toBe(true);
  });

  it("cancelar o confirm não dispara a mutation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PauseStoreControl store={store()} />);
    fireEvent.click(screen.getByRole("button", { name: "Pausar loja" }));
    expect(toggleMutate).not.toHaveBeenCalled();
  });

  it("loja pausada: mostra badge 'Pausada desde HH:MM' e botão 'Retomar loja'", () => {
    render(<PauseStoreControl store={store({ pausedAt: "2026-07-12T13:05:00.000Z" })} />);
    // HH:MM depende do fuso local do runner; o prefixo é estável.
    expect(screen.getByText(/Pausada desde/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retomar loja" })).toBeInTheDocument();
  });

  it("retomar chama a mutation com false", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PauseStoreControl store={store({ pausedAt: "2026-07-12T13:05:00.000Z" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Retomar loja" }));
    expect(toggleMutate.mock.calls[0][0]).toBe(false);
  });

  it("erro da mutation exibe a mensagem do backend", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    toggleMutate.mockImplementation((_v: boolean, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.(new ApiClientError(403, { code: "NOT_AN_OWNER", message: "Sem permissão" })),
    );
    render(<PauseStoreControl store={store()} />);
    fireEvent.click(screen.getByRole("button", { name: "Pausar loja" }));
    expect(screen.getByText("Sem permissão")).toBeInTheDocument();
  });
});
