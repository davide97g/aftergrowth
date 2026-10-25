/**
 * Accounts: Better Auth (email and password, no verification) on SQLite, and the game's own tables
 * in the same database: profiles (hat, island theme, friend code), saves, friendships and portals.
 */
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { type FriendEntry, HAT_STYLES, type HatStyle, type Profile, type Theme } from "../shared/protocol.ts";

export const THEMES: Theme[] = ["meadow", "blossom", "autumn", "mint"];
export const COLORS = ["#4a5bb5", "#7db65a", "#e07a9a", "#e0a84a", "#5aa7c8", "#9a6ad0"];
/** a save larger than this is refused (a full island layout is ~40 KB) */
const MAX_SAVE = 300_000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface GameProfile extends Profile { theme: Theme; code: string }

const pick = <T,>(xs: T[]) => xs[randomInt(xs.length)];
export const isColor = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);

/** The secret signs sessions: from the environment, or made once and kept next to the data. */
function secret(dir: string) {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const file = join(dir, "auth-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const s = randomBytes(32).toString("base64url");
  writeFileSync(file, s, { mode: 0o600 });
  return s;
}

export type Accounts = Awaited<ReturnType<typeof openAccounts>>;

export async function openAccounts(dbFile: string) {
  mkdirSync(dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  const options = {
    appName: "Aftergrowth",
    database: db,
    secret: secret(dirname(dbFile)),
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:5173",
    // the page and the auth routes share one host (the dev server, or the tunnel in production)
    trustedOrigins: (req) => {
      const host = req?.headers.get("host");
      return host ? [`http://${host}`, `https://${host}`] : [];
    },
    emailAndPassword: { enabled: true, requireEmailVerification: false, autoSignIn: true, minPasswordLength: 8 },
    session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
    telemetry: { enabled: false },
    // sign-in rate limits per player: Cloudflare's tunnel tells us who is asking
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] } },
  } satisfies BetterAuthOptions;
  // Better Auth's own tables (user, session, account, verification), made or updated before it starts
  await (await getMigrations(options)).runMigrations();
  const auth = betterAuth(options);

  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
      color TEXT NOT NULL, hat TEXT NOT NULL, theme TEXT NOT NULL, code TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS save (
      user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
      data TEXT NOT NULL, updated INTEGER NOT NULL
    );
    -- one row per pair, a < b; accepted = 0 while the request waits for the other witch
    CREATE TABLE IF NOT EXISTS friend (
      a TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      b TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      asked_by TEXT NOT NULL, accepted INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL,
      PRIMARY KEY (a, b)
    );
    -- the owner's portal is open to the guest: the guest may visit the owner's island
    CREATE TABLE IF NOT EXISTS portal (
      owner TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      guest TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      PRIMARY KEY (owner, guest)
    );
  `);

  const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);
  const q = {
    user: db.prepare("SELECT id, name, email FROM user WHERE id = ?"),
    profile: db.prepare("SELECT color, hat, theme, code FROM profile WHERE user_id = ?"),
    byCode: db.prepare("SELECT user_id FROM profile WHERE code = ?"),
    newProfile: db.prepare("INSERT INTO profile (user_id, color, hat, theme, code) VALUES (?, ?, ?, ?, ?)"),
    setProfile: db.prepare("UPDATE profile SET color = ?, hat = ?, theme = ? WHERE user_id = ?"),
    save: db.prepare("SELECT data, updated FROM save WHERE user_id = ?"),
    putSave: db.prepare("INSERT INTO save (user_id, data, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated = excluded.updated"),
    dropSave: db.prepare("DELETE FROM save WHERE user_id = ?"),
    friendship: db.prepare("SELECT asked_by, accepted FROM friend WHERE a = ? AND b = ?"),
    ask: db.prepare("INSERT INTO friend (a, b, asked_by, accepted, at) VALUES (?, ?, ?, 0, ?)"),
    accept: db.prepare("UPDATE friend SET accepted = 1 WHERE a = ? AND b = ?"),
    unfriend: db.prepare("DELETE FROM friend WHERE a = ? AND b = ?"),
    friendsOf: db.prepare(`
      SELECT f.a, f.b, f.asked_by, f.accepted, u.id, u.name, p.color, p.hat, p.theme
      FROM friend f JOIN user u ON u.id = (CASE WHEN f.a = ? THEN f.b ELSE f.a END) JOIN profile p ON p.user_id = u.id
      WHERE f.a = ? OR f.b = ? ORDER BY u.name`),
    open: db.prepare("INSERT OR IGNORE INTO portal (owner, guest) VALUES (?, ?)"),
    close: db.prepare("DELETE FROM portal WHERE owner = ? AND guest = ?"),
    portal: db.prepare("SELECT 1 FROM portal WHERE owner = ? AND guest = ?"),
  };

  const newCode = () => {
    for (;;) {
      const code = Array.from({ length: 6 }, () => pick([...CODE_CHARS])).join("");
      if (!q.byCode.get(code)) return code;
    }
  };

  /** The witch behind an account; made on first use with a random hat colour and island theme. */
  function profile(userId: string): GameProfile | null {
    const u = q.user.get(userId) as { id: string; name: string } | undefined;
    if (!u) return null;
    let p = q.profile.get(userId) as { color: string; hat: string; theme: string; code: string } | undefined;
    if (!p) {
      p = { color: pick(COLORS), hat: "classic", theme: pick(THEMES), code: newCode() };
      q.newProfile.run(userId, p.color, p.hat, p.theme, p.code);
    }
    return { id: u.id, name: u.name, color: p.color, hat: p.hat as HatStyle, theme: p.theme as Theme, code: p.code };
  }

  return {
    auth,
    handler: toNodeHandler(auth),
    close: () => db.close(),

    /** The signed-in user of a request (its session cookie), or null. */
    async userOf(req: IncomingMessage): Promise<string | null> {
      const s = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
      return s?.user.id ?? null;
    },

    profile,

    /** Change name, hat colour, hat shape or island theme; anything invalid is ignored. */
    async updateProfile(userId: string, patch: { name?: unknown; color?: unknown; hat?: unknown; theme?: unknown }) {
      const p = profile(userId);
      if (!p) return null;
      const name = String(patch.name ?? "").replace(/[<>]/g, "").trim().slice(0, 24);
      if (name && name !== p.name) await (await auth.$context).internalAdapter.updateUser(userId, { name });
      q.setProfile.run(
        isColor(patch.color) ? patch.color : p.color,
        HAT_STYLES.includes(patch.hat as HatStyle) ? (patch.hat as HatStyle) : p.hat ?? "classic",
        THEMES.includes(patch.theme as Theme) ? (patch.theme as Theme) : p.theme,
        userId,
      );
      return profile(userId);
    },

    loadSave(userId: string) {
      return (q.save.get(userId) as { data: string; updated: number } | undefined) ?? null;
    },
    /** Store a save; false if it isn't JSON or is too big. */
    storeSave(userId: string, data: string) {
      if (data.length > MAX_SAVE) return false;
      try {
        if (typeof JSON.parse(data) !== "object") return false;
      } catch {
        return false;
      }
      const updated = Date.now();
      q.putSave.run(userId, data, updated);
      return updated;
    },
    dropSave(userId: string) {
      q.dropSave.run(userId);
    },

    // ---------- friends and portals ----------

    byCode(code: string) {
      return (q.byCode.get(code.toUpperCase().replace(/[^A-Z0-9]/g, "")) as { user_id: string } | undefined)?.user_id ?? null;
    },

    /**
     * Ask `to` to be friends. If they already asked you, you are friends now.
     * Returns what happened, for the toast.
     */
    befriend(from: string, to: string): "asked" | "friends" | "already" | "self" {
      if (from === to) return "self";
      const [a, b] = pair(from, to);
      const f = q.friendship.get(a, b) as { asked_by: string; accepted: number } | undefined;
      if (!f) {
        q.ask.run(a, b, from, Date.now());
        return "asked";
      }
      if (f.accepted || f.asked_by === from) return "already";
      q.accept.run(a, b);
      return "friends";
    },

    /** Unfriend, cancel a request or decline one; both portals close. */
    unfriend(x: string, y: string) {
      const [a, b] = pair(x, y);
      q.unfriend.run(a, b);
      q.close.run(x, y);
      q.close.run(y, x);
    },

    areFriends(x: string, y: string) {
      const [a, b] = pair(x, y);
      return !!(q.friendship.get(a, b) as { accepted: number } | undefined)?.accepted;
    },

    /** Open or close your portal to a friend. Only friends can be let in. */
    setPortal(owner: string, guest: string, open: boolean) {
      if (open && !this.areFriends(owner, guest)) return false;
      if (open) q.open.run(owner, guest);
      else q.close.run(owner, guest);
      return true;
    },

    /** May `guest` step through to `owner`'s island? */
    canVisit(guest: string, owner: string) {
      return guest === owner || !!q.portal.get(owner, guest);
    },

    /** Your friends and requests, with who opened which portal. `online` is filled in by the hub. */
    friends(userId: string): FriendEntry[] {
      const rows = q.friendsOf.all(userId, userId, userId) as { id: string; name: string; color: string; hat: string; theme: string; asked_by: string; accepted: number }[];
      return rows.map((r) => ({
        id: r.id, name: r.name, color: r.color, theme: r.theme as Theme,
        status: r.accepted ? "friend" : r.asked_by === userId ? "outgoing" : "incoming",
        open: !!q.portal.get(r.id, userId),
        mine: !!q.portal.get(userId, r.id),
        online: false,
      }));
    },
  };
}

/** Read a JSON or text body, at most `max` bytes. */
export function body(req: IncomingMessage, max: number): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        resolve(null);
        req.destroy();
      } else parts.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

export function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}
