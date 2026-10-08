import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { hashPassword, issueToken, requireAuth, verifyPassword, currentUser, type UserRole } from "../lib/auth";
import { formatCnpj, isValidCnpj } from "../lib/cnpj";
import { conflict, unauthorized } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { isUniqueViolation, validate } from "../lib/validate";

const registerSchema = z
  .object({
    name: z.string().trim().min(2),
    email: z.email().transform((e) => e.toLowerCase()),
    password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres"),
    phone: z.string().trim().optional(),
    accountType: z.enum(["customer", "business"]).default("customer"),
    business: z
      .object({
        tradeName: z.string().trim().min(2),
        legalName: z.string().trim().optional(),
        cnpj: z.string().refine(isValidCnpj, "CNPJ inválido"),
      })
      .optional(),
  })
  .refine((d) => d.accountType !== "business" || d.business, {
    message: "Dados da empresa são obrigatórios para conta B2B",
    path: ["business"],
  });

const loginSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

export const authRoutes = new Hono<AppEnv>()
  .post("/register", validate("json", registerSchema), async (c) => {
    const body = c.req.valid("json");
    const role: UserRole = body.accountType;
    const passwordHash = await hashPassword(body.password);

    try {
      const user = await db().begin(async (tx) => {
        const [u] = await tx`
          insert into users (name, email, password_hash, phone, role)
          values (${body.name}, ${body.email}, ${passwordHash}, ${body.phone ?? null}, ${role})
          returning id, name, email, role`;
        if (role === "business" && body.business) {
          await tx`
            insert into business_accounts (user_id, trade_name, legal_name, cnpj)
            values (${u.id}, ${body.business.tradeName}, ${body.business.legalName ?? null}, ${formatCnpj(body.business.cnpj)})`;
        }
        return u as { id: number; name: string; email: string; role: UserRole };
      });
      return c.json({ token: await issueToken(user), user }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("E-mail ou CNPJ já cadastrado");
      throw error;
    }
  })

  .post("/login", validate("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");
    const [row] = await db()`select id, name, email, role, password_hash from users where email = ${email}`;
    if (!row || !(await verifyPassword(password, row.password_hash))) throw unauthorized("E-mail ou senha incorretos");
    const user = { id: row.id, name: row.name, email: row.email, role: row.role as UserRole };
    return c.json({ token: await issueToken(user), user });
  })

  .get("/me", requireAuth, async (c) => {
    const { id } = currentUser(c);
    const [user] = await db()`
      select u.id, u.name, u.email, u.phone, u.role, u.created_at as "createdAt",
        (select json_build_object('tradeName', b.trade_name, 'legalName', b.legal_name, 'cnpj', b.cnpj,
                                  'priceTable', b.price_table, 'priceTableValidUntil', b.price_table_valid_until,
                                  'accountManager', b.account_manager)
           from business_accounts b where b.user_id = u.id) as business,
        (select json_build_object('id', p.id, 'slug', p.slug, 'name', p.name)
           from producers p where p.user_id = u.id) as producer
      from users u where u.id = ${id}`;
    if (!user) throw unauthorized();
    return c.json({ user });
  });
