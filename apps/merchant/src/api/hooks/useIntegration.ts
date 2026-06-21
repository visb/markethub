import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateWebhookInput,
  ErpConfigInput,
  UpdateWebhookInput,
} from "@markethub/api-client";
import { useAuth } from "@/auth/auth-context";
import {
  createApiKey,
  createWebhook,
  deleteWebhook,
  getErpConfig,
  listApiKeys,
  listWebhooks,
  putErpConfig,
  revokeApiKey,
  testWebhook,
  updateWebhook,
} from "@/api/integration";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Server-state da integração (story 09). Cada recurso (ERP/api-keys/webhooks) tem
 * suas queries + mutations aqui; telas só orquestram. Owner-only (backend reforça).
 */

// ── ERP ──
export function useErpConfig(options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.integration.erp,
    queryFn: () => getErpConfig(api),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

export function usePutErpConfig() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ErpConfigInput) => putErpConfig(api, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.integration.erp });
    },
  });
}

// ── Api-keys ──
export function useApiKeys(options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.integration.apiKeys,
    queryFn: () => listApiKeys(api),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

export function useCreateApiKey() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createApiKey(api, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.integration.apiKeys });
    },
  });
}

export function useRevokeApiKey() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(api, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.integration.apiKeys });
    },
  });
}

// ── Webhooks ──
export function useWebhooks(options?: { enabled?: boolean }) {
  const { api, user } = useAuth();
  return useQuery({
    queryKey: queryKeys.integration.webhooks,
    queryFn: () => listWebhooks(api),
    enabled: (options?.enabled ?? true) && Boolean(user),
  });
}

export function useCreateWebhook() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWebhookInput) => createWebhook(api, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.integration.webhooks });
    },
  });
}

export function useUpdateWebhook() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateWebhookInput }) =>
      updateWebhook(api, id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.integration.webhooks });
    },
  });
}

export function useDeleteWebhook() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWebhook(api, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.integration.webhooks });
    },
  });
}

export function useTestWebhook() {
  const { api } = useAuth();
  return useMutation({
    mutationFn: (id: string) => testWebhook(api, id),
  });
}
