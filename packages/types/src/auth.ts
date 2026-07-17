import { z } from "zod";
import { roleNameSchema } from "./roles";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  roles: z.array(roleNameSchema).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  /** Telefone BR só-dígitos (10–11, DDD + número) ou null (story 70). */
  phone: z.string().nullable(),
  roles: z.array(roleNameSchema),
});
export type AuthUser = z.infer<typeof authUserSchema>;

// ─── Conta/perfil do usuário autenticado (story 70) ───

/**
 * PATCH users/me — parcial: campo ausente (undefined) não toca; `phone: null`
 * limpa o telefone. Telefone normalizado só-dígitos (o backend também normaliza).
 */
export const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().regex(/^\d{10,11}$/).nullable().optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

/** POST users/me/password — política da senha nova = mesma do registro (min 8). */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Resultado da troca de senha: demais sessões revogadas (a corrente sobrevive). */
export interface ChangePasswordResultDTO {
  ok: boolean;
  revokedSessions: number;
}
