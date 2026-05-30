import { useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";

interface Run {
  id: string;
  storeId: string;
  type: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  itemsProcessed: number;
  itemsUpdated: number;
  itemsFailed: number;
  error: string | null;
}

export function ErpRuns() {
  const { api } = useAuth();
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    void api.request<Run[]>("/erp/runs", { auth: true }).then(setRuns);
  }, [api]);

  return (
    <div>
      <h1>Execuções de sync ERP</h1>
      <table className="table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Status</th>
            <th>Processados</th>
            <th>Atualizados</th>
            <th>Falhas</th>
            <th>Início</th>
            <th>Erro</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{r.type}</td>
              <td>
                <span className={`badge badge-${r.status}`}>{r.status}</span>
              </td>
              <td>{r.itemsProcessed}</td>
              <td>{r.itemsUpdated}</td>
              <td>{r.itemsFailed}</td>
              <td>{new Date(r.startedAt).toLocaleString("pt-BR")}</td>
              <td className="muted">{r.error ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
