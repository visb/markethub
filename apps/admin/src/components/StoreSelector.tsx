import type { PickStore } from "@markethub/api-client";

/** Seletor de loja para o manager que gere mais de uma (S3.11). */
export function StoreSelector({
  stores,
  value,
  onChange,
}: {
  stores: PickStore[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  if (stores.length <= 1) return null;
  return (
    <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {stores.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
