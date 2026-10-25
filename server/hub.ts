import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { dirname } from "node:path";
import { type WebSocket, WebSocketServer } from "ws";
import type { AtlasEntry, ClientMsg, Deed, IslandSnap, Pose, Profile, ServerMsg } from "../shared/protocol.ts";
import { HUB_ID, MARKET_ID, PHRASES } from "../shared/protocol.ts";
import { defaultHome, sanitizeLayout } from "../src/island/layout.ts";

const seedOf = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

interface Client { ws: WebSocket; profile: Profile | null; island: string | null; pose: Pose | null }
interface Stored { snap: IslandSnap; lastSeen: number; deeds: Deed[] }
interface Store { islands: Record<string, Stored>; tokens: Record<string, string> }

const THEMES = new Set(["meadow", "blossom", "autumn", "mint"]);
const clean = (s: unknown, max: number) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, max);
const isColor = (c: unknown) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
const isId = (id: unknown) => typeof id === "string" && /^[a-z0-9-]{4,40}$/.test(id);

/**
 * The island server: one room per island. Live: poses, phrases, spells. Async: snapshots of each
 * island, and deeds (watering, gifts) kept for owners who are away.
 */
export function attachHub(http: Server, file: string) {
  let store: Store = { islands: {}, tokens: {} };
  try {
    store = JSON.parse(readFileSync(file, "utf8")) as Store;
  } catch {
    // first run
  }
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const persist = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(store));
    }, 1500);
  };

  const clients = new Set<Client>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  http.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/net")) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });

  const send = (c: Client, m: ServerMsg) => c.ws.readyState === 1 && c.ws.send(JSON.stringify(m));
  const room = (island: string | null, except?: Client) => [...clients].filter((c) => c.island === island && c !== except && c.profile);
  const ownerOnline = (id: string) => [...clients].find((c) => c.profile?.id === id);

  const leaveRoom = (c: Client) => {
    if (!c.island || !c.profile) return;
    for (const o of room(c.island, c)) send(o, { t: "left", id: c.profile.id });
    c.island = null;
  };

  // deeds are kept until the owner acknowledges them, so a half-closed socket never loses a gift
  const deliver = (owner: string, deed: Deed) => {
    const st = store.islands[owner];
    if (st) st.deeds = [...st.deeds, deed].slice(-60);
    const live = ownerOnline(owner);
    if (live) send(live, { t: "deed", deed });
  };

  wss.on("connection", (ws) => {
    const c: Client = { ws, profile: null, island: null, pose: null };
    clients.add(c);
    ws.on("message", (raw) => {
      let m: ClientMsg;
      try {
        m = JSON.parse(String(raw)) as ClientMsg;
      } catch {
        return;
      }
      if (m.t === "hello") {
        const p = m.profile;
        if (!isId(p?.id) || typeof m.token !== "string" || m.token.length < 16) return ws.close();
        const known = store.tokens[p.id];
        if (known && known !== m.token) return ws.close(4001, "token");
        store.tokens[p.id] = m.token;
        c.profile = { id: p.id, name: clean(p.name, 24) || "Witch", color: isColor(p.color) ? p.color : "#4a5bb5" };
        const st = store.islands[p.id];
        send(c, { t: "welcome", deeds: st?.deeds ?? [] });
        if (st) st.lastSeen = Date.now();
        persist();
        return;
      }
      if (!c.profile) return;
      const me = c.profile;
      switch (m.t) {
        case "enter": {
          if (typeof m.island !== "string") return;
          leaveRoom(c);
          c.island = m.island;
          c.pose = null;
          send(c, { t: "peers", peers: room(c.island, c).map((o) => ({ profile: o.profile!, pose: o.pose })) });
          for (const o of room(c.island, c)) send(o, { t: "joined", profile: me });
          if (m.island !== me.id && m.island !== HUB_ID && m.island !== MARKET_ID) send(c, { t: "island", island: store.islands[m.island]?.snap ?? null });
          return;
        }
        case "pose": {
          c.pose = m.pose;
          for (const o of room(c.island, c)) send(o, { t: "pose", id: me.id, pose: m.pose });
          return;
        }
        case "publish": {
          const s = m.island;
          if (s?.id !== me.id || !Array.isArray(s.plots) || s.plots.length > 32 || !Array.isArray(s.stones) || s.stones.length > 8) return;
          const size = JSON.stringify(s).length;
          if (size > 400_000) return;
          const snap: IslandSnap = {
            ...s, name: me.name, color: me.color, theme: THEMES.has(s.theme) ? s.theme : "meadow", updated: Date.now(),
            layout: s.layout ? sanitizeLayout(s.layout, defaultHome(seedOf(me.id))) : undefined,
          };
          const prev = store.islands[me.id];
          store.islands[me.id] = { snap, lastSeen: Date.now(), deeds: prev?.deeds ?? [] };
          for (const o of room(me.id, c)) send(o, { t: "island", island: snap });
          persist();
          return;
        }
        case "atlas": {
          const entries: AtlasEntry[] = Object.values(store.islands).map(({ snap, lastSeen }) => ({
            id: snap.id, name: snap.name, color: snap.color, theme: snap.theme,
            online: !!ownerOnline(snap.id), here: room(snap.id).length, lastSeen,
          }));
          entries.sort((a, b) => Number(b.online) - Number(a.online) || b.here - a.here || b.lastSeen - a.lastSeen);
          const hub: AtlasEntry = { id: HUB_ID, name: "Blossom Commons", color: "#f28cc0", theme: "blossom", online: true, here: room(HUB_ID).length, lastSeen: Date.now() };
          const market: AtlasEntry = { id: MARKET_ID, name: "Lantern Market", color: "#ffc94d", theme: "meadow", online: true, here: room(MARKET_ID).length, lastSeen: Date.now() };
          send(c, { t: "atlas", islands: [hub, market, ...entries.slice(0, 60)] });
          return;
        }
        case "water": {
          const st = store.islands[m.island];
          if (!st || m.island === me.id || !Array.isArray(m.plots)) return;
          for (const i of m.plots.slice(0, 32)) {
            const plot = st.snap.plots[i];
            if (!plot || !plot.crop) continue;
            plot.wet = 10;
            const deed: Deed = { by: me.name, kind: "water", plot: i, at: Date.now() };
            deliver(m.island, deed);
            for (const o of room(m.island)) send(o, { t: "deed", deed });
          }
          persist();
          return;
        }
        case "gift": {
          if (!store.islands[m.island] || m.island === me.id) return;
          const g = m.gift;
          const gift = g?.kind === "flower" ? { from: me.name, kind: "flower" as const, color: clean(g.color, 12) } : g?.kind === "crop" ? { from: me.name, kind: "crop" as const, crop: clean(g.crop, 12) } : null;
          if (!gift) return;
          deliver(m.island, { by: me.name, kind: "gift", gift, at: Date.now() });
          persist();
          return;
        }
        case "ack": {
          const st = store.islands[me.id];
          if (st && Number.isFinite(m.upTo)) st.deeds = st.deeds.filter((d) => d.at > m.upTo);
          persist();
          return;
        }
        case "say": {
          if (!Number.isInteger(m.phrase) || m.phrase < 0 || m.phrase >= PHRASES.length) return;
          for (const o of room(c.island, c)) send(o, { t: "say", id: me.id, phrase: m.phrase });
          return;
        }
        case "spell": {
          for (const o of room(c.island, c)) send(o, { t: "spell", id: me.id, spell: clean(m.spell, 16), x: +m.x || 0, z: +m.z || 0, power: Math.min(Math.max(+m.power || 1, 1), 4) });
          return;
        }
      }
    });
    ws.on("close", () => {
      leaveRoom(c);
      clients.delete(c);
      if (c.profile && store.islands[c.profile.id]) {
        store.islands[c.profile.id].lastSeen = Date.now();
        persist();
      }
    });
  });
}
