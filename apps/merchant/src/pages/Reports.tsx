import { useMemo, useState } from "react";
import type { MerchantReportQuery } from "@markethub/api-client";
import { useMerchantContext } from "@/api/hooks/useMerchantContext";
import {
  useOperationsReport,
  usePickersReport,
  useReviewsReport,
  useSalesReport,
  useTopProductsReport,
} from "@/api/hooks/useReports";
import {
  dayToIso,
  PERIOD_PRESETS,
  resolvePresetRange,
  type PeriodPreset,
} from "@/lib/reportPeriod";

const AXIS_LABEL: Record<string, string> = {
  platform: "Plataforma",
  delivery: "Entrega",
  merchant: "Mercado",
};

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Taxa em fração 0..1 → percentual; null (sem dado) → traço. */
function formatPct(rate: number | null): string {
  return rate == null ? "—" : `${(rate * 100).toFixed(1).replace(".", ",")}%`;
}

/**
 * Relatórios do app merchant (story 13). Filtros de período (presets + custom) e
 * loja são estado de UI; os dados de servidor vêm por React Query (filtros na
 * query key → mudar o filtro refaz a busca). 4 seções: Vendas, Operacional,
 * Top produtos e Avaliações. Visível p/ dono e gerente (escopo no backend).
 */
export function Reports() {
  const { data: ctx } = useMerchantContext();
  const stores = useMemo(() => ctx?.stores ?? [], [ctx]);

  const [preset, setPreset] = useState<PeriodPreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [storeId, setStoreId] = useState("");

  const range = useMemo<{ from?: string; to?: string }>(() => {
    if (preset === "custom") {
      return { from: dayToIso(customFrom, "start"), to: dayToIso(customTo, "end") };
    }
    return resolvePresetRange(preset);
  }, [preset, customFrom, customTo]);

  const filters: MerchantReportQuery = useMemo(
    () => ({ from: range.from, to: range.to, storeId: storeId || undefined }),
    [range, storeId],
  );

  const enabled = stores.length > 0;
  const sales = useSalesReport(filters, { enabled });
  const operations = useOperationsReport(filters, { enabled });
  const topProducts = useTopProductsReport(filters, { enabled });
  const reviews = useReviewsReport(filters, { enabled });
  const pickers = usePickersReport(filters, { enabled });

  return (
    <section>
      <div className="page-head">
        <h1>Relatórios</h1>
      </div>

      <div className="filters">
        <label>
          Período
          <select value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)}>
            {PERIOD_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value="custom">Personalizado</option>
          </select>
        </label>

        {preset === "custom" && (
          <>
            <label>
              De
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </>
        )}

        {stores.length > 1 && (
          <label>
            Loja
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Todas</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Vendas / faturamento */}
      <div className="report-section">
        <h2>Vendas</h2>
        {sales.isLoading && <p className="muted">Carregando…</p>}
        {sales.data && (
          <div className="cards">
            <div className="card">
              <span className="card-label">Faturamento</span>
              <strong>{formatBRL(sales.data.salesCents)}</strong>
            </div>
            <div className="card">
              <span className="card-label">Pedidos pagos</span>
              <strong>{sales.data.ordersPaid}</strong>
            </div>
            <div className="card">
              <span className="card-label">Ticket médio</span>
              <strong>{formatBRL(sales.data.ticketCents)}</strong>
            </div>
            <div className="card">
              <span className="card-label">Taxa da plataforma</span>
              <strong>{formatBRL(sales.data.platformFeeCents)}</strong>
            </div>
            <div className="card">
              <span className="card-label">Reembolsos</span>
              <strong>{formatBRL(sales.data.refundsCents)}</strong>
            </div>
            <div className="card">
              <span className="card-label">Repasse estimado</span>
              <strong>{formatBRL(sales.data.estimatedPayoutCents)}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Operacional */}
      <div className="report-section">
        <h2>Operacional</h2>
        {operations.isLoading && <p className="muted">Carregando…</p>}
        {operations.data && (
          <div className="report-grid">
            <div>
              <h3>Pedidos por status</h3>
              <StatusTable counts={operations.data.ordersByStatus} />
            </div>
            <div>
              <h3>Separação</h3>
              <StatusTable counts={operations.data.picking} />
            </div>
            <div>
              <h3>Entregas</h3>
              <StatusTable counts={operations.data.deliveries} />
            </div>
            <div className="card">
              <span className="card-label">Retiradas pendentes</span>
              <strong>{operations.data.pendingPickups}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Separação por colaborador (story 65) */}
      <div className="report-section">
        <h2>Separação por colaborador</h2>
        {pickers.isLoading && <p className="muted">Carregando…</p>}
        {pickers.data &&
          (pickers.data.rows.length === 0 ? (
            <p className="muted">Sem separações no período.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Tarefas</th>
                  <th>Itens</th>
                  <th>Itens/h</th>
                  <th>Subst.</th>
                  <th>Recusa</th>
                </tr>
              </thead>
              <tbody>
                {pickers.data.rows.map((r) => (
                  <tr key={r.pickerId}>
                    <td>{r.name}</td>
                    <td>{r.tasksCompleted}</td>
                    <td>{r.itemsPicked}</td>
                    <td>{r.itemsPerHour == null ? "—" : String(r.itemsPerHour).replace(".", ",")}</td>
                    <td>{formatPct(r.substitutionRate)}</td>
                    <td>{formatPct(r.refusalRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>

      {/* Top produtos */}
      <div className="report-section">
        <h2>Top produtos</h2>
        {topProducts.isLoading && <p className="muted">Carregando…</p>}
        {topProducts.data &&
          (topProducts.data.items.length === 0 ? (
            <p className="muted">Sem vendas no período.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtde</th>
                  <th>Receita</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.data.items.map((p) => (
                  <tr key={p.productId ?? p.name}>
                    <td>{p.name}</td>
                    <td>{p.quantity}</td>
                    <td>{formatBRL(p.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>

      {/* Avaliações */}
      <div className="report-section">
        <h2>Avaliações</h2>
        {reviews.isLoading && <p className="muted">Carregando…</p>}
        {reviews.data &&
          (reviews.data.axes.length === 0 ? (
            <p className="muted">Sem avaliações no período.</p>
          ) : (
            <div className="cards">
              {reviews.data.axes.map((a) => (
                <div className="card" key={a.axis}>
                  <span className="card-label">{AXIS_LABEL[a.axis] ?? a.axis}</span>
                  <strong>
                    {a.average.toFixed(2)} ★ <span className="muted">({a.count})</span>
                  </strong>
                </div>
              ))}
            </div>
          ))}
      </div>
    </section>
  );
}

/** Tabela simples status → contagem (vazia → traço). */
function StatusTable({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <p className="muted">—</p>;
  return (
    <table className="table">
      <tbody>
        {entries.map(([status, count]) => (
          <tr key={status}>
            <td>{status}</td>
            <td>{count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
