import { Fragment, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";

interface PrepOptions {
  label: string;
  options: string[];
}
interface Curated {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  visible: boolean;
  prepOptions: PrepOptions | null;
  _count: { rawCategories: number };
}
interface RawCat {
  id: string;
  name: string;
  slug: string;
  marketplaceCategoryId: string | null;
  _count: { products: number };
}

export function MarketplaceCategories() {
  const { api } = useAuth();
  const [curated, setCurated] = useState<Curated[]>([]);
  const [raw, setRaw] = useState<RawCat[]>([]);
  const [form, setForm] = useState({ name: "", displayOrder: 0 });
  // editor de preparo (S6.6): id da categoria em edição + rascunho do form
  const [prepEdit, setPrepEdit] = useState<string | null>(null);
  const [prepDraft, setPrepDraft] = useState({ label: "", options: "" });

  const load = useCallback(async () => {
    setCurated(await api.request<Curated[]>("/admin/marketplace-categories", { auth: true }));
    setRaw(await api.request<RawCat[]>("/admin/marketplace-categories/raw", { auth: true }));
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!form.name.trim()) return;
    await api.request("/admin/marketplace-categories", { method: "POST", auth: true, body: form });
    setForm({ name: "", displayOrder: 0 });
    await load();
  }
  async function patch(id: string, body: Record<string, unknown>) {
    await api.request(`/admin/marketplace-categories/${id}`, { method: "PATCH", auth: true, body });
    await load();
  }
  async function remove(id: string) {
    if (!confirm("Remover categoria curada? As cruas serão desvinculadas.")) return;
    await api.request(`/admin/marketplace-categories/${id}`, { method: "DELETE", auth: true });
    await load();
  }
  function openPrep(c: Curated) {
    setPrepEdit(c.id);
    setPrepDraft({
      label: c.prepOptions?.label ?? "",
      options: c.prepOptions?.options.join(", ") ?? "",
    });
  }
  async function savePrep(id: string) {
    const label = prepDraft.label.trim();
    const options = prepDraft.options
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    const prepOptions = label && options.length ? { label, options } : null;
    await patch(id, { prepOptions });
    setPrepEdit(null);
  }
  async function assign(categoryId: string, marketplaceCategoryId: string) {
    await api.request(`/admin/marketplace-categories/raw/${categoryId}/assign`, {
      method: "POST",
      auth: true,
      body: { marketplaceCategoryId: marketplaceCategoryId || null },
    });
    await load();
  }

  return (
    <div>
      <h1>Categorias do marketplace (curadas)</h1>
      <p className="muted">Apenas categorias curadas e visíveis aparecem no app cliente.</p>

      <section className="card" style={{ margin: "16px 0" }}>
        <h2>Nova categoria curada</h2>
        <div className="form-grid">
          <input
            className="input"
            placeholder="Nome (ex.: Congelados)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input"
            type="number"
            placeholder="Ordem"
            value={form.displayOrder}
            onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
          />
          <button className="btn-primary" onClick={create}>
            Criar
          </button>
        </div>
      </section>

      <table className="table">
        <thead>
          <tr>
            <th>Ordem</th>
            <th>Nome</th>
            <th>Cruas vinculadas</th>
            <th>Visível</th>
            <th>Preparo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {curated.map((c) => (
            <Fragment key={c.id}>
            <tr>
              <td>
                <input
                  className="input mini"
                  type="number"
                  defaultValue={c.displayOrder}
                  onBlur={(e) => patch(c.id, { displayOrder: Number(e.target.value) })}
                />
              </td>
              <td>{c.name}</td>
              <td>{c._count.rawCategories}</td>
              <td>
                <button
                  className={c.visible ? "badge badge-enriched" : "badge badge-pending"}
                  style={{ cursor: "pointer", border: "none" }}
                  onClick={() => patch(c.id, { visible: !c.visible })}
                >
                  {c.visible ? "visível" : "oculta"}
                </button>
              </td>
              <td>
                <button className="btn-ghost" onClick={() => openPrep(c)}>
                  {c.prepOptions ? `${c.prepOptions.label} (${c.prepOptions.options.length})` : "definir"}
                </button>
              </td>
              <td>
                <button className="btn-ghost" onClick={() => remove(c.id)}>
                  remover
                </button>
              </td>
            </tr>
            {prepEdit === c.id && (
              <tr>
                <td colSpan={6}>
                  <div className="card" style={{ display: "grid", gap: 8, padding: 12 }}>
                    <p className="muted" style={{ margin: 0 }}>
                      Pergunta de preparo exibida no detalhe do produto desta categoria. Opções
                      separadas por vírgula. Deixe em branco para remover.
                    </p>
                    <input
                      className="input"
                      placeholder="Rótulo (ex.: Como prefere o corte?)"
                      value={prepDraft.label}
                      onChange={(e) => setPrepDraft({ ...prepDraft, label: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Opções (ex.: Inteiro, Em pedaços, Moído)"
                      value={prepDraft.options}
                      onChange={(e) => setPrepDraft({ ...prepDraft, options: e.target.value })}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-primary" onClick={() => savePrep(c.id)}>
                        Salvar
                      </button>
                      <button className="btn-ghost" onClick={() => setPrepEdit(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>Mapeamento (categoria crua → curada)</h2>
      <p className="muted">Categorias vindas do ERP/Cosmos. Vincule cada uma à categoria curada.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Categoria crua</th>
            <th>Produtos</th>
            <th>Curada</th>
          </tr>
        </thead>
        <tbody>
          {raw.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r._count.products}</td>
              <td>
                <select
                  className="input"
                  value={r.marketplaceCategoryId ?? ""}
                  onChange={(e) => assign(r.id, e.target.value)}
                >
                  <option value="">— sem vínculo —</option>
                  {curated.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
