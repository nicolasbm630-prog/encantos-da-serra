import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { closeDb, db } from "../db";
import { storageReady, uploadPublicFile } from "../lib/storage";

// Envia as fotos de frontend/public/images/products para o Supabase Storage e aponta os produtos para elas.
// Pode rodar de novo: o envio sobrescreve o mesmo caminho e só atualiza produtos que ainda usam /images/products.
const dir = join(import.meta.dir, "../../../frontend/public/images/products");
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

if (!storageReady()) {
  console.error("Configure SUPABASE_SECRET_KEY em backend/.env antes de rodar.");
  process.exit(1);
}

const files = (await readdir(dir)).filter((f) => TYPES[extname(f).toLowerCase()]).sort();
let updated = 0;
for (const file of files) {
  const bytes = new Uint8Array(await Bun.file(join(dir, file)).arrayBuffer());
  const url = await uploadPublicFile(`catalogo/${file}`, bytes, TYPES[extname(file).toLowerCase()]!);
  const rows = await db()`update products set image_url = ${url}, updated_at = now() where image_url = ${`/images/products/${file}`} returning sku`;
  updated += rows.length;
  console.log(`✓ ${file}${rows.length ? ` → ${rows.map((r: { sku: string }) => r.sku).join(", ")}` : ""}`);
}
console.log(`${files.length} fotos no bucket, ${updated} produtos atualizados.`);
await closeDb();
