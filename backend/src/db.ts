import { SQL } from "bun";
import { config } from "./config";
import { AppError } from "./lib/errors";

// Cliente Postgres nativo do Bun. Use o "Session pooler" do Supabase (porta 5432).
// No "Transaction pooler" (porta 6543) troque para `prepare: false`.
let client: SQL | undefined;

export function db(): SQL {
  const url = config().DATABASE_URL;
  if (!url) throw new AppError(503, "database_not_configured", "DATABASE_URL não configurada em backend/.env");
  if (url.includes("[YOUR-PASSWORD]")) {
    throw new AppError(503, "database_not_configured", "Troque [YOUR-PASSWORD] pela senha do banco em backend/.env");
  }
  client ??= new SQL({ url, max: 10, idleTimeout: 30 });
  return client;
}

export async function closeDb() {
  await client?.close();
  client = undefined;
}
