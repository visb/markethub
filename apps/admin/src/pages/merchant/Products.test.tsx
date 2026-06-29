import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Products } from "./Products";

/**
 * Cadastro de produto local do merchant: form + upload de imagem (presign → PUT)
 * + criação com aviso de duplicata. Métodos tipados do ApiClient mockados + fetch.
 */
const merchantStores = vi.fn();
const merchantUploadUrl = vi.fn();
const merchantCreateProduct = vi.fn();
const apiStub = {
  merchantStores: () => merchantStores(),
  merchantUploadUrl: (...a: unknown[]) => merchantUploadUrl(...a),
  merchantCreateProduct: (...a: unknown[]) => merchantCreateProduct(...a),
};
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: apiStub }),
}));

describe("Products", () => {
  beforeEach(() => {
    merchantStores.mockResolvedValue([{ id: "s1", name: "Centro" }]);
    merchantCreateProduct.mockResolvedValue({ reused: false, warnings: [] });
  });

  it("renderiza o formulário e desabilita o submit sem nome/preço", async () => {
    render(<Products />);
    await screen.findByRole("heading", { name: "Cadastrar produto" });
    expect(screen.getByRole("button", { name: "Cadastrar produto" })).toBeDisabled();
  });

  it("cria produto com nome e preço, convertendo reais em centavos", async () => {
    render(<Products />);
    await screen.findByRole("heading", { name: "Cadastrar produto" });
    fireEvent.change(screen.getByLabelText(/Nome\*/), { target: { value: "Bolo Caseiro" } });
    fireEvent.change(screen.getByLabelText(/Preço \(R\$\)\*/), { target: { value: "12,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar produto" }));
    await waitFor(() => {
      expect(merchantCreateProduct).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Bolo Caseiro", priceCents: 1250, storeId: "s1" }),
      );
    });
    await screen.findByText("Produto criado.");
  });

  it("mostra aviso de duplicata e 'já existia' quando reused", async () => {
    merchantCreateProduct.mockResolvedValue({
      reused: true,
      warnings: [{ productId: "p9", name: "Bolo", brand: null }],
    });
    render(<Products />);
    await screen.findByRole("heading", { name: "Cadastrar produto" });
    fireEvent.change(screen.getByLabelText(/Nome\*/), { target: { value: "Bolo" } });
    fireEvent.change(screen.getByLabelText(/Preço \(R\$\)\*/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar produto" }));
    await screen.findByText(/Produto já existia.*Possíveis duplicatas: Bolo/);
  });

  it("faz upload de imagem via presign + PUT e mostra o preview", async () => {
    merchantUploadUrl.mockResolvedValue({
      uploadUrl: "https://storage/up",
      publicUrl: "https://cdn/img.png",
      headers: {},
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    render(<Products />);
    await screen.findByRole("heading", { name: "Cadastrar produto" });
    const file = new File(["x"], "img.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(merchantUploadUrl).toHaveBeenCalledWith("img.png", "image/png");
    });
    expect(fetchSpy).toHaveBeenCalledWith("https://storage/up", expect.objectContaining({ method: "PUT" }));
    fetchSpy.mockRestore();
  });

  it("mostra erro quando o upload falha", async () => {
    merchantUploadUrl.mockResolvedValue({ uploadUrl: "u", publicUrl: "p", headers: {} });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false } as Response);
    render(<Products />);
    await screen.findByRole("heading", { name: "Cadastrar produto" });
    const file = new File(["x"], "img.png", { type: "image/png" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText("Falha no upload da imagem");
    fetchSpy.mockRestore();
  });

  it("mostra erro quando a criação falha", async () => {
    merchantCreateProduct.mockRejectedValueOnce(new Error("Preço inválido"));
    render(<Products />);
    await screen.findByRole("heading", { name: "Cadastrar produto" });
    fireEvent.change(screen.getByLabelText(/Nome\*/), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText(/Preço \(R\$\)\*/), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar produto" }));
    await screen.findByText("Preço inválido");
  });
});
