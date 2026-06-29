import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth-context";
import { marketplace, type FollowedStoreView } from "@/api/marketplace";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Seguir/deixar de seguir uma loja (story 34). A mutation recebe o estado ATUAL
 * (`current`): se já segue → `unfollow`, senão → `follow`; resolve com o estado
 * novo. No sucesso, grava o status confirmado no cache e invalida a lista de
 * lojas seguidas.
 */
export function useToggleStoreFollow(storeId: string) {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const qc = useQueryClient();

  return useMutation<boolean, unknown, boolean>({
    mutationFn: async (current: boolean) => {
      if (current) await mkt.unfollowStore(storeId);
      else await mkt.followStore(storeId);
      return !current;
    },
    onSuccess: (next) => {
      qc.setQueryData(queryKeys.storeFollows.status(storeId), next);
      void qc.invalidateQueries({ queryKey: queryKeys.storeFollows.all });
    },
  });
}

/**
 * Estado seguido/não-seguido de uma loja + ação de alternar (story 34). O estado
 * inicial vem do `sections` já carregado (`sectionsFollowing`), que pode chegar
 * depois do mount — daí o `useEffect` de sincronização. O `toggle` atualiza
 * `following` de forma otimista e faz rollback se a chamada falhar. A tela usa
 * `following` para o ícone e `toggle` no `onPress`.
 */
export function useStoreFollow(storeId: string, sectionsFollowing: boolean | undefined) {
  const [following, setFollowing] = useState<boolean>(sectionsFollowing ?? false);
  const mutation = useToggleStoreFollow(storeId);

  useEffect(() => {
    if (sectionsFollowing !== undefined) setFollowing(sectionsFollowing);
  }, [sectionsFollowing]);

  const toggle = () => {
    const current = following;
    setFollowing(!current); // otimista
    mutation.mutate(current, {
      onError: () => setFollowing(current), // rollback
    });
  };

  return { following, toggle, isToggling: mutation.isPending };
}

export type { FollowedStoreView };
