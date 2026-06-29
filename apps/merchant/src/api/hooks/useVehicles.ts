import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateVehicleInput, UpdateVehicleInput } from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import { createVehicle, listVehicles, removeVehicle, updateVehicle } from "@/api/vehicles";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state da frota de veículos (story 14). Lista por rede (escopo do usuário
 * no backend); mutations invalidam a lista. Telas só orquestram — sem fetch inline.
 */
export function useVehicles(merchantId?: string, options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.vehicles.byMerchant(merchantId),
    queryFn: () => listVehicles(api, merchantId),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

/** Invalida toda a árvore de veículos (qualquer filtro de rede). */
function useInvalidateVehicles() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.vehicles.all });
}

export function useCreateVehicle() {
  const { api } = useAuth();
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: (input: CreateVehicleInput) => createVehicle(api, input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useUpdateVehicle() {
  const { api } = useAuth();
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateVehicleInput }) =>
      updateVehicle(api, id, patch),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useDeleteVehicle() {
  const { api } = useAuth();
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: ({ id, hard }: { id: string; hard?: boolean }) => removeVehicle(api, id, hard),
    onSuccess: () => {
      void invalidate();
    },
  });
}
