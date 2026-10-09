import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import { config } from "../config";
import { db } from "../db";
import { AppError, forbidden, unauthorized } from "./errors";
import type { AppEnv, AuthUser } from "./types";

export const userRoles = ["customer", "business", "producer", "admin"] as const;
export type UserRole = (typeof userRoles)[number];

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function issueToken(user: AuthUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email, iat: now, exp: now + TOKEN_TTL_SECONDS },
    config().JWT_SECRET,
    "HS256",
  );
}

export const hashPassword = (password: string) => Bun.password.hash(password, { algorithm: "argon2id" });
export const verifyPassword = (password: string, hash: string) => Bun.password.verify(password, hash);

async function readUser(header: string | undefined): Promise<AuthUser | undefined> {
  if (!header?.startsWith("Bearer ")) return undefined;
  try {
    const payload = await verify(header.slice(7), config().JWT_SECRET, "HS256");
    return {
      id: Number(payload.sub),
      role: payload.role as UserRole,
      name: String(payload.name),
      email: String(payload.email),
    };
  } catch {
    throw unauthorized("Token inválido ou expirado");
  }
}

// Lê o usuário se houver token, sem exigir login.
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await readUser(c.req.header("Authorization"));
  if (user) c.set("user", user);
  await next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await readUser(c.req.header("Authorization"));
  if (!user) throw unauthorized();
  c.set("user", user);
  await next();
});

export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw unauthorized();
    if (user.role !== "admin" && !roles.includes(user.role)) throw forbidden();
    await next();
  });

export function currentUser(c: { get(key: "user"): AuthUser | undefined }): AuthUser {
  const user = c.get("user");
  if (!user) throw unauthorized();
  return user;
}

// Acesso ao painel: conta admin, ou livre quando ADMIN_AUTH_DISABLED=true.
// No modo livre as ações ficam registradas no primeiro usuário admin do banco.
let openModeActor: AuthUser | undefined;

export const adminAccess = createMiddleware<AppEnv>(async (c, next) => {
  const user = await readUser(c.req.header("Authorization"));
  if (user?.role === "admin") {
    c.set("user", user);
    return next();
  }
  if (!config().ADMIN_AUTH_DISABLED) {
    if (!user) throw unauthorized();
    throw forbidden();
  }
  if (!openModeActor) {
    const [admin] = await db()`select id, name, email, role from users where role = 'admin' order by id limit 1`;
    if (!admin) throw new AppError(503, "no_admin", "Crie um usuário admin (bun run db:seed) para registrar as ações do painel");
    openModeActor = admin as AuthUser;
  }
  c.set("user", openModeActor);
  await next();
});
