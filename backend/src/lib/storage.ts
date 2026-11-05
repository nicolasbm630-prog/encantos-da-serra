import { config } from "../config";
import { AppError } from "./errors";

// Envio de arquivos públicos para o Supabase Storage pela API REST.

// "postgresql://postgres.<ref>:senha@…pooler.supabase.com" → "https://<ref>.supabase.co"
function projectUrl() {
  const { SUPABASE_URL, DATABASE_URL } = config();
  if (SUPABASE_URL) return SUPABASE_URL.replace(/\/$/, "");
  const ref = DATABASE_URL?.match(/\/\/postgres\.([a-z0-9]+):/)?.[1];
  return ref ? `https://${ref}.supabase.co` : undefined;
}

export function storageReady() {
  return !!(projectUrl() && config().SUPABASE_SECRET_KEY);
}

export const publicUrl = (path: string) => `${projectUrl()}/storage/v1/object/public/${config().STORAGE_BUCKET}/${path}`;

export async function uploadPublicFile(path: string, bytes: Uint8Array, contentType: string) {
  const url = projectUrl();
  const key = config().SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new AppError(503, "storage_not_configured", "Upload de fotos indisponível: configure SUPABASE_SECRET_KEY no backend");
  }
  // A chave vai em apikey; com chaves sb_secret_* o gateway troca o Bearer pelo papel service_role.
  const res = await fetch(`${url}/storage/v1/object/${config().STORAGE_BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "max-age=31536000" },
    body: bytes,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`Storage ${res.status}: ${detail}`);
    throw new AppError(502, "storage_error", res.status === 403 || res.status === 401 ? "O Storage recusou a chave do Supabase" : "Não foi possível enviar a foto ao Storage");
  }
  return publicUrl(path);
}
