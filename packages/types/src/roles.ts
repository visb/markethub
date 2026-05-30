import { z } from "zod";

export const roleNameSchema = z.enum(["customer", "picker", "driver", "merchant", "admin"]);
export type RoleName = z.infer<typeof roleNameSchema>;

export const ROLE_NAMES = roleNameSchema.options;
