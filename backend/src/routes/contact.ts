import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import type { AppEnv } from "../lib/types";
import { validate } from "../lib/validate";

const contactSchema = z
  .object({
    topic: z.enum(["general", "wholesale", "partnership", "order"]).default("general"),
    name: z.string().trim().min(2).max(120),
    email: z.email(),
    phone: z.string().trim().max(30).optional(),
    message: z.string().trim().min(5).max(2000),
    // Honeypot anti-spam: campo escondido no form, humanos deixam vazio.
    website: z.string().max(0).optional(),
  })
  .strict();

// "Não sabe qual escolher? Fale conosco." / "Fale com a equipe de parcerias"
export const contactRoutes = new Hono<AppEnv>().post("/", validate("json", contactSchema), async (c) => {
  const { website: _honeypot, ...body } = c.req.valid("json");
  const [row] = await db()`
    insert into contact_messages (topic, name, email, phone, message)
    values (${body.topic}, ${body.name}, ${body.email}, ${body.phone ?? null}, ${body.message})
    returning id, created_at as "createdAt"`;
  return c.json({ id: row.id, message: "Recebemos sua mensagem. Retornamos em até 1 dia útil." }, 201);
});
