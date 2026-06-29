import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MerchantDetail } from "./MerchantDetail";

/**
 * Detalhe do mercado: dados da rede, edição, ativar/desativar, lista de lojas,
 * criação de loja e upload de logo. Mock do ApiClient (api.request) + fetch, sem rede.
 */
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ merchantId: "m1" }) };
});

let request: ReturnType<typeof vi.fn>;
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

const DETAIL = {
  id: "m1",
  name: "Rede Boa Compra",
  slug: "boa-compra",
  logoUrl: null as string | null,
  active: true,
  deliveryFeeCents: 700,
  prepFeeCents: 0,
  platformFeeBps: 1000,
  connectorType: "csv",
  stores: [
    {
      id: "s1",
      name: "Loja Centro",
      city: "São Paulo",
      state: "SP",
      active: true,
      offerCount: 42,
      staffCount: 5,
    },
  ],
};

function renderDetail() {
  return render(
    <MemoryRouter>
      <MerchantDetail />
    </MemoryRouter>,
  );
}

describe("MerchantDetail", () => {
  beforeEach(() => {
    request = vi.fn(() => Promise.resolve(DETAIL));
  });

  it("renderiza os dados da rede e a tabela de lojas", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Rede Boa Compra" });
    expect(screen.getByText(/slug: boa-compra/)).toBeInTheDocument();
    expect(screen.getByText("Loja Centro")).toBeInTheDocument();
    expect(screen.getByText("São Paulo/SP")).toBeInTheDocument();
  });

  it("mostra 'não encontrado' quando a API devolve null", async () => {
    request = vi.fn(() => Promise.resolve(null));
    renderDetail();
    await screen.findByText("Mercado não encontrado.");
  });

  it("alterna ativo/inativo via PATCH", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Rede Boa Compra" });
    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    await waitFor(() => {
      const patch = request.mock.calls.find((c) => c[1]?.method === "PATCH");
      expect(patch![1].body).toEqual({ active: false });
    });
  });

  it("edita os dados da rede e salva via PATCH", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Rede Boa Compra" });
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByPlaceholderText("Nome"), { target: { value: "Rede Nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => {
      const patch = request.mock.calls.find(
        (c) => c[1]?.method === "PATCH" && c[1]?.body?.name === "Rede Nova",
      );
      expect(patch![1].body).toMatchObject({ name: "Rede Nova", deliveryFeeCents: 700 });
    });
  });

  it("exibe erro quando salvar a edição falha", async () => {
    request = vi.fn((_path: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") return Promise.reject(new Error("Falhou patch"));
      return Promise.resolve(DETAIL);
    });
    renderDetail();
    await screen.findByRole("heading", { name: "Rede Boa Compra" });
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Falhou patch");
  });

  it("cria uma nova loja via formulário", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Rede Boa Compra" });
    fireEvent.click(screen.getByRole("button", { name: "+ Nova loja" }));
    fireEvent.change(screen.getByPlaceholderText("Nome"), { target: { value: "Loja Sul" } });
    fireEvent.change(screen.getByPlaceholderText("Cidade"), { target: { value: "Porto Alegre" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar loja" }));
    await waitFor(() => {
      const post = request.mock.calls.find(
        (c) => c[1]?.method === "POST" && String(c[0]).includes("/admin/stores"),
      );
      expect(post![1].body).toMatchObject({ merchantId: "m1", name: "Loja Sul", city: "Porto Alegre" });
    });
  });

  it("faz upload de logo: presign → PUT → PATCH logoUrl", async () => {
    request = vi.fn((path: string) => {
      if (String(path).includes("logo-upload-url")) {
        return Promise.resolve({
          uploadUrl: "https://storage/up",
          publicUrl: "https://cdn/logo.png",
          headers: { "x-test": "1" },
        });
      }
      return Promise.resolve(DETAIL);
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    // pick() cria um <input type=file> dinâmico e chama input.click(); capturamos
    // o elemento via spy no prototype, injetamos o arquivo e disparamos onchange.
    const file = new File(["x"], "logo.png", { type: "image/png" });
    let captured: HTMLInputElement | null = null;
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        captured = this;
      });

    renderDetail();
    await screen.findByRole("heading", { name: "Rede Boa Compra" });
    fireEvent.click(screen.getByTitle("Clique para trocar a logo"));

    expect(captured).toBeTruthy();
    Object.defineProperty(captured!, "files", { value: [file] });
    await captured!.onchange?.(new Event("change"));

    await waitFor(() => {
      const patch = request.mock.calls.find(
        (c) => c[1]?.method === "PATCH" && c[1]?.body?.logoUrl === "https://cdn/logo.png",
      );
      expect(patch).toBeTruthy();
    });
    expect(fetchSpy).toHaveBeenCalledWith("https://storage/up", expect.objectContaining({ method: "PUT" }));
    clickSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});
