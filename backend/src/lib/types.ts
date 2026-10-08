import type { UserRole } from "./auth";

export type AuthUser = { id: number; role: UserRole; name: string; email: string };

export type AppEnv = { Variables: { user?: AuthUser } };
