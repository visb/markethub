import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MerchantContextDTO } from "@markethub/api-client";

let result: { data?: MerchantContextDTO; isLoading: boolean };
vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => result,
}));

import { Stores } from "./Stores";

describe("Stores (placeholder story 07)", () => {
  it("mostra loading", () => {
    result = { data: undefined, isLoading: true };
    render(<Stores />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("estado vazio quando não há lojas", () => {
    result = { data: { role: "owner", merchantId: null, stores: [] }, isLoading: false };
    render(<Stores />);
    expect(screen.getByText("Nenhuma loja cadastrada ainda.")).toBeInTheDocument();
  });

  it("lista as lojas do contexto", () => {
    result = {
      data: {
        role: "manager",
        merchantId: "m1",
        stores: [
          { id: "s1", name: "Loja Centro", merchantId: "m1" },
          { id: "s2", name: "Loja Sul", merchantId: "m1" },
        ],
      },
      isLoading: false,
    };
    render(<Stores />);
    expect(screen.getByText("Loja Centro")).toBeInTheDocument();
    expect(screen.getByText("Loja Sul")).toBeInTheDocument();
  });
});
