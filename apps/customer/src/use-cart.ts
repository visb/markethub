import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth-context";
import { marketplace, type SaleType } from "@/api/marketplace";

interface Entry {
  itemId?: string;
  quantity: number;
  weightGrams: number | null;
  saleType: SaleType;
}

/** Loja com itens no carrinho (atalhos flutuantes da home). */
export interface CartStore {
  storeId: string;
  merchantId: string;
  merchant: string;
  logoUrl: string | null;
}

const SYNC_DELAY = 450;
const WEIGHT_STEP = 100;
const WEIGHT_MIN = 100;
const WEIGHT_DEFAULT = 300;

/**
 * Estado do carrinho com atualização OTIMISTA (UI muda na hora) + sync ao servidor
 * com DEBOUNCE (evita 1 request por toque). Adicionar = vira stepper, sem redirecionar.
 */
export function useCart() {
  const { api } = useAuth();
  const mkt = useMemo(() => marketplace(api), [api]);
  const [map, setMap] = useState<Record<string, Entry>>({});
  const [total, setTotal] = useState(0);
  const [stores, setStores] = useState<CartStore[]>([]);
  const mapRef = useRef(map);
  mapRef.current = map;
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const refresh = useCallback(async () => {
    const cart = await mkt.getCart();
    const m: Record<string, Entry> = {};
    for (const g of cart.groups)
      for (const it of g.items)
        m[it.offerId] = {
          itemId: it.id,
          quantity: it.quantity,
          weightGrams: it.weightGrams,
          saleType: it.saleType,
        };
    setMap(m);
    setTotal(cart.totals.totalCents);
    setStores(
      cart.groups.map((g) => ({
        storeId: g.storeId,
        merchantId: g.merchantId,
        merchant: g.merchant,
        logoUrl: g.merchantLogoUrl,
      })),
    );
  }, [mkt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sync = useCallback(
    async (offerId: string) => {
      const e = mapRef.current[offerId];
      const empty =
        !e ||
        (e.saleType === "unit" && e.quantity <= 0) ||
        (e.saleType === "weight" && (e.weightGrams ?? 0) < WEIGHT_MIN);
      try {
        if (empty) {
          if (e?.itemId) await mkt.removeItem(e.itemId);
        } else {
          await mkt.addItem({
            offerId,
            ...(e.saleType === "weight" ? { weightGrams: e.weightGrams ?? 0 } : { quantity: e.quantity }),
          });
        }
      } catch {
        /* mantém otimista; refresh corrige */
      }
      await refresh();
    },
    [mkt, refresh],
  );

  const schedule = useCallback(
    (offerId: string) => {
      clearTimeout(timers.current[offerId]);
      timers.current[offerId] = setTimeout(() => void sync(offerId), SYNC_DELAY);
    },
    [sync],
  );

  const setLocal = useCallback((offerId: string, entry: Entry | null) => {
    setMap((prev) => {
      const next = { ...prev };
      if (entry === null) delete next[offerId];
      else next[offerId] = entry;
      return next;
    });
  }, []);

  const bump = useCallback(
    (offerId: string, saleType: SaleType, delta: number, start: boolean) => {
      const cur = mapRef.current[offerId];
      const base: Entry = cur ?? { quantity: 0, weightGrams: saleType === "weight" ? 0 : null, saleType };
      let next: Entry | null;
      if (saleType === "weight") {
        const g = start && !cur ? WEIGHT_DEFAULT : (base.weightGrams ?? 0) + delta * WEIGHT_STEP;
        next = g < WEIGHT_MIN ? (base.itemId ? { ...base, weightGrams: 0 } : null) : { ...base, weightGrams: g };
      } else {
        const q = start && !cur ? 1 : base.quantity + delta;
        next = q <= 0 ? (base.itemId ? { ...base, quantity: 0 } : null) : { ...base, quantity: q };
      }
      setLocal(offerId, next);
      schedule(offerId);
    },
    [schedule, setLocal],
  );

  const add = useCallback((offerId: string, saleType: SaleType) => bump(offerId, saleType, 0, true), [bump]);
  const inc = useCallback((offerId: string, saleType: SaleType) => bump(offerId, saleType, 1, false), [bump]);
  const dec = useCallback((offerId: string, saleType: SaleType) => bump(offerId, saleType, -1, false), [bump]);

  const labelFor = useCallback(
    (offerId: string, saleType: SaleType): string | null => {
      const e = map[offerId];
      if (!e) return null;
      return saleType === "weight" ? `${e.weightGrams}g` : String(e.quantity);
    },
    [map],
  );

  return { total, stores, refresh, add, inc, dec, labelFor };
}
