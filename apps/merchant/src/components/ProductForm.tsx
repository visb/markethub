import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { MerchantStoreDTO } from "@markethub/api-client";
import type { CreateProductInput } from "@/api/catalog";

/**
 * Cadastro de produto local (story 11 / S3.10) — react-hook-form + zod. Cria o
 * Product canônico + Offer/Stock na loja escolhida. A imagem é enviada via fluxo
 * presigned (`upload-url`) ANTES do submit — o binário não passa pelo backend.
 */
const productSchema = z.object({
  storeId: z.string().min(1, "Selecione a loja"),
  name: z.string().trim().min(1, "Informe o nome"),
  brand: z.string().trim().optional(),
  saleType: z.enum(["unit", "weight"]),
  packageSize: z.string().trim().optional(),
  gtin: z.string().trim().optional(),
  price: z.coerce.number({ invalid_type_error: "Informe o preço" }).min(0, "Preço inválido"),
  quantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? "" : Number(v)),
    z.union([z.number().int().min(0), z.literal("")]),
  ),
});
export type ProductFormValues = z.infer<typeof productSchema>;

export const SALE_TYPE_LABEL: Record<"unit" | "weight", string> = {
  unit: "Unidade",
  weight: "Peso (g)",
};

/** Converte os valores do form no payload da API (reais → centavos, imageUrl). */
export function toCreateProductInput(values: ProductFormValues, imageUrl?: string): CreateProductInput {
  return {
    storeId: values.storeId,
    name: values.name.trim(),
    brand: values.brand?.trim() || undefined,
    saleType: values.saleType,
    packageSize: values.packageSize?.trim() || undefined,
    gtin: values.gtin?.trim() || undefined,
    imageUrl: imageUrl || undefined,
    priceCents: Math.round(values.price * 100),
    quantity: values.quantity === "" || values.quantity == null ? null : values.quantity,
    available: true,
  };
}

export function ProductForm({
  stores,
  onSubmit,
  onCancel,
  onUploadImage,
  submitting,
  error,
}: {
  stores: MerchantStoreDTO[];
  onSubmit: (input: CreateProductInput) => void;
  onCancel: () => void;
  /** Recebe o arquivo, sobe via presigned URL e devolve a URL pública. */
  onUploadImage: (file: File) => Promise<string>;
  submitting?: boolean;
  error?: string | null;
}) {
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      storeId: stores[0]?.id ?? "",
      name: "",
      brand: "",
      saleType: "unit",
      packageSize: "",
      gtin: "",
      price: 0,
      quantity: "",
    },
  });

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      setImageUrl(url);
    } catch {
      setUploadError("Falha ao enviar a imagem.");
    } finally {
      setUploading(false);
    }
  };

  const submit = (values: ProductFormValues) => onSubmit(toCreateProductInput(values, imageUrl));

  return (
    <form className="store-form" onSubmit={handleSubmit(submit)}>
      <h2>Novo produto</h2>

      <label className="field">
        <span>Loja</span>
        <select className="input" {...register("storeId")}>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {errors.storeId && <p className="error">{errors.storeId.message}</p>}
      </label>

      <label className="field">
        <span>Nome</span>
        <input className="input" {...register("name")} />
        {errors.name && <p className="error">{errors.name.message}</p>}
      </label>

      <div className="field-row">
        <label className="field">
          <span>Marca</span>
          <input className="input" {...register("brand")} />
        </label>
        <label className="field">
          <span>Embalagem</span>
          <input className="input" {...register("packageSize")} placeholder="ex.: 500g" />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Tipo de venda</span>
          <select className="input" {...register("saleType")}>
            <option value="unit">{SALE_TYPE_LABEL.unit}</option>
            <option value="weight">{SALE_TYPE_LABEL.weight}</option>
          </select>
        </label>
        <label className="field">
          <span>GTIN (código de barras)</span>
          <input className="input" {...register("gtin")} />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Preço (R$)</span>
          <input className="input" type="number" step="0.01" {...register("price")} />
          {errors.price && <p className="error">{errors.price.message}</p>}
        </label>
        <label className="field">
          <span>Estoque inicial</span>
          <input className="input" type="number" {...register("quantity")} />
        </label>
      </div>

      <label className="field">
        <span>Imagem</span>
        <input
          className="input"
          type="file"
          accept="image/*"
          aria-label="Imagem do produto"
          onChange={(e) => void onPickImage(e.target.files?.[0])}
        />
        {uploading && <p className="muted">Enviando imagem…</p>}
        {imageUrl && <p className="muted">Imagem enviada.</p>}
        {uploadError && <p className="error">{uploadError}</p>}
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={submitting || uploading}>
          {submitting ? "Salvando…" : "Cadastrar"}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
