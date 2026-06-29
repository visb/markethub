import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductDetail } from "./ProductDetail";

/**
 * C18: comportamento do form de ProductDetail — o save manda só os campos
 * ALTERADOS (diff-only), pra não travar (lockedFields) o que o admin não tocou.
 * Obs: a tela usa useState (não rhf+zod) — desvio sistêmico em B20; o teste
 * cobre o contrato de PATCH que de fato existe.
 */
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ id: "p1" }) };
});

const PRODUCT = {
  id: "p1",
  name: "Arroz",
  brand: "Marca Antiga",
  packageSize: "1kg",
  saleType: "unit",
  imageUrl: "",
  gtin: "789",
  enrichmentStatus: "enriched",
  completenessScore: 80,
  lockedFields: [],
  category: null,
  enrichment: null,
  offers: [],
};

let request: ReturnType<typeof vi.fn>;
// api precisa ter identidade ESTÁVEL entre renders: o load() do componente é
// useCallback([api,id]); se o objeto mudar a cada render, o useEffect entra em
// loop infinito. Por isso um stub fixo que delega ao mock corrente.
const apiStub = {
  request: (...args: unknown[]) => (request as unknown as (...a: unknown[]) => unknown)(...args),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

function renderDetail() {
  return render(
    <MemoryRouter>
      <ProductDetail />
    </MemoryRouter>,
  );
}

describe("ProductDetail save (diff-only)", () => {
  beforeEach(() => {
    request = vi.fn((_path: string, opts?: { method?: string }) =>
      opts?.method === "PATCH" ? Promise.resolve({}) : Promise.resolve(PRODUCT),
    );
  });

  it("envia apenas o campo alterado no PATCH", async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByDisplayValue("Marca Antiga")).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue("Marca Antiga"), { target: { value: "Marca Nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const patch = request.mock.calls.find((c) => c[1]?.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(patch![1].body).toEqual({ brand: "Marca Nova" });
    });
  });

  it("sem alteração não dispara PATCH e avisa 'Nada alterado.'", async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByDisplayValue("Arroz")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await screen.findByText("Nada alterado.");
    expect(request.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(false);
  });

  it("PATCH de campo select (saleType) e mensagem de sucesso", async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByDisplayValue("Arroz")).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue("Unidade (embalado)"), {
      target: { value: "weight" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await screen.findByText("Salvo (campos alterados travados contra enriquecimento automático).");
    const patch = request.mock.calls.find((c) => c[1]?.method === "PATCH");
    expect(patch![1].body).toEqual({ saleType: "weight" });
  });

  it("envia os dois campos no PATCH quando ambos mudam (diff múltiplo)", async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByDisplayValue("Arroz")).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue("Arroz"), { target: { value: "Arroz Novo" } });
    fireEvent.change(screen.getByDisplayValue("1kg"), { target: { value: "5kg" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const patch = request.mock.calls.find((c) => c[1]?.method === "PATCH");
      expect(patch![1].body).toEqual({ name: "Arroz Novo", packageSize: "5kg" });
    });
  });

  it("re-enriquecer chama POST /enrich e avisa 'Re-enriquecido.'", async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByDisplayValue("Arroz")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Re-enriquecer" }));

    await screen.findByText("Re-enriquecido.");
    const enrich = request.mock.calls.find(
      (c) => c[1]?.method === "POST" && String(c[0]).endsWith("/enrich"),
    );
    expect(enrich).toBeTruthy();
    expect(enrich![0]).toBe("/admin/products/p1/enrich");
  });
});

describe("ProductDetail lockedFields", () => {
  beforeEach(() => {
    const locked = { ...PRODUCT, lockedFields: ["brand"] };
    request = vi.fn((_path: string, opts?: { method?: string }) => {
      if (opts?.method === "POST" || opts?.method === "PATCH") return Promise.resolve({});
      return Promise.resolve(locked);
    });
  });

  it("mostra os campos travados e o botão de destravar", async () => {
    renderDetail();
    await screen.findByDisplayValue("Marca Antiga");
    expect(screen.getByText("brand")).toBeInTheDocument();
    // botão tem title="destravar" (texto inclui emoji 🔒, que atrapalha o name)
    expect(screen.getByTitle("destravar")).toBeInTheDocument();
  });

  it("destravar chama POST /unlock com o campo e recarrega", async () => {
    renderDetail();
    await screen.findByDisplayValue("Marca Antiga");

    fireEvent.click(screen.getByTitle("destravar"));

    await waitFor(() => {
      const unlock = request.mock.calls.find(
        (c) => c[1]?.method === "POST" && String(c[0]).endsWith("/unlock"),
      );
      expect(unlock).toBeTruthy();
      expect(unlock![1].body).toEqual({ fields: ["brand"] });
    });
  });
});
