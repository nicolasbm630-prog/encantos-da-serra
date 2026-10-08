import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { closeDb, db } from "../db";

// Aplica, em ordem, os .sql de db/migrations que ainda não rodaram. Cada arquivo roda numa transação.
const dir = join(import.meta.dir, "../../db/migrations");

await db().unsafe(`
  create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());
  alter table schema_migrations enable row level security;`);

const applied = new Set((await db()`select name from schema_migrations`).map((r: { name: string }) => r.name));
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const pending = files.filter((f) => !applied.has(f));

if (pending.length === 0) console.log("Banco já está atualizado.");

for (const file of pending) {
  const content = await Bun.file(join(dir, file)).text();
  await db().begin(async (tx) => {
    await tx.unsafe(content);
    await tx`insert into schema_migrations (name) values (${file})`;
  });
  console.log(`✓ ${file}`);
}

await closeDb();
