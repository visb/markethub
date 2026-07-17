import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AuthUser,
  ChangePasswordInput,
  ChangePasswordResultDTO,
  UpdateMeInput,
} from "@markethub/api-client";
import { useAuth } from "@/auth-context";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Conta/perfil do usuário autenticado (story 70). O contrato (AuthUser com
 * phone, UpdateMeInput, ChangePasswordInput) vive em packages/types e as
 * chamadas tipadas no @markethub/api-client (me/updateMe/changeMyPassword) —
 * compartilhadas com os demais apps; aqui só os hooks de React Query.
 */

/** Perfil corrente (GET auth/me — inclui phone). */
export function useMe(options?: { enabled?: boolean }) {
  const { api } = useAuth();
  return useQuery({
    queryKey: queryKeys.account.me,
    queryFn: () => api.me(),
    enabled: options?.enabled ?? true,
  });
}

/** PATCH parcial de nome/telefone; sucesso grava o perfil devolvido no cache. */
export function useUpdateMe() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation<AuthUser, unknown, UpdateMeInput>({
    mutationFn: (input) => api.updateMe(input),
    onSuccess: (me) => {
      qc.setQueryData(queryKeys.account.me, me);
    },
  });
}

/** Troca de senha (senha atual + nova); as demais sessões são revogadas no backend. */
export function useChangePassword() {
  const { api } = useAuth();
  return useMutation<ChangePasswordResultDTO, unknown, ChangePasswordInput>({
    mutationFn: (input) => api.changeMyPassword(input),
  });
}
