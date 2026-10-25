import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { dirname } from "node:path";
import { type WebSocket, WebSocketServer } from "ws";
import type { AtlasEntry, ClientMsg, Deed, IslandSnap, Listing, Pose, Profile, ServerMsg } from "../shared/protocol.ts";
import { CROPS, STALL, isItem, stallBounds } from "../shared/items.ts";
import { HAT_STYLES, HUB_ID, MARKET_ID, PHRASES } from "../shared/protocol.ts";
import { defaultHome, sanitizeLayout } from "../src/island/layout.ts";

const seedOf = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

interface Client { ws: WebSocket; profile: Profile | null; island: string | null; pose: Pose | null }
interface Stored { snap: IslandSnap; lastSeen: number; deeds: Deed[] }
interface Store { islands: Record<string, Stored>; tokens: Record<string, string>; listings?: Listing[] }

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
  // owners skip deeds no newer than the last one they applied, so every deed gets its own time
  let lastDeed = 0;
  const deliver = (owner: string, deed: Deed) => {
    deed.at = lastDeed = Math.max(Date.now(), lastDeed + 1);
    const st = store.islands[owner];
    if (st) st.deeds = [...st.deeds, deed].slice(-60);
    // every open connection of the owner (a reload can leave an old one behind for a moment)
    for (const c of clients) if (c.profile?.id === owner) send(c, { t: "deed", deed });
  };

  // ---------- stalls: the server holds listed goods, so they can't be spent twice ----------
  const listings = () => (store.listings ??= []);
  const showListings = () => {
    for (const o of room(MARKET_ID)) send(o, { t: "listings", listings: listings() });
  };
  /** Three days on, unsold goods go home to their seller. */
  const expire = () => {
    const cutoff = Date.now() - STALL.days * 86_400_000;
    const old = listings().filter((l) => l.at < cutoff);
    if (!old.length) return;
    store.listings = listings().filter((l) => l.at >= cutoff);
    for (const l of old) deliver(l.seller, { by: "the market", kind: "return", item: l.item, qty: l.qty, at: Date.now() });
    persist();
    showListings();
  };
  const expiry = setInterval(expire, 10 * 60_000);
  expiry.unref();
  // the dev server restarts the hub when its code changes: the old one must stop writing
  http.on("close", () => clearInterval(expiry));
  let nextListing = Date.now();

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
        c.profile = { id: p.id, name: clean(p.name, 24) || "Witch", color: isColor(p.color) ? p.color : "#4a5bb5", hat: HAT_STYLES.includes(p.hat!) ? p.hat : "classic" };
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
        case "feed": {
          if (!store.islands[m.island] || m.island === me.id || !(m.crop in CROPS)) return;
          deliver(m.island, { by: me.name, kind: "feed", trough: clean(m.trough, 48), crop: m.crop, at: Date.now() });
          persist();
          return;
        }
        case "listings": {
          expire();
          send(c, { t: "listings", listings: listings() });
          return;
        }
        case "list": {
          const qty = Number(m.qty);
          const price = Number(m.price);
          const no = (why: string) => send(c, { t: "listed", ok: false, item: String(m.item), qty: Number.isInteger(qty) ? qty : 0, why });
          if (!isItem(m.item)) return;
          const b = stallBounds(m.item);
          if (!Number.isInteger(qty) || qty < 1 || qty > STALL.maxQty) return no(`List 1 to ${STALL.maxQty} at a time.`);
          if (!Number.isInteger(price) || price < b.min || price > b.max) return no(`Ask between ${b.min}c and ${b.max}c for one.`);
          if (!store.islands[me.id]) return no("Visit your own island once first, so payments can find you.");
          if (listings().filter((l) => l.seller === me.id).length >= STALL.slots) return no(`A stall holds ${STALL.slots} listings.`);
          const l: Listing = { id: (nextListing++).toString(36), seller: me.id, name: me.name, color: me.color, item: m.item, qty, price, at: Date.now() };
          listings().push(l);
          send(c, { t: "listed", ok: true, item: l.item, qty });
          persist();
          showListings();
          return;
        }
        case "unlist": {
          const l = listings().find((x) => x.id === m.id && x.seller === me.id);
          if (!l) return;
          store.listings = listings().filter((x) => x !== l);
          deliver(me.id, { by: "your stall", kind: "return", item: l.item, qty: l.qty, at: Date.now() });
          persist();
          showListings();
          return;
        }
        case "buy": {
          const l = listings().find((x) => x.id === m.id);
          const qty = Number(m.qty);
          const no = (why: string) => send(c, { t: "bought", ok: false, id: String(m.id), item: l?.item ?? "", qty: Number.isInteger(qty) ? qty : 0, price: l?.price ?? 0, why });
          if (!l) return no("Someone was quicker: that's gone.");
          if (l.seller === me.id) return no("That's your own stall.");
          if (!Number.isInteger(qty) || qty < 1 || qty > l.qty) return no(`Only ${l.qty} left.`);
          // the listing shrinks before anyone is told, so two buyers can never get the same goods
          l.qty -= qty;
          if (!l.qty) store.listings = listings().filter((x) => x !== l);
          send(c, { t: "bought", ok: true, id: l.id, item: l.item, qty, price: l.price });
          deliver(l.seller, { by: me.name, kind: "sale", item: l.item, qty, coins: qty * l.price, at: Date.now() });
          persist();
          showListings();
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
