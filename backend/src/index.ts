import { createApp } from "./app";
import { config } from "./config";

const app = createApp();
const { PORT } = config();

const server = Bun.serve({ port: PORT, fetch: app.fetch, maxRequestBodySize: 11 * 1024 * 1024 });
console.log(`Encantos da Serra API em http://localhost:${server.port}`);
