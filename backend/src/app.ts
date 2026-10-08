import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { config } from "./config";
import { db } from "./db";
import { AppError } from "./lib/errors";
import type { AppEnv } from "./lib/types";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { cartRoutes } from "./routes/cart";
import { catalogRoutes } from "./routes/catalog";
import { contactRoutes } from "./routes/contact";
import { deliveryRoutes } from "./routes/delivery";
import { homeRoutes } from "./routes/home";
import { meRoutes } from "./routes/me";
import { orderRoutes } from "./routes/orders";
import { proposalRoutes } from "./routes/proposals";
import { wholesaleRoutes } from "./routes/wholesale";
import { docsPage } from "./docs";

export function createApp() {
  const api = new Hono<AppEnv>()
    .route("/", homeRoutes)
    .route("/", catalogRoutes)
    .route("/auth", authRoutes)
    .route("/me", meRoutes)
    .route("/cart", cartRoutes)
    .route("/orders", orderRoutes)
    .route("/wholesale", wholesaleRoutes)
    .route("/delivery", deliveryRoutes)
    .route("/supplier-proposals", proposalRoutes)
    .route("/contact", contactRoutes)
    .route("/admin", adminRoutes);

  const app = new Hono<AppEnv>();

  app.use("*", secureHeaders());
  app.use(
    "/api/*",
    cors({
      origin: config().CORS_ORIGINS.split(",").map((o) => o.trim()),
      allowHeaders: ["Content-Type", "Authorization", "X-Edit-Token"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  // Limite geral de 11 MB (anexos de proposta vão até 10 MB).
  app.use("/api/*", bodyLimit({ maxSize: 11 * 1024 * 1024 }));
  if (process.env.NODE_ENV !== "test") app.use("*", logger());

  app.get("/health", async (c) => {
    const [row] = await db()`select now() as now`;
    return c.json({ status: "ok", database: "ok", time: row.now });
  });

  app.route("/api", api);
  app.get("/", (c) => c.html(docsPage(app)));

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Rota não encontrada" } }, 404));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
    }
    console.error(err);
    return c.json({ error: { code: "internal_error", message: "Erro interno" } }, 500);
  });

  return app;
}

export type ApiApp = ReturnType<typeof createApp>;
