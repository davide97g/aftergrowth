/**
 * Production server: serves the built game from dist/, accounts and saves on /api, the island hub on /net.
 * Usage: npm run build && npm start   (PORT, DATA env vars optional)
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { attachHub } from "./hub.ts";

const root = join(import.meta.dirname, "..", "dist");
const port = Number(process.env.PORT ?? 8787);
const TYPES: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
};

let api: Awaited<ReturnType<typeof attachHub>> | null = null;
const http = createServer(async (req, res) => {
  if (api && (await api(req, res))) return;
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
api = await attachHub(http, process.env.DATA ?? join(import.meta.dirname, "..", "data", "world.json"));
http.listen(port, () => console.log(`Aftergrowth on http://localhost:${port}`));
