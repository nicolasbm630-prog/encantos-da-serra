import { z } from "zod";
import { onlyDigits } from "./text";

export const cepSchema = z
  .string()
  .transform(onlyDigits)
  .refine((v) => v.length === 8, "CEP inválido — use 8 dígitos");

export const addressSchema = z.object({
  recipient: z.string().trim().min(2),
  street: z.string().trim().min(2),
  number: z.string().trim().min(1),
  complement: z.string().trim().optional(),
  district: z.string().trim().min(2),
  city: z.string().trim().min(2),
  state: z.string().trim().length(2).transform((s) => s.toUpperCase()),
});

export const itemSchema = z.object({
  productId: z.number().int().positive(),
  mode: z.enum(["unit", "box"]),
  quantity: z.number().int().min(1).max(999),
});
