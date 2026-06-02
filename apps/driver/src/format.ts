/** Centavos → "R$ 12,34". */
export function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Metros → "1,2 km" ou "350 m". */
export function distance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

/** Segundos restantes até `iso` (>=0). */
export function secondsUntil(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}
