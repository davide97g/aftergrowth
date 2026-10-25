/** Messages between the game and the island server (JSON over one WebSocket). */

export type Theme = "meadow" | "blossom" | "autumn" | "mint";
export const HUB_ID = "commons";

export interface Profile { id: string; name: string; color: string }

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

export interface AtlasEntry {
  id: string;
  name: string;
  color: string;
  theme: Theme;
  online: boolean;
  /** players currently standing on it */
  here: number;
  lastSeen: number;
}

export type Gift = { from: string; kind: "flower"; color: string } | { from: string; kind: "crop"; crop: string };

/** Things a visitor did while the owner was away, delivered when the owner returns. */
export type Deed = { by: string; kind: "water"; plot: number; at: number } | { by: string; kind: "gift"; gift: Gift; at: number };

export interface Pose { x: number; z: number; yaw: number; speed: number; drawing: boolean }

export const PHRASES = ["Hello!", "What a lovely island!", "Thank you!", "Look at this!", "Good night!", "Let's farm!"] as const;

export type ClientMsg =
  | { t: "hello"; profile: Profile; token: string }
  | { t: "enter"; island: string }
  | { t: "pose"; pose: Pose }
  | { t: "publish"; island: IslandSnap }
  | { t: "atlas" }
  | { t: "water"; island: string; plots: number[] }
  | { t: "gift"; island: string; gift: Gift }
  | { t: "say"; phrase: number }
  | { t: "spell"; spell: string; x: number; z: number; power: number }
  /** the owner applied every deed up to this time; the server can forget them */
  | { t: "ack"; upTo: number };

export type ServerMsg =
  | { t: "welcome"; deeds: Deed[] }
  | { t: "atlas"; islands: AtlasEntry[] }
  | { t: "island"; island: IslandSnap | null }
  | { t: "peers"; peers: { profile: Profile; pose: Pose | null }[] }
  | { t: "pose"; id: string; pose: Pose }
  | { t: "joined"; profile: Profile }
  | { t: "left"; id: string }
  | { t: "deed"; deed: Deed }
  | { t: "say"; id: string; phrase: number }
  | { t: "spell"; id: string; spell: string; x: number; z: number; power: number };
