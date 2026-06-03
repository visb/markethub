import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";

interface Summary {
  total: number;
  avgScore: number;
  byStatus: Record<string, number>;
  distribution: { label: string; count: number }[];
}
interface Incomplete {
  id: string;
  name: string;
  brand: string | null;
  gtin: string | null;
  hasImage: boolean;
  completenessScore: number;
  enrichmentStatus: string;
  category: string | null;
  missing: string[];
}

export function CatalogQuality() {
  const { api } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<Incomplete[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void api.request<Summary>("/catalog-quality/summary", { auth: true }).then(setSummary);
    void api
      .request<Incomplete[]>("/catalog-quality/incomplete?limit=50", { auth: true })
      .then(setItems);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const requeue = async (productId?: string) => {
    setBusy(true);
    try {
      await api.request("/catalog-quality/requeue", {
        method: "POST",
        auth: true,
        body: productId ? { productId } : {},
      });
    } finally {
      setBusy(false);
    }
  };

  const maxBucket = Math.max(1, ...(summary?.distribution.map((d) => d.count) ?? [1]));

  return (
    <div>
      <h1>Qualidade do catálogo</h1>

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginBottom: 24 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            <div className="muted" style={{ fontSize: 13 }}>Score médio</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{summary.avgScore}/100</div>
            <div className="muted" style={{ fontSize: 12 }}>{summary.total} produtos</div>
            <div style={{ marginTop: 12 }}>
              {Object.entries(summary.byStatus).map(([s, n]) => (
                <div key={s}>
                  <span className={`badge badge-${s}`}>{s}</span> {n}
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              Distribuição de score
            </div>
            {summary.distribution.map((b) => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 56, fontSize: 13 }}>{b.label}</span>
                <div
                  style={{
                    height: 18,
                    width: `${(b.count / maxBucket) * 100}%`,
                    minWidth: 2,
                    background: "#E40613",
                    borderRadius: 4,
                  }}
                />
                <span className="muted" style={{ fontSize: 12 }}>{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Incompletos priorizados</h2>
        <button className="btn-ghost" disabled={busy} onClick={() => requeue()}>
          Reenriquecer pendentes
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Categoria</th>
            <th>Score</th>
            <th>Faltando</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>{p.name}{p.brand ? ` · ${p.brand}` : ""}</td>
              <td className="muted">{p.category ?? "—"}</td>
              <td>{p.completenessScore}</td>
              <td className="muted">{p.missing.join(", ") || "—"}</td>
              <td>
                <button className="btn-ghost" disabled={busy} onClick={() => requeue(p.id)}>
                  reenriquecer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
