# Deploying Aftergrowth

Aftergrowth runs on the homelab mini PC at **https://aftergrowth.davideghiotto.it**. The page, the
models and the island hub (WebSocket on `/net`) all come from one container.

## How it's wired

| Layer | Setting |
|---|---|
| Dokploy | project `aftergrowth`, compose app `aftergrowth-wxf9t7`, repo `davide97g/aftergrowth`, branch `main`, compose path `./deploy/compose.yml`, auto-deploy **off** |
| Container | `deploy/Dockerfile`: builds, runs `npm run check`, bundles, then runs `node server/index.ts` as `node` on `:8787` |
| Data | named volume `aftergrowth-data` at `/data`. `aftergrowth.db` (SQLite) holds accounts, sessions, saves, friends and portals; `world.json` the island snapshots, deeds and stall listings; `auth-secret` signs sessions (made on first start unless `BETTER_AUTH_SECRET` is set) |
| Accounts | Better Auth, email and password, no verification. `BETTER_AUTH_URL` in `compose.yml` must be the public URL |
| Traefik | Dokploy domain `aftergrowth.davideghiotto.it` → service `aftergrowth`, port 8787, `https: false` (Cloudflare terminates TLS) |
| Tunnel | `aftergrowth.davideghiotto.it` → `http://localhost:80`; `deploy-aftergrowth.davideghiotto.it` with path `api/compose\.(deploy\|one)` → `http://localhost:3000` |
| DNS | both names are proxied CNAMEs to the tunnel |

## Releasing

Push to `main`. `.github/workflows/ci.yml` typechecks, tests, builds and checks the compose file, then
asks Dokploy to deploy through `deploy-aftergrowth` and waits for its verdict. Each deployment is
titled with its commit. The repository secrets are `DOKPLOY_URL`
(`https://deploy-aftergrowth.davideghiotto.it`), `DOKPLOY_API_KEY` and `DOKPLOY_COMPOSE_ID`. Without
them the deploy job skips itself.

By hand, with the homelab `.env` loaded:

```sh
echo '{"composeId":"IFm8WNBMcT1x_weyuWZeR"}' | dk POST compose.deploy
```

## Checking it

```sh
ssh homelab 'docker ps --filter name=aftergrowth; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: aftergrowth.davideghiotto.it" http://localhost/'
```

## Backing up

The volume is the only state. Copy it out with a throwaway container (the database through SQLite's
own backup, so a write in progress can't tear it):

```sh
ssh homelab 'mkdir -p ~/backups/aftergrowth && d=$(date +%Y%m%d) &&
  docker run --rm -v aftergrowth-data:/v alpine cat /v/world.json > ~/backups/aftergrowth/world-$d.json &&
  docker run --rm -v aftergrowth-data:/v -v ~/backups/aftergrowth:/b alpine sh -c "apk add -q sqlite && sqlite3 /v/aftergrowth.db \".backup /b/aftergrowth-$d.db\" && cp /v/auth-secret /b/auth-secret"'
```

Losing `auth-secret` only signs everyone out; losing `aftergrowth.db` loses every account and save.
