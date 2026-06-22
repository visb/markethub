import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MerchantStoreDTO } from "@markethub/api-client";
import { ProductForm, toCreateProductInput, type ProductFormValues } from "./ProductForm";

const stores: MerchantStoreDTO[] = [
  { id: "s1", name: "Loja A", merchantId: "m1" },
  { id: "s2", name: "Loja B", merchantId: "m1" },
];

describe("toCreateProductInput (story 11)", () => {
  it("converte reais → centavos e limpa campos vazios", () => {
    const values: ProductFormValues = {
      storeId: "s1",
      name: "  Feijão  ",
      brand: "",
      saleType: "unit",
      packageSize: "",
      gtin: "",
      price: 8.5,
      quantity: "",
    };
    expect(toCreateProductInput(values)).toEqual({
      storeId: "s1",
      name: "Feijão",
      brand: undefined,
      saleType: "unit",
      packageSize: undefined,
      gtin: undefined,
      imageUrl: undefined,
      priceCents: 850,
      quantity: null,
      available: true,
    });
  });

  it("inclui imageUrl e quantity quando fornecidos", () => {
    const values: ProductFormValues = {
      storeId: "s2",
      name: "Banana",
      brand: "Marca",
      saleType: "weight",
      packageSize: "1kg",
      gtin: "789",
      price: 12,
      quantity: 30,
    };
    expect(toCreateProductInput(values, "http://img")).toMatchObject({
      storeId: "s2",
      saleType: "weight",
      brand: "Marca",
      packageSize: "1kg",
      gtin: "789",
      imageUrl: "http://img",
      priceCents: 1200,
      quantity: 30,
    });
  });
});

describe("ProductForm (story 11)", () => {
  it("valida nome obrigatório (zod) e não submete", async () => {
    const onSubmit = vi.fn();
    render(
      <ProductForm stores={stores} onSubmit={onSubmit} onCancel={vi.fn()} onUploadImage={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await screen.findByText("Informe o nome");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submete input válido com a loja selecionada", async () => {
    const onSubmit = vi.fn();
    render(
      <ProductForm stores={stores} onSubmit={onSubmit} onCancel={vi.fn()} onUploadImage={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Café" } });
    fireEvent.change(screen.getByLabelText("Loja"), { target: { value: "s2" } });
    fireEvent.change(screen.getByLabelText("Preço (R$)"), { target: { value: "9.9" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ storeId: "s2", name: "Café", priceCents: 990 });
  });

  it("usa o fluxo presigned (onUploadImage) ao escolher imagem", async () => {
    const onUploadImage = vi.fn().mockResolvedValue("http://img/x.png");
    render(
      <ProductForm stores={stores} onSubmit={vi.fn()} onCancel={vi.fn()} onUploadImage={onUploadImage} />,
    );
    const file = new File(["x"], "x.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Imagem do produto"), { target: { files: [file] } });
    await waitFor(() => expect(onUploadImage).toHaveBeenCalledWith(file));
    await screen.findByText("Imagem enviada.");
  });
});
