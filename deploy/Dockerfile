# Aftergrowth: the built game and the island hub on one port.
# Build stage: install everything, typecheck, test, bundle.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run check && npm run build

# Run stage: the bundle, the server (TypeScript, run directly by Node) and what it imports.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA=/data/world.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY src/island ./src/island
# the hub saves islands, deeds and stalls here; owned by node so a fresh volume is writable
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8787/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/index.ts"]
