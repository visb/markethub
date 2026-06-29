import type { MerchantRole } from "@markethub/api-client";

/**
 * Capacidades do app merchant (story 07). Base para as stories 08–13 escondemos
 * itens de nav e ações por capacidade — a aplicação fina por tela é das stories
 * seguintes, e o backend SEMPRE reforça (RBAC no service).
 *
 * Matriz (refino da story / RBAC story 16):
 * - owner (dono da rede): tudo, incluindo criar/editar lojas.
 * - admin (administrador da loja): acesso total à(s) loja(s) do escopo, INCLUI
 *   integração e gestão de equipe; NÃO cria/edita lojas (nível de rede).
 * - manager (gerente da loja): colaboradores + catálogo da(s) sua(s) loja(s);
 *   SEM integração e SEM criar/editar lojas.
 */
export type Capability =
  | "stores.view"
  | "stores.create"
  | "integration.manage"
  | "staff.manage"
  | "vehicles.manage"
  | "catalog.manage"
  | "orders.view"
  | "reports.view";

const OWNER_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  "stores.view",
  "stores.create",
  "integration.manage",
  "staff.manage",
  "vehicles.manage",
  "catalog.manage",
  "orders.view",
  "reports.view",
]);

// Admin da loja: tudo menos criar/editar lojas (nível de rede, owner-only).
const ADMIN_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  "stores.view",
  "integration.manage",
  "staff.manage",
  "vehicles.manage",
  "catalog.manage",
  "orders.view",
  "reports.view",
]);

const MANAGER_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  "stores.view",
  "staff.manage",
  "vehicles.manage",
  "catalog.manage",
  "orders.view",
  "reports.view",
]);

const CAPS_BY_ROLE: Record<MerchantRole, ReadonlySet<Capability>> = {
  owner: OWNER_CAPS,
  admin: ADMIN_CAPS,
  manager: MANAGER_CAPS,
};

/** Resolve se um papel tem uma capacidade. */
export function can(role: MerchantRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPS_BY_ROLE[role].has(capability);
}
