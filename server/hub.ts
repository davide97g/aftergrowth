import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { type WebSocket, WebSocketServer } from "ws";
import type { AtlasEntry, ClientMsg, Deed, IslandSnap, Listing, Outline, Pose, Profile, ServerMsg } from "../shared/protocol.ts";
import { CROPS, STALL, isItem, stallBounds } from "../shared/items.ts";
import { FAMILIAR_KINDS, type FamiliarKind } from "../shared/familiars.ts";
import { HUB_ID, KINGDOM_ID, MARKET_ID, PHRASES } from "../shared/protocol.ts";
import { defaultHome, sanitizeLayout } from "../src/island/layout.ts";
import { type Accounts, THEMES, body, json, openAccounts } from "./accounts.ts";

const seedOf = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

interface Client { ws: WebSocket; profile: Profile; island: string | null; pose: Pose | null }
interface Stored { snap: IslandSnap; lastSeen: number; deeds: Deed[] }
/** `tokens` are the secret tokens of islands made before accounts, until someone claims them */
interface Store { islands: Record<string, Stored>; tokens: Record<string, string>; listings?: Listing[] }

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, max);
/** islands everyone may stand on */
const SHARED = new Set([HUB_ID, MARKET_ID, KINGDOM_ID]);
const SHARED_ATLAS: Omit<AtlasEntry, "here" | "lastSeen">[] = [
  { id: KINGDOM_ID, name: "Aetherhold", color: "#8a6ad8", theme: "meadow", online: true },
  { id: MARKET_ID, name: "Lantern Market", color: "#ffc94d", theme: "meadow", online: true },
  { id: HUB_ID, name: "Blossom Commons", color: "#f28cc0", theme: "blossom", online: true },
];

const outlineOf = (snap: IslandSnap): Outline | undefined => {
  const l = snap.layout as { shape?: string; size?: number; seed?: number } | undefined;
  return l && typeof l.shape === "string" ? { shape: l.shape, size: Number(l.size) || 1, seed: Number(l.seed) || 0 } : undefined;
};

/**
 * The island server: accounts and saves over HTTP, and one WebSocket room per island. Live: poses,
 * phrases, spells. Async: snapshots of each island, and deeds (watering, gifts) kept for owners who
 * are away. Islands are private: only friends the owner opened their portal to may visit.
 *
 * Returns the HTTP handler for /api; it answers false for anything else.
 */
export async function attachHub(http: Server, file: string) {
  const accounts: Accounts = await openAccounts(process.env.AUTH_DB ?? join(dirname(file), "aftergrowth.db"));
  let store: Store = { islands: {}, tokens: {} };
  try {
    store = JSON.parse(readFileSync(file, "utf8")) as Store;
  } catch {
    // first run
  }
  store.tokens ??= {};
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
  /** the dev server closed this hub to start a new one */
  let stopped = false;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  http.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/net") || stopped) return;
    // only signed-in witches: the session cookie comes with the upgrade
    void accounts.userOf(req).then((user) => {
      const profile = user && accounts.profile(user);
      if (!profile) {
        socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => welcome(ws, profile));
    });
  });

  const send = (c: Client, m: ServerMsg) => c.ws.readyState === 1 && c.ws.send(JSON.stringify(m));
  const room = (island: string | null, except?: Client) => [...clients].filter((c) => c.island === island && c !== except);
  const ownerOnline = (id: string) => [...clients].some((c) => c.profile.id === id);
  const connectionsOf = (id: string) => [...clients].filter((c) => c.profile.id === id);

  const leaveRoom = (c: Client) => {
    if (!c.island) return;
    for (const o of room(c.island, c)) send(o, { t: "left", id: c.profile.id });
    c.island = null;
  };

  /** Tell a witch (every open tab) who their friends are now. */
  const showFriends = (id: string, note?: string) => {
    const conns = connectionsOf(id);
    if (!conns.length) return;
    const friends = accounts.friends(id).map((f) => ({ ...f, online: ownerOnline(f.id) }));
    for (const c of conns) send(c, { t: "friends", friends, ...(note ? { note } : {}) });
  };

  // deeds are kept until the owner acknowledges them, so a half-closed socket never loses a gift
  // owners skip deeds no newer than the last one they applied, so every deed gets its own time
  let lastDeed = 0;
  const deliver = (owner: string, deed: Deed) => {
    deed.at = lastDeed = Math.max(Date.now(), lastDeed + 1);
    const st = store.islands[owner];
    if (st) st.deeds = [...st.deeds, deed].slice(-60);
    // every open connection of the owner (a reload can leave an old one behind for a moment)
    for (const c of connectionsOf(owner)) send(c, { t: "deed", deed });
  };

  /** Saves and the profile over HTTP; Better Auth answers everything under /api/auth. */
  const api = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = req.url ?? "";
    if (url.startsWith("/api/auth")) {
      await accounts.handler(req, res);
      return true;
    }
    if (!url.startsWith("/api/")) return false;
    const user = await accounts.userOf(req);
    if (!user) return (json(res, 401, { error: "Sign in first." }), true);
    const path = url.split("?")[0];
    if (path === "/api/me" && req.method === "GET") {
      const save = accounts.loadSave(user);
      json(res, 200, { profile: accounts.profile(user), save: save ? JSON.parse(save.data) : null, updated: save?.updated ?? 0 });
    } else if (path === "/api/save" && req.method === "PUT") {
      const data = await body(req, 400_000);
      const updated = data && accounts.storeSave(user, data);
      if (updated) json(res, 200, { updated });
      else json(res, 400, { error: "That save could not be kept." });
    } else if (path === "/api/save" && req.method === "DELETE") {
      accounts.dropSave(user);
      json(res, 200, { ok: true });
    } else json(res, 404, { error: "Nothing here." });
    return true;
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
  http.on("close", () => {
    stopped = true;
    clearInterval(expiry);
    for (const c of clients) c.ws.terminate();
    wss.close();
    accounts.close();
  });
  let nextListing = Date.now();

  const welcome = (ws: WebSocket, profile: NonNullable<ReturnType<Accounts["profile"]>>) => {
    const c: Client = { ws, profile: { id: profile.id, name: profile.name, color: profile.color, hat: profile.hat }, island: null, pose: null };
    clients.add(c);
    const st = store.islands[profile.id];
    send(c, { t: "welcome", profile, deeds: st?.deeds ?? [] });
    if (st) st.lastSeen = Date.now();
    persist();
    // friends see you come online
    for (const f of accounts.friends(profile.id)) showFriends(f.id);
    showFriends(profile.id);
    ws.on("message", (raw) => {
      if (stopped) return;
      let m: ClientMsg;
      try {
        m = JSON.parse(String(raw)) as ClientMsg;
      } catch {
        return;
      }
      const me = c.profile;
      switch (m.t) {
        case "enter": {
          if (typeof m.island !== "string") return;
          // someone's island: only with their portal open to you
          if (!SHARED.has(m.island) && !accounts.canVisit(me.id, m.island)) return send(c, { t: "island", island: null });
          leaveRoom(c);
          c.island = m.island;
          c.pose = null;
          send(c, { t: "peers", peers: room(c.island, c).map((o) => ({ profile: o.profile!, pose: o.pose })) });
          for (const o of room(c.island, c)) send(o, { t: "joined", profile: me });
          if (m.island !== me.id && !SHARED.has(m.island)) send(c, { t: "island", island: store.islands[m.island]?.snap ?? null });
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
            ...s, name: me.name, color: me.color, theme: THEMES.includes(s.theme) ? s.theme : "meadow", updated: Date.now(),
            layout: s.layout ? sanitizeLayout(s.layout, defaultHome(seedOf(me.id))) : undefined,
            familiar: FAMILIAR_KINDS.includes(s.familiar?.kind as FamiliarKind) && typeof s.familiar?.name === "string"
              ? { kind: s.familiar.kind, name: s.familiar.name.slice(0, 24) } : undefined,
          };
          const prev = store.islands[me.id];
          store.islands[me.id] = { snap, lastSeen: Date.now(), deeds: prev?.deeds ?? [] };
          for (const o of room(me.id, c)) send(o, { t: "island", island: snap });
          persist();
          return;
        }
        case "atlas": {
          const shared: AtlasEntry[] = SHARED_ATLAS.map((e) => ({ ...e, here: room(e.id).length, lastSeen: Date.now() }));
          const own = store.islands[me.id];
          const mine: AtlasEntry[] = own ? [{ id: me.id, name: me.name, color: me.color, theme: own.snap.theme, online: true, here: room(me.id).length, lastSeen: Date.now(), outline: outlineOf(own.snap) }] : [];
          const friends: AtlasEntry[] = accounts.friends(me.id).filter((f) => f.open && store.islands[f.id]).map((f) => {
            const { snap, lastSeen } = store.islands[f.id];
            return { id: f.id, name: f.name, color: f.color, theme: snap.theme, online: ownerOnline(f.id), here: room(f.id).length, lastSeen, outline: outlineOf(snap) };
          });
          send(c, { t: "atlas", islands: [...shared, ...mine, ...friends] });
          return;
        }
        case "profile": {
          void accounts.updateProfile(me.id, m).then((p) => {
            if (!p) return;
            for (const o of connectionsOf(me.id)) o.profile = { id: p.id, name: p.name, color: p.color, hat: p.hat };
            const st = store.islands[me.id];
            if (st) Object.assign(st.snap, { name: p.name, color: p.color, theme: p.theme });
            persist();
            for (const f of accounts.friends(me.id)) showFriends(f.id);
          });
          return;
        }
        case "claim": {
          // an island from before accounts: its token proves it was made in this browser
          if (typeof m.id !== "string" || !store.tokens[m.id] || store.tokens[m.id] !== m.token || store.islands[me.id]) return;
          const old = store.islands[m.id];
          if (old) store.islands[me.id] = { ...old, snap: { ...old.snap, id: me.id, name: me.name, color: me.color } };
          delete store.islands[m.id];
          delete store.tokens[m.id];
          for (const l of listings()) if (l.seller === m.id) Object.assign(l, { seller: me.id, name: me.name, color: me.color });
          persist();
          return;
        }
        case "friends": {
          showFriends(me.id);
          return;
        }
        case "befriend": {
          // by code, someone standing on the same island right now, or answering their request
          const nearby = c.island && room(c.island, c).some((o) => o.profile.id === m.id);
          const asked = accounts.friends(me.id).some((f) => f.id === m.id && f.status === "incoming");
          const to = typeof m.code === "string" ? accounts.byCode(m.code) : typeof m.id === "string" && (nearby || asked) ? m.id : null;
          if (!to) return showFriends(me.id, typeof m.code === "string" ? "No witch has that friend code." : "They have left this island.");
          const r = accounts.befriend(me.id, to);
          const them = accounts.profile(to)!.name;
          showFriends(me.id, r === "self" ? "That's your own code." : r === "asked" ? `Asked ${them} to be friends.` : r === "friends" ? `You and ${them} are friends now.` : `You and ${them} already know each other.`);
          if (r === "asked" || r === "friends") showFriends(to, r === "asked" ? `${me.name} would like to be friends.` : `${me.name} accepted: you are friends now.`);
          return;
        }
        case "unfriend": {
          if (typeof m.id !== "string") return;
          accounts.unfriend(me.id, m.id);
          kick(me.id, m.id);
          kick(m.id, me.id);
          showFriends(me.id);
          showFriends(m.id);
          return;
        }
        case "portal": {
          if (typeof m.id !== "string" || !accounts.setPortal(me.id, m.id, !!m.open)) return;
          if (!m.open) kick(me.id, m.id);
          showFriends(me.id);
          showFriends(m.id, m.open ? `${me.name} opened their portal to you.` : undefined);
          return;
        }
        case "water": {
          const st = store.islands[m.island];
          if (!st || m.island === me.id || !accounts.canVisit(me.id, m.island) || !Array.isArray(m.plots)) return;
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
          if (!store.islands[m.island] || m.island === me.id || !accounts.canVisit(me.id, m.island)) return;
          const g = m.gift;
          const gift = g?.kind === "flower" ? { from: me.name, kind: "flower" as const, color: clean(g.color, 12) } : g?.kind === "crop" ? { from: me.name, kind: "crop" as const, crop: clean(g.crop, 12) } : null;
          if (!gift) return;
          deliver(m.island, { by: me.name, kind: "gift", gift, at: Date.now() });
          persist();
          return;
        }
        case "feed": {
          if (!store.islands[m.island] || m.island === me.id || !accounts.canVisit(me.id, m.island) || !(m.crop in CROPS)) return;
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
      clients.delete(c);
      if (stopped) return;
      leaveRoom(c);
      const id = c.profile.id;
      if (store.islands[id]) {
        store.islands[id].lastSeen = Date.now();
        persist();
      }
      if (!ownerOnline(id)) for (const f of accounts.friends(id)) showFriends(f.id);
    });
  };

  /** Send a guest home from an island whose portal just closed to them. */
  const kick = (owner: string, guest: string) => {
    for (const c of connectionsOf(guest)) if (c.island === owner) send(c, { t: "closed", island: owner });
  };

  return api;
}
