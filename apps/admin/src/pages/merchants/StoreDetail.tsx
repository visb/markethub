import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";

// ─── Tipos ───────────────────────────────────────────────

interface StoreHoursRow {
  id: string;
  dayOfWeek: number;
  opensAt: number;
  closesAt: number;
}

interface StoreData {
  id: string;
  name: string;
  externalId: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  allowsPickup: boolean;
  avgPrepMinutes: number;
  active: boolean;
  merchant: { id: string; name: string };
  hours: StoreHoursRow[];
  counts: {
    offers: number;
    staff: number;
    slots: number;
    ordersByStatus: Record<string, number>;
  };
}

interface OfferRow {
  id: string;
  product: { id: string; name: string; brand: string | null };
  priceCents: number;
  promoPriceCents: number | null;
  available: boolean;
  lockedFields: string[];
  stock: { id: string; quantity: number | null; available: boolean } | null;
}
interface OffersResponse {
  items: OfferRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface StaffRow {
  id: string;
  staffRole: string;
  active: boolean;
  user: { id: string; name: string; email: string; active: boolean };
}

interface OrderRow {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  customer: string;
  paymentStatus: string | null;
  refundCents: number;
  fulfillments: string[];
}
interface OrdersResponse {
  items: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<string, number>;
}

interface Operations {
  picking: Record<string, number>;
  deliveries: Record<string, number>;
  pendingPickups: number;
  sla: { oldestQueuedPickMin: number | null; oldestUnassignedDeliveryMin: number | null };
}

interface Slot {
  id: string;
  start: string;
  end: string;
  capacity: number;
  reserved: number;
}

type Tab = "produtos" | "pedidos" | "funcionarios" | "dados";

const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const reais = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

const TABS: { id: Tab; label: string }[] = [
  { id: "produtos", label: "Produtos" },
  { id: "pedidos", label: "Pedidos" },
  { id: "funcionarios", label: "Funcionários" },
  { id: "dados", label: "Dados" },
];

// ─── Página ──────────────────────────────────────────────

export function StoreDetail() {
  const { storeId } = useParams();
  const { api } = useAuth();
  const [store, setStore] = useState<StoreData | null>(null);
  const [tab, setTab] = useState<Tab>("produtos");

  const loadStore = useCallback(() => {
    if (!storeId) return;
    void api.request<StoreData>(`/admin/stores/${storeId}`, { auth: true }).then(setStore);
  }, [api, storeId]);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  if (!store || !storeId) return <p className="muted">Carregando…</p>;

  return (
    <div>
      <nav className="breadcrumb muted">
        <Link to="/merchants">Mercados</Link> /{" "}
        <Link to={`/merchants/${store.merchant.id}`}>{store.merchant.name}</Link> / {store.name}
      </nav>
      <div className="detail-head">
        <h1>{store.name}</h1>
        <span className={store.active ? "badge badge-enriched" : "badge badge-failed"}>
          {store.active ? "ativa" : "inativa"}
        </span>
      </div>
      <p className="muted">
        {[store.street, store.number, store.district, store.city, store.state]
          .filter(Boolean)
          .join(", ") || "Sem endereço"}
      </p>

      <div className="toolbar" style={{ gap: 8 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? "nav-item active" : "nav-item"}
            style={{ padding: "4px 12px", borderRadius: 6, cursor: "pointer" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "produtos" && <ProductsTab storeId={storeId} />}
      {tab === "pedidos" && <OrdersTab storeId={storeId} />}
      {tab === "funcionarios" && <StaffTab storeId={storeId} onChange={loadStore} />}
      {tab === "dados" && <DataTab store={store} onChange={loadStore} />}
    </div>
  );
}

// ─── Aba Produtos ────────────────────────────────────────

function ProductsTab({ storeId }: { storeId: string }) {
  const { api } = useAuth();
  const [data, setData] = useState<OffersResponse | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search) qs.set("search", search);
      setData(await api.request<OffersResponse>(`/admin/stores/${storeId}/offers?${qs}`, { auth: true }));
    } catch {
      setError("Falha ao carregar ofertas");
    } finally {
      setLoading(false);
    }
  }, [api, storeId, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchOffer = async (id: string, body: Record<string, unknown>) => {
    try {
      await api.request(`/admin/stores/offers/${id}`, { method: "PATCH", auth: true, body });
      await load();
    } catch {
      setError("Falha ao salvar");
    }
  };
  const unlockOffer = async (id: string, field: string) => {
    await api.request(`/admin/stores/offers/${id}/locks/${field}`, { method: "DELETE", auth: true });
    await load();
  };
  const patchStock = async (stockId: string, body: Record<string, unknown>) => {
    try {
      await api.request(`/admin/stores/stocks/${stockId}`, { method: "PATCH", auth: true, body });
      await load();
    } catch {
      setError("Falha ao salvar estoque");
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Buscar produto…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>
      {error && <p style={{ color: "#C0182A" }}>{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Preço (R$)</th>
            <th>Promo (R$)</th>
            <th>Disponível</th>
            <th>Estoque</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((o) => (
            <tr key={o.id}>
              <td>
                {o.product.name}
                <br />
                <span className="muted">{o.product.brand ?? ""}</span>
              </td>
              <td>
                <EditCell
                  value={reais(o.priceCents)}
                  locked={o.lockedFields.includes("priceCents")}
                  onSave={(v) => void patchOffer(o.id, { priceCents: toCents(v) })}
                  onUnlock={() => void unlockOffer(o.id, "priceCents")}
                />
              </td>
              <td>
                <EditCell
                  value={reais(o.promoPriceCents)}
                  locked={o.lockedFields.includes("promoPriceCents")}
                  onSave={(v) => void patchOffer(o.id, { promoPriceCents: v ? toCents(v) : null })}
                  onUnlock={() => void unlockOffer(o.id, "promoPriceCents")}
                />
              </td>
              <td>
                <label className="lockwrap">
                  <input
                    type="checkbox"
                    checked={o.available}
                    onChange={(e) => void patchOffer(o.id, { available: e.target.checked })}
                  />
                  {o.lockedFields.includes("available") && (
                    <LockBtn onUnlock={() => void unlockOffer(o.id, "available")} />
                  )}
                </label>
              </td>
              <td>
                {o.stock ? (
                  <EditCell
                    value={o.stock.quantity == null ? "" : String(o.stock.quantity)}
                    locked={false}
                    numeric
                    onSave={(v) =>
                      v !== "" && void patchStock(o.stock!.id, { quantity: Math.max(0, Math.round(Number(v))) })
                    }
                    onUnlock={() => undefined}
                  />
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <p className="muted">Carregando…</p>}
      {!loading && data?.items.length === 0 && <p className="muted">Nenhuma oferta.</p>}
      {data && data.total > data.pageSize && (
        <Pager page={page} totalPages={totalPages} onPage={setPage} />
      )}
    </div>
  );
}

function EditCell({
  value,
  locked,
  numeric,
  onSave,
  onUnlock,
}: {
  value: string;
  locked: boolean;
  numeric?: boolean;
  onSave: (v: string) => void;
  onUnlock: () => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <span className="lockwrap">
      <input
        className="input input-sm"
        inputMode={numeric ? "numeric" : undefined}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
      />
      {locked && <LockBtn onUnlock={onUnlock} />}
    </span>
  );
}

function LockBtn({ onUnlock }: { onUnlock: () => void }) {
  return (
    <button
      className="btn-ghost lock"
      title="Editado manual — clique p/ destravar (volta ao ERP)"
      onClick={onUnlock}
    >
      🔒
    </button>
  );
}

// ─── Aba Pedidos ─────────────────────────────────────────

function OrdersTab({ storeId }: { storeId: string }) {
  const { api } = useAuth();
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ storeId, page: String(page), pageSize: "20" });
    void api.request<OrdersResponse>(`/admin/dashboard/orders?${q}`, { auth: true }).then(setData);
  }, [api, storeId, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <table className="table">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Status</th>
            <th>Pagamento</th>
            <th>Total</th>
            <th>Criado</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((o) => (
            <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => setOpenId(o.id)}>
              <td>#{o.id.slice(0, 6)}</td>
              <td>{o.customer}</td>
              <td>
                <span className={`badge badge-${o.status}`}>{o.status}</span>
              </td>
              <td className="muted">{o.paymentStatus ?? "—"}</td>
              <td>{brl(o.totalCents)}</td>
              <td className="muted">{new Date(o.createdAt).toLocaleString("pt-BR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.items.length === 0 && <p className="muted">Nenhum pedido.</p>}
      {data && data.total > data.pageSize && (
        <Pager page={page} totalPages={totalPages} onPage={setPage} />
      )}
      {openId && <OrderDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

interface OrderDetail {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  deliveryCode?: string | null;
  user: { name: string; email: string };
  payment: { status: string; method?: string | null } | null;
  refund: { amountCents: number; status: string } | null;
  groups: {
    id: string;
    fulfillment: string;
    status: string;
    store: { name: string };
    merchant: { name: string };
    items: { id: string; nameSnapshot?: string; name?: string; quantity?: number; qty?: number }[];
    delivery: { status: string; driver: { name: string } | null } | null;
    pickTask: { status: string } | null;
  }[];
}

function OrderDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { api } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);

  useEffect(() => {
    void api.request<OrderDetail>(`/admin/dashboard/orders/${id}`, { auth: true }).then(setOrder);
  }, [api, id]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h2>Pedido #{id.slice(0, 6)}</h2>
          <button className="btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
        {!order && <p className="muted">Carregando…</p>}
        {order && (
          <>
            <p className="muted">
              {order.user.name} · {order.user.email}
            </p>
            <p>
              <span className={`badge badge-${order.status}`}>{order.status}</span> ·{" "}
              {brl(order.totalCents)} · {new Date(order.createdAt).toLocaleString("pt-BR")}
            </p>
            <p className="muted">
              Pagamento: {order.payment?.status ?? "—"}
              {order.refund ? ` · Reembolso: ${brl(order.refund.amountCents)} (${order.refund.status})` : ""}
            </p>
            {order.groups.map((g) => (
              <section key={g.id} className="card" style={{ marginTop: 12 }}>
                <h3>
                  {g.store.name} <span className="muted">· {g.fulfillment}</span>
                </h3>
                <p className="muted">
                  grupo: {g.status}
                  {g.pickTask ? ` · separação: ${g.pickTask.status}` : ""}
                  {g.delivery
                    ? ` · entrega: ${g.delivery.status}${g.delivery.driver ? ` (${g.delivery.driver.name})` : ""}`
                    : ""}
                </p>
                <ul>
                  {g.items.map((it) => (
                    <li key={it.id}>
                      {it.nameSnapshot ?? it.name ?? it.id} × {it.quantity ?? it.qty ?? 1}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}

// ─── Aba Funcionários ────────────────────────────────────

function StaffTab({ storeId, onChange }: { storeId: string; onChange: () => void }) {
  const { api } = useAuth();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    void api.request<StaffRow[]>(`/admin/stores/${storeId}/staff`, { auth: true }).then(setRows);
  }, [api, storeId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (s: StaffRow) => {
    await api.request(`/admin/stores/staff/${s.id}/active`, {
      method: "PATCH",
      auth: true,
      body: { active: !s.active },
    });
    load();
  };
  const remove = async (s: StaffRow) => {
    if (!confirm(`Remover ${s.user.name} desta loja?`)) return;
    await api.request(`/admin/stores/staff/${s.id}`, { method: "DELETE", auth: true });
    load();
    onChange();
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((s) => s.user.name.toLowerCase().includes(q) || s.user.email.toLowerCase().includes(q))
    : rows;

  return (
    <div>
      <div className="detail-head">
        <h2>Funcionários</h2>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fechar" : "+ Novo funcionário"}
        </button>
      </div>
      {showForm && (
        <StaffForm
          storeId={storeId}
          onCreated={() => {
            setShowForm(false);
            load();
            onChange();
          }}
        />
      )}
      <div className="toolbar">
        <input
          className="input"
          placeholder="Buscar nome/email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Papel na loja</th>
            <th>Vínculo</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => (
            <tr key={s.id}>
              <td>{s.user.name}</td>
              <td>{s.user.email}</td>
              <td>{s.staffRole}</td>
              <td>
                <button
                  className={s.active ? "badge badge-enriched" : "badge badge-failed"}
                  onClick={() => void toggle(s)}
                  style={{ cursor: "pointer", border: "none" }}
                >
                  {s.active ? "ativo" : "inativo"}
                </button>
              </td>
              <td>
                <button className="btn-ghost" onClick={() => void remove(s)}>
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="muted">Nenhum funcionário.</p>}
    </div>
  );
}

function StaffForm({ storeId, onCreated }: { storeId: string; onCreated: () => void }) {
  const { api } = useAuth();
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    staffRole: "picker" as "picker" | "manager" | "driver",
  });
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setMsg(null);
    try {
      await api.request("/admin/users", { method: "POST", auth: true, body: { ...form, storeId } });
      setMsg("Funcionário criado.");
      onCreated();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="form-grid">
        <input
          className="input"
          placeholder="Nome"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="input"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className="input"
          type="password"
          placeholder="Senha (mín. 8)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select
          className="input"
          value={form.staffRole}
          onChange={(e) =>
            setForm({ ...form, staffRole: e.target.value as "picker" | "manager" | "driver" })
          }
        >
          <option value="picker">Separador (picking)</option>
          <option value="manager">Gerente (merchant)</option>
          <option value="driver">Entregador (entrega própria)</option>
        </select>
        <button className="btn-primary" onClick={submit}>
          Criar
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}

// ─── Aba Dados / Operação ────────────────────────────────

function DataTab({ store, onChange }: { store: StoreData; onChange: () => void }) {
  const { api } = useAuth();
  const [ops, setOps] = useState<Operations | null>(null);
  const [edit, setEdit] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams({ storeId: store.id });
    void api.request<Operations>(`/admin/dashboard/operations?${q}`, { auth: true }).then(setOps);
  }, [api, store.id]);

  async function toggleActive() {
    await api.request(`/admin/stores/${store.id}/active`, {
      method: "PATCH",
      auth: true,
      body: { active: !store.active },
    });
    onChange();
  }

  return (
    <div>
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="detail-head">
          <h2>Loja</h2>
          <button className="btn-ghost" onClick={() => setEdit((v) => !v)}>
            {edit ? "Cancelar" : "Editar"}
          </button>
        </div>
        {edit ? (
          <StoreEditForm
            store={store}
            onSaved={() => {
              setEdit(false);
              onChange();
            }}
          />
        ) : (
          <>
            <p className="muted">ID ERP: {store.externalId ?? "—"}</p>
            <p className="muted">
              Endereço:{" "}
              {[store.street, store.number, store.district, store.city, store.state, store.zipCode]
                .filter(Boolean)
                .join(", ") || "—"}
            </p>
            <p className="muted">
              Geo: {store.latitude ?? "—"}, {store.longitude ?? "—"}
            </p>
            <p className="muted">Tempo de preparo médio: {store.avgPrepMinutes} min</p>
            <p className="muted">Telefone: {store.phone ?? "—"}</p>
            <p className="muted">Retirada na loja: {store.allowsPickup ? "permitida" : "não"}</p>
            <p className="muted">
              Ofertas: {store.counts.offers} · Funcionários: {store.counts.staff} · Slots:{" "}
              {store.counts.slots}
            </p>
            <button className="btn-primary" onClick={toggleActive}>
              {store.active ? "Desativar loja" : "Ativar loja"}
            </button>
          </>
        )}
      </section>

      <HoursSection store={store} onChange={onChange} />

      <SlotsSection storeId={store.id} onChange={onChange} />

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Operação</h2>
        {!ops && <p className="muted">Carregando…</p>}
        {ops && (
          <>
            <p className="muted">Separação: {fmtCounts(ops.picking)}</p>
            <p className="muted">Entregas: {fmtCounts(ops.deliveries)}</p>
            <p className="muted">Retiradas pendentes: {ops.pendingPickups}</p>
            <p className="muted">
              SLA — separação mais antiga: {ops.sla.oldestQueuedPickMin ?? "—"} min · entrega não
              atribuída: {ops.sla.oldestUnassignedDeliveryMin ?? "—"} min
            </p>
          </>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Pedidos por status</h2>
        <p className="muted">{fmtCounts(store.counts.ordersByStatus) || "—"}</p>
      </section>
    </div>
  );
}

function StoreEditForm({ store, onSaved }: { store: StoreData; onSaved: () => void }) {
  const { api } = useAuth();
  const [f, setF] = useState({
    name: store.name,
    externalId: store.externalId ?? "",
    street: store.street ?? "",
    number: store.number ?? "",
    district: store.district ?? "",
    city: store.city ?? "",
    state: store.state ?? "",
    zipCode: store.zipCode ?? "",
    latitude: store.latitude == null ? "" : String(store.latitude),
    longitude: store.longitude == null ? "" : String(store.longitude),
    phone: store.phone ?? "",
    avgPrepMinutes: String(store.avgPrepMinutes),
  });
  const [allowsPickup, setAllowsPickup] = useState(store.allowsPickup);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        name: f.name,
        externalId: f.externalId,
        street: f.street,
        number: f.number,
        district: f.district,
        city: f.city,
        state: f.state,
        zipCode: f.zipCode,
        phone: f.phone,
        allowsPickup,
      };
      if (f.latitude !== "") body.latitude = Number(f.latitude);
      if (f.longitude !== "") body.longitude = Number(f.longitude);
      if (f.avgPrepMinutes !== "") body.avgPrepMinutes = Math.max(1, Math.round(Number(f.avgPrepMinutes)));
      await api.request(`/admin/stores/${store.id}`, { method: "PATCH", auth: true, body });
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  const field = (k: keyof typeof f, ph: string) => (
    <input className="input" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );

  return (
    <div>
      <div className="form-grid">
        {field("name", "Nome")}
        {field("externalId", "ID ERP")}
        {field("street", "Rua")}
        {field("number", "Número")}
        {field("district", "Bairro")}
        {field("city", "Cidade")}
        {field("state", "UF")}
        {field("zipCode", "CEP")}
        {field("latitude", "Latitude")}
        {field("longitude", "Longitude")}
        {field("phone", "Telefone/WhatsApp")}
        {field("avgPrepMinutes", "Tempo de preparo (min)")}
        <label className="lockwrap" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={allowsPickup}
            onChange={(e) => setAllowsPickup(e.target.checked)}
          />
          Permite retirada na loja
        </label>
        <button className="btn-primary" onClick={save}>
          Salvar
        </button>
      </div>
      {msg && <p style={{ color: "#C0182A" }}>{msg}</p>}
    </div>
  );
}

// ─── Horário de funcionamento (story 29) ─────────────────

const DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hhmmToMin = (s: string) => {
  const [h, m] = s.split(":");
  return Math.max(0, Math.min(1439, Number(h) * 60 + Number(m || "0")));
};

interface DayState {
  open: boolean;
  opensAt: string;
  closesAt: string;
}

function HoursSection({ store, onChange }: { store: StoreData; onChange: () => void }) {
  const { api } = useAuth();
  const [days, setDays] = useState<DayState[]>(() =>
    DAY_LABELS.map((_, d) => {
      const row = store.hours.find((h) => h.dayOfWeek === d);
      return row
        ? { open: true, opensAt: minToHHMM(row.opensAt), closesAt: minToHHMM(row.closesAt) }
        : { open: false, opensAt: "08:00", closesAt: "22:00" };
    }),
  );
  const [msg, setMsg] = useState<string | null>(null);

  function patchDay(d: number, partial: Partial<DayState>) {
    setDays((prev) => prev.map((day, i) => (i === d ? { ...day, ...partial } : day)));
  }

  async function save() {
    setMsg(null);
    try {
      const hours = days
        .map((day, d) =>
          day.open
            ? { dayOfWeek: d, opensAt: hhmmToMin(day.opensAt), closesAt: hhmmToMin(day.closesAt) }
            : null,
        )
        .filter((x): x is { dayOfWeek: number; opensAt: number; closesAt: number } => x !== null);
      await api.request(`/admin/stores/${store.id}/hours`, { method: "PUT", auth: true, body: { hours } });
      setMsg("Horário salvo.");
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao salvar horário");
    }
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2>Horário de funcionamento</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Dia</th>
            <th>Aberto</th>
            <th>Abre</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day, d) => (
            <tr key={d}>
              <td>{DAY_LABELS[d]}</td>
              <td>
                <input
                  type="checkbox"
                  checked={day.open}
                  onChange={(e) => patchDay(d, { open: e.target.checked })}
                />
              </td>
              <td>
                <input
                  className="input input-sm"
                  type="time"
                  value={day.opensAt}
                  disabled={!day.open}
                  onChange={(e) => patchDay(d, { opensAt: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="input input-sm"
                  type="time"
                  value={day.closesAt}
                  disabled={!day.open}
                  onChange={(e) => patchDay(d, { closesAt: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn-primary" onClick={save}>
        Salvar horário
      </button>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}

function SlotsSection({ storeId, onChange }: { storeId: string; onChange: () => void }) {
  const { api } = useAuth();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [form, setForm] = useState({ start: "", end: "", capacity: "5" });
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ storeId });
    void api.request<Slot[]>(`/store/slots?${q}`, { auth: true }).then(setSlots);
  }, [api, storeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setMsg(null);
    try {
      await api.request("/store/slots", {
        method: "POST",
        auth: true,
        body: {
          storeId,
          start: new Date(form.start).toISOString(),
          end: new Date(form.end).toISOString(),
          capacity: Number(form.capacity),
        },
      });
      setForm({ start: "", end: "", capacity: "5" });
      load();
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }
  async function remove(id: string) {
    try {
      await api.request(`/store/slots/${id}`, { method: "DELETE", auth: true });
      load();
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao remover");
    }
  }

  return (
    <section className="card">
      <h2>Slots de entrega</h2>
      <div className="form-grid">
        <input
          className="input"
          type="datetime-local"
          value={form.start}
          onChange={(e) => setForm({ ...form, start: e.target.value })}
        />
        <input
          className="input"
          type="datetime-local"
          value={form.end}
          onChange={(e) => setForm({ ...form, end: e.target.value })}
        />
        <input
          className="input"
          type="number"
          min={1}
          placeholder="Capacidade"
          value={form.capacity}
          onChange={(e) => setForm({ ...form, capacity: e.target.value })}
        />
        <button className="btn-primary" onClick={create} disabled={!form.start || !form.end}>
          + Slot
        </button>
      </div>
      {msg && <p style={{ color: "#C0182A" }}>{msg}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Início</th>
            <th>Fim</th>
            <th>Capacidade</th>
            <th>Reservado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.id}>
              <td>{new Date(s.start).toLocaleString("pt-BR")}</td>
              <td>{new Date(s.end).toLocaleString("pt-BR")}</td>
              <td>{s.capacity}</td>
              <td>{s.reserved}</td>
              <td>
                <button className="btn-ghost" disabled={s.reserved > 0} onClick={() => void remove(s.id)}>
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {slots.length === 0 && <p className="muted">Nenhum slot futuro.</p>}
    </section>
  );
}

// ─── util ────────────────────────────────────────────────

function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
      <button className="btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← anterior
      </button>
      <span className="muted">
        página {page} de {totalPages}
      </span>
      <button className="btn-ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        próxima →
      </button>
    </div>
  );
}

function fmtCounts(rec: Record<string, number>): string {
  const entries = Object.entries(rec);
  return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
}
