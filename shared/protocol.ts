/** Messages between the game and the island server (JSON over one WebSocket). */

export type Theme = "meadow" | "blossom" | "autumn" | "mint";
export const HUB_ID = "commons";
/** the Lantern Market: shared like the commons, with shops */
export const MARKET_ID = "market";
/** Aetherhold, the royal city: the seat of magic and power, shared by everyone */
export const KINGDOM_ID = "kingdom";

export type HatStyle = "classic" | "wide" | "tall" | "crown";
export const HAT_STYLES: HatStyle[] = ["classic", "wide", "tall", "crown"];
export interface Profile { id: string; name: string; color: string; hat?: HatStyle }

export interface PlotSnap { crop: string | null; growth: number; wet: number; locked?: boolean }
export interface StoneSnap { spell: string; power: number; strokes: { x: number; y: number }[][] }

/** What a visitor needs to see someone's island. Published by the owner, kept by the server. */
export interface IslandSnap {
  id: string;
  name: string;
  color: string;
  theme: Theme;
  plots: PlotSnap[];
  stones: (StoneSnap | null)[];
  /** the island's shape and placed objects (see src/island/layout.ts) */
  layout?: unknown;
  updated: number;
}

/** An island's outline, enough to draw it on the world map (see src/island/shapes.ts). */
export interface Outline { shape: string; size: number; seed: number }

/** A place the portal can take you: the shared islands, and friends who opened their portal to you. */
export interface AtlasEntry {
  id: string;
  name: string;
  color: string;
  theme: Theme;
  online: boolean;
  /** players currently standing on it */
  here: number;
  lastSeen: number;
  outline?: Outline;
}

/** Someone you are friends with, or a request either way. */
export interface FriendEntry {
  id: string;
  name: string;
  color: string;
  theme: Theme;
  status: "friend" | "incoming" | "outgoing";
  /** they opened their portal to you: you can visit */
  open: boolean;
  /** you opened yours to them */
  mine: boolean;
  online: boolean;
}

export type Gift = { from: string; kind: "flower"; color: string } | { from: string; kind: "crop"; crop: string };

/** Goods on a witch's stall at the market, held by the server until sold, taken back or expired. */
export interface Listing {
  id: string;
  /** the seller's profile id, name and hat colour */
  seller: string;
  name: string;
  color: string;
  item: string;
  qty: number;
  /** coins for one */
  price: number;
  at: number;
}

/** Things a visitor did while the owner was away, delivered when the owner returns. */
export type Deed =
  | { by: string; kind: "water"; plot: number; at: number }
  | { by: string; kind: "gift"; gift: Gift; at: number }
  /** a visitor put a crop in one of your troughs */
  | { by: string; kind: "feed"; trough: string; crop: string; at: number }
  /** someone bought from your stall */
  | { by: string; kind: "sale"; item: string; qty: number; coins: number; at: number }
  /** goods back from your stall: taken down, or three days passed */
  | { by: string; kind: "return"; item: string; qty: number; at: number };

export interface Pose { x: number; z: number; yaw: number; speed: number; drawing: boolean }

export const PHRASES = ["Hello!", "What a lovely island!", "Thank you!", "Look at this!", "Good night!", "Let's farm!"] as const;

export type ClientMsg =
  /** change your name, hat colour, hat shape or island theme */
  | { t: "profile"; name?: string; color?: string; hat?: HatStyle; theme?: Theme }
  /** bring an island made before accounts (its old id and secret token) into your account */
  | { t: "claim"; id: string; token: string }
  | { t: "friends" }
  /** by friend code, or the id of a witch standing on the same island */
  | { t: "befriend"; code?: string; id?: string }
  | { t: "unfriend"; id: string }
  /** open or close your portal to a friend */
  | { t: "portal"; id: string; open: boolean }
  | { t: "enter"; island: string }
  | { t: "pose"; pose: Pose }
  | { t: "publish"; island: IslandSnap }
  | { t: "atlas" }
  | { t: "water"; island: string; plots: number[] }
  | { t: "gift"; island: string; gift: Gift }
  | { t: "feed"; island: string; trough: string; crop: string }
  | { t: "listings" }
  | { t: "list"; item: string; qty: number; price: number }
  | { t: "unlist"; id: string }
  | { t: "buy"; id: string; qty: number }
  | { t: "say"; phrase: number }
  | { t: "spell"; spell: string; x: number; z: number; power: number }
  /** the owner applied every deed up to this time; the server can forget them */
  | { t: "ack"; upTo: number };

export type ServerMsg =
  | { t: "welcome"; profile: Profile & { theme: Theme; code: string }; deeds: Deed[] }
  | { t: "friends"; friends: FriendEntry[]; note?: string }
  /** the owner closed their portal to you while you were on their island */
  | { t: "closed"; island: string }
  | { t: "listings"; listings: Listing[] }
  /** answer to `list`: on failure the goods go back to the seller's satchel */
  | { t: "listed"; ok: boolean; item: string; qty: number; why?: string }
  /** answer to `buy`: on success the goods are yours; on failure the coins come back */
  | { t: "bought"; ok: boolean; id: string; item: string; qty: number; price: number; why?: string }
  | { t: "atlas"; islands: AtlasEntry[] }
  | { t: "island"; island: IslandSnap | null }
  | { t: "peers"; peers: { profile: Profile; pose: Pose | null }[] }
  | { t: "pose"; id: string; pose: Pose }
  | { t: "joined"; profile: Profile }
  | { t: "left"; id: string }
  | { t: "deed"; deed: Deed }
  | { t: "say"; id: string; phrase: number }
  | { t: "spell"; id: string; spell: string; x: number; z: number; power: number };
