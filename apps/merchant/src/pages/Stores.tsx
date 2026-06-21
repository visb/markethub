import { useMerchantContext } from "@/api/hooks/useMerchantContext";

/** Placeholder da área de Lojas (CRUD real na story 08). */
export function Stores() {
  const { data, isLoading } = useMerchantContext();

  return (
    <section>
      <h1>Lojas</h1>
      {isLoading && <p className="muted">Carregando…</p>}
      {data && data.stores.length === 0 && (
        <p className="muted">Nenhuma loja cadastrada ainda.</p>
      )}
      {data && data.stores.length > 0 && (
        <ul className="list">
          {data.stores.map((s) => (
            <li key={s.id} className="list-item">
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
