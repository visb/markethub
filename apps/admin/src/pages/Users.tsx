import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";

interface UserRow {
  id: string;
  name: string;
  email: string;
  active: boolean;
  roles: string[];
  staff: { staffRole: string; store: string; merchant: string }[];
}
interface Page {
  items: UserRow[];
  page: number;
  pageSize: number;
  total: number;
}
interface Store {
  id: string;
  name: string;
  merchant: string;
}

const ROLES = ["", "customer", "merchant", "picker", "driver", "admin"];

export function Users() {
  const { api } = useAuth();
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (role) qs.set("role", role);
    if (search) qs.set("search", search);
    setData(await api.request<Page>(`/admin/users?${qs}`, { auth: true }));
  }, [api, page, role, search]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void api.request<Store[]>("/admin/stores", { auth: true }).then(setStores);
  }, [api]);

  async function toggleActive(u: UserRow) {
    await api.request(`/admin/users/${u.id}/active`, {
      method: "POST",
      auth: true,
      body: { active: !u.active },
    });
    await load();
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="detail-head">
        <h1>Usuários</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fechar" : "+ Novo funcionário"}
        </button>
      </div>

      {showForm && <StaffForm stores={stores} onCreated={load} />}

      <div className="toolbar">
        <select
          className="input"
          value={role}
          onChange={(e) => {
            setPage(1);
            setRole(e.target.value);
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r || "Todos os papéis"}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Buscar nome/email…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Papéis</th>
            <th>Vínculo (loja)</th>
            <th>Ativo</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.roles.join(", ")}</td>
              <td>
                {u.staff.length
                  ? u.staff.map((s) => `${s.staffRole}@${s.merchant}`).join(", ")
                  : "—"}
              </td>
              <td>
                <button
                  className={u.active ? "badge badge-enriched" : "badge badge-failed"}
                  onClick={() => toggleActive(u)}
                  style={{ cursor: "pointer", border: "none" }}
                >
                  {u.active ? "ativo" : "inativo"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pager">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ← Anterior
        </button>
        <span className="muted">
          Página {page} de {totalPages} · {data?.total ?? 0} usuários
        </span>
        <button
          className="btn-ghost"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima →
        </button>
      </div>
    </div>
  );
}

function StaffForm({ stores, onCreated }: { stores: Store[]; onCreated: () => void }) {
  const { api } = useAuth();
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    staffRole: "picker" as "picker" | "manager" | "driver",
    storeId: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setMsg(null);
    try {
      await api.request("/admin/users", {
        method: "POST",
        auth: true,
        body: { ...form, storeId: form.storeId || stores[0]?.id },
      });
      setMsg("Funcionário criado.");
      setForm({ ...form, email: "", name: "", password: "" });
      onCreated();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2>Novo funcionário (gerente, separador ou entregador)</h2>
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
        <select
          className="input"
          value={form.storeId}
          onChange={(e) => setForm({ ...form, storeId: e.target.value })}
        >
          <option value="">Selecione a loja…</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.merchant} — {s.name}
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={submit}>
          Criar
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}
