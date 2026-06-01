import { useEffect, useState } from "react";
import type { PickStore } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { StoreSelector } from "@/components/StoreSelector";

interface CreateResult {
  reused: boolean;
  warnings: { productId: string; name: string; brand: string | null }[];
}

/** Cadastro de produto local do merchant (S3.10) + upload de imagem (S3/MinIO). */
export function Products() {
  const { api } = useAuth();
  const [stores, setStores] = useState<PickStore[]>([]);
  const [form, setForm] = useState({
    storeId: "",
    name: "",
    brand: "",
    saleType: "unit" as "unit" | "weight",
    packageSize: "",
    gtin: "",
    priceReais: "",
    promoReais: "",
    quantity: "",
    imageUrl: "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.merchantStores().then((s) => {
      setStores(s);
      setForm((f) => ({ ...f, storeId: f.storeId || s[0]?.id || "" }));
    });
  }, [api]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const presigned = await api.merchantUploadUrl(file.name, file.type || "application/octet-stream");
      const res = await fetch(presigned.uploadUrl, { method: "PUT", headers: presigned.headers, body: file });
      if (!res.ok) throw new Error("upload falhou");
      set("imageUrl", presigned.publicUrl);
    } catch {
      setError("Falha no upload da imagem");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const result = (await api.merchantCreateProduct({
        storeId: form.storeId,
        name: form.name,
        brand: form.brand || undefined,
        saleType: form.saleType,
        packageSize: form.packageSize || undefined,
        gtin: form.gtin || undefined,
        imageUrl: form.imageUrl || undefined,
        priceCents: Math.round(Number(form.priceReais.replace(",", ".")) * 100),
        promoPriceCents: form.promoReais ? Math.round(Number(form.promoReais.replace(",", ".")) * 100) : null,
        quantity: form.quantity ? Number(form.quantity) : null,
      })) as CreateResult;
      const warn =
        result.warnings.length > 0
          ? ` Possíveis duplicatas: ${result.warnings.map((w) => w.name).join(", ")}.`
          : "";
      setMsg((result.reused ? "Produto já existia — oferta criada." : "Produto criado.") + warn);
      set("name", "");
      set("gtin", "");
      set("priceReais", "");
      set("promoReais", "");
      set("imageUrl", "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar produto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1>Cadastrar produto</h1>
      <p className="muted">Para itens que não vêm do ERP (produção própria, etc.).</p>

      {error && <p style={{ color: "#C0182A" }}>{error}</p>}
      {msg && <p style={{ color: "#16A34A" }}>{msg}</p>}

      <div className="form-grid">
        <label>
          Loja
          <StoreSelector stores={stores} value={form.storeId} onChange={(v) => set("storeId", v)} />
          {stores.length <= 1 && <input className="input" value={stores[0]?.name ?? ""} disabled />}
        </label>
        <label>
          Nome*
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label>
          Marca
          <input className="input" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
        </label>
        <label>
          Tipo de venda
          <select className="input" value={form.saleType} onChange={(e) => set("saleType", e.target.value as "unit" | "weight")}>
            <option value="unit">Unidade</option>
            <option value="weight">Peso (g)</option>
          </select>
        </label>
        <label>
          Embalagem
          <input className="input" value={form.packageSize} onChange={(e) => set("packageSize", e.target.value)} placeholder="500g, 1L…" />
        </label>
        <label>
          GTIN (opcional)
          <input className="input" value={form.gtin} onChange={(e) => set("gtin", e.target.value)} />
        </label>
        <label>
          Preço (R$)*
          <input className="input" value={form.priceReais} onChange={(e) => set("priceReais", e.target.value)} />
        </label>
        <label>
          Promo (R$)
          <input className="input" value={form.promoReais} onChange={(e) => set("promoReais", e.target.value)} />
        </label>
        <label>
          Estoque
          <input className="input" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
        </label>
        <label>
          Imagem
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          {uploading && <span className="muted"> enviando…</span>}
          {form.imageUrl && <img src={form.imageUrl} alt="" style={{ height: 48, marginTop: 8 }} />}
        </label>
      </div>

      <button className="btn-primary" disabled={saving || !form.name || !form.priceReais || !form.storeId} onClick={() => void submit()}>
        {saving ? "Salvando…" : "Cadastrar produto"}
      </button>
    </div>
  );
}
