import { stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Context } from "hono";

// Entrega os arquivos do site compilado. Caminhos que não são arquivo caem no index.html,
// porque as rotas (/produtos/..., /carrinho) são resolvidas no navegador.
export function serveSite(dir: string) {
  const root = resolve(dir);
  const index = join(root, "index.html");

  return async (c: Context) => {
    const path = decodeURIComponent(new URL(c.req.url).pathname);
    if (path.startsWith("/api/")) return c.notFound();

    const target = resolve(root, `.${path}`);
    if (target.startsWith(root + sep) && (await isFile(target))) {
      return new Response(Bun.file(target), { headers: { "Cache-Control": "public, max-age=86400" } });
    }
    return new Response(Bun.file(index), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
  };
}

async function isFile(path: string) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}
