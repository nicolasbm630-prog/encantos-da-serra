import { mkdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "../config";
import { badRequest } from "./errors";
import { randomToken } from "./text";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Confere a assinatura real do arquivo, não só a extensão.
const SIGNATURES: { mime: string; ext: string; bytes: number[] }[] = [
  { mime: "application/pdf", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
];

export function detectFileType(head: Uint8Array) {
  return SIGNATURES.find((s) => s.bytes.every((b, i) => head[i] === b));
}

export async function storeUpload(folder: string, file: File) {
  if (file.size === 0) throw badRequest("Arquivo vazio");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Arquivo maior que 10 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectFileType(bytes.subarray(0, 8));
  if (!type) throw badRequest("Formato não aceito — envie PDF, JPG ou PNG");

  const dir = resolve(config().UPLOAD_DIR, folder);
  await mkdir(dir, { recursive: true });
  const storedName = `${randomToken(12)}.${type.ext}`;
  await Bun.write(join(dir, storedName), bytes);
  return { storedName, mimeType: type.mime, sizeBytes: file.size };
}

export function uploadPath(folder: string, storedName: string) {
  return resolve(config().UPLOAD_DIR, folder, storedName);
}

export async function removeUpload(folder: string, storedName: string) {
  await unlink(uploadPath(folder, storedName)).catch(() => undefined);
}
