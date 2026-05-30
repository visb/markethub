import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";

interface Offer {
  id: string;
  priceCents: number;
  promoPriceCents: number | null;
  available: boolean;
  store: { name: string; merchant: { name: string } };
}
interface Product {
  id: string;
  name: string;
  brand: string | null;
  unit: string | null;
  imageUrl: string | null;
  gtin: string | null;
  enrichmentStatus: string;
  completenessScore: number;
  lockedFields: string[];
  category: { id: string; name: string } | null;
  enrichment: { source: string; provenance: Record<string, string> | null } | null;
  offers: Offer[];
}

const brl = (c: number) => `R$ ${(c / 100).toFixed(2)}`;

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: "", brand: "", unit: "", imageUrl: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await api.request<Product>(`/admin/products/${id}`, { auth: true });
    setProduct(p);
    setForm({ name: p.name, brand: p.brand ?? "", unit: p.unit ?? "", imageUrl: p.imageUrl ?? "" });
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setMsg(null);
    await api.request(`/admin/products/${id}`, { method: "PATCH", auth: true, body: form });
    setMsg("Salvo (campos travados contra enriquecimento automático).");
    await load();
  }
  async function reenrich() {
    setMsg(null);
    await api.request(`/admin/products/${id}/enrich`, { method: "POST", auth: true });
    setMsg("Re-enriquecido.");
    await load();
  }
  async function unlock(field: string) {
    await api.request(`/admin/products/${id}/unlock`, {
      method: "POST",
      auth: true,
      body: { fields: [field] },
    });
    await load();
  }

  if (!product) return <div className="muted">Carregando…</div>;

  return (
    <div>
      <Link to="/catalog" className="muted">
        ← Catálogo
      </Link>
      <div className="detail-head">
        <h1>{product.name}</h1>
        <span className={`badge badge-${product.enrichmentStatus}`}>{product.enrichmentStatus}</span>
        <span className="muted">completude {product.completenessScore}</span>
      </div>

      <div className="cards">
        <section className="card">
          <h2>Editar (override manual)</h2>
          {(["name", "brand", "unit", "imageUrl"] as const).map((f) => (
            <label key={f} className="field">
              <span>
                {f}
                {product.lockedFields.includes(f === "name" ? "name" : f) && (
                  <button className="lock" onClick={() => unlock(f)} title="destravar">
                    🔒 destravar
                  </button>
                )}
              </span>
              <input
                className="input"
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              />
            </label>
          ))}
          <div className="row">
            <button className="btn-primary" onClick={save}>
              Salvar
            </button>
            <button className="btn-ghost" onClick={reenrich}>
              Re-enriquecer
            </button>
          </div>
          {msg && <p className="muted">{msg}</p>}
        </section>

        <section className="card">
          <h2>Enriquecimento</h2>
          <p className="muted">GTIN: {product.gtin ?? "—"}</p>
          <p className="muted">Categoria: {product.category?.name ?? "—"}</p>
          <p className="muted">Fonte: {product.enrichment?.source ?? "—"}</p>
          <p className="muted">Travados: {product.lockedFields.join(", ") || "nenhum"}</p>
          <pre className="provenance">
            {JSON.stringify(product.enrichment?.provenance ?? {}, null, 2)}
          </pre>
        </section>

        <section className="card">
          <h2>Ofertas ({product.offers.length})</h2>
          <table className="table">
            <tbody>
              {product.offers.map((o) => (
                <tr key={o.id}>
                  <td>{o.store.merchant.name}</td>
                  <td>{o.store.name}</td>
                  <td>{brl(o.priceCents)}</td>
                  <td>{o.promoPriceCents ? brl(o.promoPriceCents) : "—"}</td>
                  <td>{o.available ? "disp." : "indisp."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
