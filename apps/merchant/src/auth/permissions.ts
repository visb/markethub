import type { MerchantRole } from "@markethub/api-client";

/**
 * Capacidades do app merchant (story 07). Base para as stories 08–13 escondemos
 * itens de nav e ações por capacidade — a aplicação fina por tela é das stories
 * seguintes, e o backend SEMPRE reforça (RBAC no service).
 *
 * Matriz (refino da story):
 * - owner (dono da rede): tudo.
 * - manager (gerente da loja): colaboradores + catálogo da(s) sua(s) loja(s);
 *   SEM integração e SEM criar/editar lojas.
 */
export type Capability =
  | "stores.view"
  | "stores.create"
  | "integration.manage"
  | "staff.manage"
  | "catalog.manage"
  | "orders.view"
  | "reports.view";

const OWNER_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  "stores.view",
  "stores.create",
  "integration.manage",
  "staff.manage",
  "catalog.manage",
  "orders.view",
  "reports.view",
]);

const MANAGER_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  "stores.view",
  "staff.manage",
  "catalog.manage",
  "orders.view",
  "reports.view",
]);

const CAPS_BY_ROLE: Record<MerchantRole, ReadonlySet<Capability>> = {
  owner: OWNER_CAPS,
  manager: MANAGER_CAPS,
};

/** Resolve se um papel tem uma capacidade. */
export function can(role: MerchantRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPS_BY_ROLE[role].has(capability);
}
