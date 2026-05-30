import { z } from "zod";

/** Espelha o formato de erro da API (AllExceptionsFilter). */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  path: z.string().optional(),
  timestamp: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
