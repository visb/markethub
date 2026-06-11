import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";

interface MerchantRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  deliveryFeeCents: number;
  platformFeeBps: number;
  storeCount: number;
}

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;

export function MerchantsList() {
  const { api } = useAuth();
  const [rows, setRows] = useState<MerchantRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    void api
      .request<MerchantRow[]>(`/admin/merchants?${qs}`, { auth: true })
      .then(setRows)
      .finally(() => setLoading(false));
  }, [api, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="detail-head">
        <h1>Mercados</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fechar" : "+ Novo mercado"}
        </button>
      </div>

      {showForm && (
        <MerchantForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <div className="toolbar">
        <input
          className="input"
          placeholder="Buscar nome/slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Slug</th>
            <th>Lojas</th>
            <th>Taxa entrega</th>
            <th>Taxa plataforma</th>
            <th>Ativo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>
                <Link to={`/merchants/${m.id}`}>{m.name}</Link>
              </td>
              <td className="muted">{m.slug}</td>
              <td>{m.storeCount}</td>
              <td>{brl(m.deliveryFeeCents)}</td>
              <td>{pct(m.platformFeeBps)}</td>
              <td>
                <span className={m.active ? "badge badge-enriched" : "badge badge-failed"}>
                  {m.active ? "ativo" : "inativo"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <p className="muted">Carregando…</p>}
      {!loading && rows.length === 0 && <p className="muted">Nenhum mercado.</p>}
    </div>
  );
}

function MerchantForm({ onCreated }: { onCreated: () => void }) {
  const { api } = useAuth();
  const [f, setF] = useState({
    name: "",
    slug: "",
    deliveryFeeCents: "700",
    prepFeeCents: "0",
    platformFeeBps: "1000",
  });
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setMsg(null);
    try {
      await api.request("/admin/merchants", {
        method: "POST",
        auth: true,
        body: {
          name: f.name,
          slug: f.slug || undefined,
          deliveryFeeCents: Number(f.deliveryFeeCents),
          prepFeeCents: Number(f.prepFeeCents),
          platformFeeBps: Number(f.platformFeeBps),
        },
      });
      onCreated();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2>Novo mercado</h2>
      <div className="form-grid">
        <input
          className="input"
          placeholder="Nome"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <input
          className="input"
          placeholder="Slug (opcional)"
          value={f.slug}
          onChange={(e) => setF({ ...f, slug: e.target.value })}
        />
        <input
          className="input"
          type="number"
          placeholder="Taxa entrega (centavos)"
          value={f.deliveryFeeCents}
          onChange={(e) => setF({ ...f, deliveryFeeCents: e.target.value })}
        />
        <input
          className="input"
          type="number"
          placeholder="Taxa preparo (centavos)"
          value={f.prepFeeCents}
          onChange={(e) => setF({ ...f, prepFeeCents: e.target.value })}
        />
        <input
          className="input"
          type="number"
          placeholder="Taxa plataforma (bps)"
          value={f.platformFeeBps}
          onChange={(e) => setF({ ...f, platformFeeBps: e.target.value })}
        />
        <button className="btn-primary" onClick={submit} disabled={!f.name}>
          Criar
        </button>
      </div>
      {msg && <p style={{ color: "#C0182A" }}>{msg}</p>}
    </section>
  );
}
