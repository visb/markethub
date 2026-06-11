import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";

interface StoreRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  active: boolean;
  offerCount: number;
  staffCount: number;
}
interface MerchantDetailData {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  deliveryFeeCents: number;
  prepFeeCents: number;
  platformFeeBps: number;
  connectorType: string | null;
  stores: StoreRow[];
}

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;

export function MerchantDetail() {
  const { merchantId } = useParams();
  const { api } = useAuth();
  const [data, setData] = useState<MerchantDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [showStore, setShowStore] = useState(false);

  const load = useCallback(() => {
    if (!merchantId) return;
    setLoading(true);
    void api
      .request<MerchantDetailData>(`/admin/merchants/${merchantId}`, { auth: true })
      .then(setData)
      .finally(() => setLoading(false));
  }, [api, merchantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive() {
    if (!data) return;
    await api.request(`/admin/merchants/${data.id}`, {
      method: "PATCH",
      auth: true,
      body: { active: !data.active },
    });
    load();
  }

  if (loading && !data) return <p className="muted">Carregando…</p>;
  if (!data) return <p className="muted">Mercado não encontrado.</p>;

  return (
    <div>
      <nav className="breadcrumb muted">
        <Link to="/merchants">Mercados</Link> / {data.name}
      </nav>
      <div className="detail-head">
        <h1>{data.name}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={() => setEdit((v) => !v)}>
            {edit ? "Cancelar" : "Editar"}
          </button>
          <button className="btn-ghost" onClick={toggleActive}>
            {data.active ? "Desativar" : "Ativar"}
          </button>
        </div>
      </div>

      {edit ? (
        <MerchantEditForm
          data={data}
          onSaved={() => {
            setEdit(false);
            load();
          }}
        />
      ) : (
        <p className="muted">
          slug: {data.slug} ·{" "}
          <span className={data.active ? "badge badge-enriched" : "badge badge-failed"}>
            {data.active ? "ativo" : "inativo"}
          </span>{" "}
          · entrega {brl(data.deliveryFeeCents)} · preparo {brl(data.prepFeeCents)} · plataforma{" "}
          {pct(data.platformFeeBps)} · ERP {data.connectorType ?? "—"}
        </p>
      )}

      <div className="detail-head" style={{ marginTop: 24 }}>
        <h2>Lojas</h2>
        <button className="btn-primary" onClick={() => setShowStore((v) => !v)}>
          {showStore ? "Fechar" : "+ Nova loja"}
        </button>
      </div>

      {showStore && (
        <StoreForm
          merchantId={data.id}
          onCreated={() => {
            setShowStore(false);
            load();
          }}
        />
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Cidade/UF</th>
            <th>Ofertas</th>
            <th>Funcionários</th>
            <th>Ativo</th>
          </tr>
        </thead>
        <tbody>
          {data.stores.map((s) => (
            <tr key={s.id}>
              <td>
                <Link to={`/stores/${s.id}`}>{s.name}</Link>
              </td>
              <td className="muted">
                {s.city ?? "—"}
                {s.state ? `/${s.state}` : ""}
              </td>
              <td>{s.offerCount}</td>
              <td>{s.staffCount}</td>
              <td>
                <span className={s.active ? "badge badge-enriched" : "badge badge-failed"}>
                  {s.active ? "ativo" : "inativo"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.stores.length === 0 && <p className="muted">Nenhuma loja.</p>}
    </div>
  );
}

function MerchantEditForm({ data, onSaved }: { data: MerchantDetailData; onSaved: () => void }) {
  const { api } = useAuth();
  const [f, setF] = useState({
    name: data.name,
    slug: data.slug,
    deliveryFeeCents: String(data.deliveryFeeCents),
    prepFeeCents: String(data.prepFeeCents),
    platformFeeBps: String(data.platformFeeBps),
  });
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    try {
      await api.request(`/admin/merchants/${data.id}`, {
        method: "PATCH",
        auth: true,
        body: {
          name: f.name,
          slug: f.slug,
          deliveryFeeCents: Number(f.deliveryFeeCents),
          prepFeeCents: Number(f.prepFeeCents),
          platformFeeBps: Number(f.platformFeeBps),
        },
      });
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div className="form-grid">
        <input className="input" placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" placeholder="Slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
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
        <button className="btn-primary" onClick={save}>
          Salvar
        </button>
      </div>
      {msg && <p style={{ color: "#C0182A" }}>{msg}</p>}
    </section>
  );
}

function StoreForm({ merchantId, onCreated }: { merchantId: string; onCreated: () => void }) {
  const { api } = useAuth();
  const [f, setF] = useState({
    name: "",
    externalId: "",
    street: "",
    number: "",
    district: "",
    city: "",
    state: "",
    zipCode: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setMsg(null);
    try {
      await api.request("/admin/stores", {
        method: "POST",
        auth: true,
        body: { merchantId, ...f },
      });
      onCreated();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  const field = (k: keyof typeof f, ph: string) => (
    <input className="input" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h3>Nova loja</h3>
      <div className="form-grid">
        {field("name", "Nome")}
        {field("externalId", "ID ERP (opcional)")}
        {field("street", "Rua")}
        {field("number", "Número")}
        {field("district", "Bairro")}
        {field("city", "Cidade")}
        {field("state", "UF")}
        {field("zipCode", "CEP")}
        <button className="btn-primary" onClick={submit} disabled={!f.name}>
          Criar loja
        </button>
      </div>
      {msg && <p style={{ color: "#C0182A" }}>{msg}</p>}
    </section>
  );
}
