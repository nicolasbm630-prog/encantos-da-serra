import type { Hono } from "hono";

// Página simples em "/" listando as rotas registradas — útil para explorar a API no navegador.
export function docsPage(app: Hono<any>): string {
  const seen = new Set<string>();
  const routes = app.routes
    .filter((r) => r.method !== "ALL" && r.path.startsWith("/api"))
    .filter((r) => {
      const key = `${r.method} ${r.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const groups = new Map<string, typeof routes>();
  for (const r of routes) {
    const group = r.path.split("/")[2] || "api";
    groups.set(group, [...(groups.get(group) ?? []), r]);
  }

  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const sections = [...groups.entries()]
    .map(
      ([group, items]) => `
      <section><h2>${esc(group)}</h2><ul>${items
        .map((r) => {
          const link = r.method === "GET" && !r.path.includes(":") ? `<a href="${esc(r.path)}">${esc(r.path)}</a>` : esc(r.path);
          return `<li><span class="m m-${r.method.toLowerCase()}">${r.method}</span><code>${link}</code></li>`;
        })
        .join("")}</ul></section>`,
    )
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Encantos da Serra API</title>
<style>
  :root { --bg:#f5f1ea; --card:#fffdf9; --ink:#23281f; --muted:#6b6f63; --green:#2f4a33; --line:#e4ddd0; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 ui-sans-serif, system-ui, sans-serif; }
  header { background:var(--green); color:#f5f1ea; padding:32px 16px; }
  header div, main { max-width:960px; margin:0 auto; }
  h1 { font-family: Georgia, serif; font-weight:500; margin:0 0 4px; font-size:28px; }
  header p { margin:0; opacity:.8; }
  header a { color:#e8cf7a; }
  main { padding:24px 16px 48px; display:grid; gap:16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); }
  section { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
  h2 { margin:0 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
  ul { list-style:none; margin:0; padding:0; }
  li { display:flex; gap:10px; align-items:baseline; padding:4px 0; border-top:1px solid var(--line); overflow-wrap:anywhere; }
  li:first-child { border-top:0; }
  code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
  a { color:var(--green); }
  .m { font: 600 11px ui-monospace, monospace; min-width:52px; text-align:center; padding:2px 6px; border-radius:6px; background:#e9efe6; color:var(--green); }
  .m-post { background:#f3e7c2; color:#6d5410; } .m-put, .m-patch { background:#e5e9f3; color:#2d3f6b; } .m-delete { background:#f3dcd8; color:#7a2c22; }
</style></head><body>
<header><div><h1>Encantos da Serra — API</h1>
<p>${routes.length} rotas · <a href="/health">/health</a> · respostas em JSON, valores em centavos</p></div></header>
<main>${sections}</main></body></html>`;
}
