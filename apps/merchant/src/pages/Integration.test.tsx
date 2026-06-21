import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Painéis mockados: a página só orquestra as abas.
vi.mock("@/components/integration/ErpConfigPanel", () => ({
  ErpConfigPanel: () => <div>painel-erp</div>,
}));
vi.mock("@/components/integration/ApiKeysPanel", () => ({
  ApiKeysPanel: () => <div>painel-apikeys</div>,
}));
vi.mock("@/components/integration/WebhooksPanel", () => ({
  WebhooksPanel: () => <div>painel-webhooks</div>,
}));

import { Integration } from "./Integration";

describe("Integration (story 09) — abas", () => {
  it("mostra ERP por padrão", () => {
    render(<Integration />);
    expect(screen.getByText("painel-erp")).toBeInTheDocument();
    expect(screen.queryByText("painel-apikeys")).not.toBeInTheDocument();
  });

  it("troca para API keys e Webhooks", () => {
    render(<Integration />);
    fireEvent.click(screen.getByRole("tab", { name: "API keys" }));
    expect(screen.getByText("painel-apikeys")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Webhooks" }));
    expect(screen.getByText("painel-webhooks")).toBeInTheDocument();
  });
});
