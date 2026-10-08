import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import { z, type ZodType } from "zod";
import { badRequest } from "./errors";

z.config(z.locales.pt());

// zValidator com erro no mesmo formato do resto da API.
export const validate = <Target extends keyof ValidationTargets, Schema extends ZodType>(target: Target, schema: Schema) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw badRequest(
        "Dados inválidos",
        result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
  });

export function isUniqueViolation(error: unknown): boolean {
  const e = error as { errno?: string; code?: string } | undefined;
  return e?.errno === "23505" || e?.code === "23505";
}
