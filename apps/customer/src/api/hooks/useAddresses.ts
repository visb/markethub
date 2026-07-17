import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { marketplace, type Address } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";
import { selectActiveAddress } from "@/lib/mapRegion";

/**
 * Endereços do usuário — query + mutations no mesmo arquivo (padrão do repo).
 * A query expõe também o endereço de entrega ativo (default → [0]) usado pelo
 * pin de destino do mapa (faceta 3 da story 05). As mutations (story 71 — livro
 * de endereços) invalidam a key central após cada escrita.
 */

/** Corpo aceito pelo POST/PATCH /addresses (complement não vem no Address da lista). */
export type AddressPayload = Partial<Address> & { complement?: string | null };

export function useAddresses() {
  const { api } = useAuth();
  const mkt = marketplace(api);

  const query = useQuery({
    queryKey: queryKeys.addresses.all,
    queryFn: () => mkt.addresses(),
  });

  const addresses: Address[] = query.data ?? [];
  return {
    addresses,
    activeAddress: selectActiveAddress(addresses),
    loading: query.isLoading,
  };
}

/** Cria endereço (POST /addresses); o backend torna default o primeiro cadastrado. */
export function useAddAddress() {
  const { api } = useAuth();
  const qc = useQueryClient();
  const mkt = marketplace(api);
  return useMutation({
    mutationFn: (body: AddressPayload) => mkt.addAddress(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.addresses.all }),
  });
}

/** Edita endereço (PATCH /addresses/:id — body parcial). */
export function useUpdateAddress(id: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  const mkt = marketplace(api);
  return useMutation({
    mutationFn: (body: AddressPayload) => mkt.updateAddress(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.addresses.all }),
  });
}

/**
 * Remove endereço (DELETE /addresses/:id). Seguro mesmo para endereços usados em
 * pedidos passados (Order guarda addressSnapshot). O backend NÃO promove outro
 * endereço a padrão — a lista simplesmente fica sem badge.
 */
export function useRemoveAddress() {
  const { api } = useAuth();
  const qc = useQueryClient();
  const mkt = marketplace(api);
  return useMutation({
    mutationFn: (id: string) => mkt.removeAddress(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.addresses.all }),
  });
}

/** Torna o endereço o padrão (POST /addresses/:id/default). */
export function useSetDefaultAddress() {
  const { api } = useAuth();
  const qc = useQueryClient();
  const mkt = marketplace(api);
  return useMutation({
    mutationFn: (id: string) => mkt.setDefaultAddress(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.addresses.all }),
  });
}
