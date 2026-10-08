import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, "not_found", `${what} não encontrado(a)`);
export const badRequest = (message: string, details?: unknown) => new AppError(400, "bad_request", message, details);
export const conflict = (message: string) => new AppError(409, "conflict", message);
export const unauthorized = (message = "Autenticação necessária") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "Sem permissão para esta ação") => new AppError(403, "forbidden", message);
