import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { MerchantRole } from "@markethub/api-client";

let role: MerchantRole | null;
let loading = false;
vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ({
    data: role ? { role, merchantId: "m1", stores: [] } : undefined,
    isLoading: loading,
  }),
}));

import { RequireCapability } from "./RequireCapability";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route element={<RequireCapability capability="integration.manage" />}>
          <Route path="/integration" element={<div>integration-page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireCapability (story 07)", () => {
  it("mostra spinner enquanto carrega", () => {
    role = null;
    loading = true;
    renderAt("/integration");
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("owner acessa integração", () => {
    role = "owner";
    loading = false;
    renderAt("/integration");
    expect(screen.getByText("integration-page")).toBeInTheDocument();
  });

  it("manager é redirecionado para a home (sem integração)", () => {
    role = "manager";
    loading = false;
    renderAt("/integration");
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.queryByText("integration-page")).not.toBeInTheDocument();
  });
});
