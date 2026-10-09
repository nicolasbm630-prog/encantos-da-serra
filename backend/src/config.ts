import { z } from "zod";

const schema = z.object({
  // Opcional para o servidor subir; rotas que usam banco respondem 503 até ser configurada.
  DATABASE_URL: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa de pelo menos 32 caracteres"),
  PORT: z.coerce.number().int().default(3333),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000"),
  UPLOAD_DIR: z.string().default("./uploads"),
  // Em produção, pasta do site compilado (frontend/dist). A API passa a entregar o site também.
  STATIC_DIR: z.string().optional(),
  TZ_BUSINESS: z.string().default("America/Sao_Paulo"),
  // Painel admin sem login (temporário, só para desenvolvimento). Use "false" para exigir conta admin.
  ADMIN_AUTH_DISABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function config(): Config {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Configuração inválida:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
