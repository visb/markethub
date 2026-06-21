import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { marketplace, type Address } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";
import { selectActiveAddress } from "@/lib/mapRegion";

/**
 * Endereços do usuário (React Query). Expõe também o endereço de entrega ativo
 * (default → [0]) usado pelo pin de destino do mapa (faceta 3 da story 05).
 */
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
