import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DriverAvailabilityDTO } from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import { availability } from "@/api/availability";
import { queryKeys } from "@/lib/queryKeys";

/** Estado corrente do turno do entregador (story 62). */
export function useDriverAvailability() {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.availability.current,
    queryFn: () => availability(client).get(),
  });
}

/**
 * Liga/desliga o turno com atualização OTIMISTA + rollback (story 62): o switch
 * reflete o novo estado na hora; se a chamada falhar, restaura o estado anterior.
 * Ao concluir (sucesso ou erro) revalida o estado real do servidor.
 */
export function useSetAvailability() {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.availability.current;
  return useMutation<
    DriverAvailabilityDTO,
    unknown,
    boolean,
    { previous: DriverAvailabilityDTO | undefined }
  >({
    mutationFn: (available: boolean) => availability(client).set(available),
    onMutate: async (available) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DriverAvailabilityDTO>(key);
      // Otimista: reflete o alvo já (mantém o "desde" original ao ligar, se houver).
      queryClient.setQueryData<DriverAvailabilityDTO>(key, {
        available,
        availableSince: available ? (previous?.availableSince ?? new Date().toISOString()) : null,
      });
      return { previous };
    },
    onError: (_err, _available, context) => {
      // Rollback ao estado anterior.
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
