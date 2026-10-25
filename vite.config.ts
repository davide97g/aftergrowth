import { join } from "node:path";
import { defineConfig } from "vite";
import { attachHub } from "./server/hub.ts";

export default defineConfig({
  server: { host: true, port: 5173 },
  plugins: [
    {
      // the island hub runs inside the dev server, so `npm run dev` is all you need
      name: "island-hub",
      configureServer(server) {
        if (server.httpServer) attachHub(server.httpServer as import("node:http").Server, join(import.meta.dirname, "data", "world.json"));
      },
    },
  ],
});
