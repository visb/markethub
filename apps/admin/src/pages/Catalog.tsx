import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  gtin: string | null;
  enrichmentStatus: string;
  completenessScore: number;
  category: { name: string } | null;
  _count: { offers: number };
}
interface Page {
  items: ProductRow[];
  page: number;
  pageSize: number;
  total: number;
}

const STATUSES = ["", "pending", "enriched", "needs_review"];

export function Catalog() {
  const { api } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    try {
      setData(await api.request<Page>(`/admin/products?${qs}`, { auth: true }));
    } finally {
      setLoading(false);
    }
  }, [api, page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <h1>Catálogo</h1>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Buscar nome, marca, GTIN…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <select
          className="input"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || "Todos status"}
            </option>
          ))}
        </select>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Marca</th>
            <th>GTIN</th>
            <th>Categoria</th>
            <th>Ofertas</th>
            <th>Completude</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((p) => (
            <tr key={p.id}>
              <td>
                <Link to={`/catalog/${p.id}`}>{p.name}</Link>
              </td>
              <td>{p.brand ?? "—"}</td>
              <td>{p.gtin ?? "—"}</td>
              <td>{p.category?.name ?? "—"}</td>
              <td>{p._count.offers}</td>
              <td>
                <span className="bar">
                  <span className="bar-fill" style={{ width: `${p.completenessScore}%` }} />
                </span>
                {p.completenessScore}
              </td>
              <td>
                <span className={`badge badge-${p.enrichmentStatus}`}>{p.enrichmentStatus}</span>
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
          Página {page} de {totalPages} · {data?.total ?? 0} produtos {loading ? "(…)" : ""}
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
