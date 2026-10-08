import index from "./index.html";

// Servidor do site: entrega o React (com reload em dev) e repassa /api para o backend.
const API_URL = process.env.API_URL ?? "http://localhost:3333";
const PORT = Number(process.env.PORT ?? 5173);
const isDev = process.env.NODE_ENV !== "production";

async function proxy(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const headers = new Headers(req.headers);
  headers.delete("host");
  try {
    return await fetch(API_URL + url.pathname + url.search, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
    });
  } catch {
    return Response.json(
      { error: { code: "api_offline", message: `API fora do ar em ${API_URL} — rode "bun run dev" em backend/` } },
      { status: 502 },
    );
  }
}

const server = Bun.serve({
  port: PORT,
  development: isDev && { hmr: true, console: true },
  routes: {
    "/api/*": proxy,
    "/images/*": (req) => {
      const path = decodeURIComponent(new URL(req.url).pathname);
      if (path.includes("..")) return new Response("Not found", { status: 404 });
      const file = Bun.file(`${import.meta.dir}/public${path}`);
      return file.size ? new Response(file, { headers: { "Cache-Control": "public, max-age=86400" } }) : new Response("Not found", { status: 404 });
    },
    "/*": index,
  },
});

console.log(`Site Encantos da Serra em http://localhost:${server.port} (API: ${API_URL})`);
