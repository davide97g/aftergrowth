import { Color } from "three";
import type { Theme } from "../../shared/protocol";
import type { Season } from "../../shared/seasons";
import raw from "../../shared/palette.json";

export type Token = keyof typeof raw;

export const PALETTE: Record<Token, string> = { ...raw };

/** Each island wears a theme: a few palette tokens swapped before any material is made. */
const THEMES: Record<Theme, Partial<Record<Token, string>>> = {
  meadow: {},
  blossom: { foliage: "#F2A7C8", "foliage-teal": "#3F8F7A", grass: "#B4DE6E", "grass-dark": "#8CC75A", "flower-yellow": "#FFE08A" },
  autumn: { foliage: "#E8913A", "foliage-teal": "#B4552E", grass: "#C7C25A", "grass-dark": "#A8A445", moss: "#7A8A35", "flower-blue": "#C9634A" },
  mint: { foliage: "#6FD0B0", "foliage-teal": "#2E8C8C", grass: "#9EDFB2", "grass-dark": "#79C99A", "flower-pink": "#B58CF0", water: "#3A9AD8" },
};

/** How each season tints the island, on top of its theme: [colour, how far towards it]. */
const SEASON_TINTS: Record<Season, Partial<Record<Token, [string, number]>>> = {
  spring: { foliage: ["#A6DD6A", 0.45], grass: ["#B8E45E", 0.35], "grass-dark": ["#93CF4C", 0.3] },
  summer: { grass: ["#97CF3E", 0.3], "grass-dark": ["#6FB534", 0.3], foliage: ["#4FA83A", 0.3] },
  autumn: { foliage: ["#E8913A", 0.6], grass: ["#C7C25A", 0.35], "grass-dark": ["#A8A445", 0.35], moss: ["#7A8A35", 0.4] },
  winter: {
    // snow over everything; the evergreens keep a little colour
    grass: ["#EEF3F7", 0.85], "grass-dark": ["#D9E3EB", 0.8], turf: ["#E6EDF2", 0.8], moss: ["#C6D3DC", 0.75],
    foliage: ["#E9EFF3", 0.7], "foliage-teal": ["#DCE8EC", 0.3], soil: ["#8C7466", 0.3], water: ["#9CCBE6", 0.55],
  },
};

const mixA = new Color();
const mixB = new Color();

export function setTheme(theme: Theme, season: Season | null = null) {
  Object.assign(PALETTE, raw, THEMES[theme] ?? {});
  if (!season) return;
  for (const [token, [to, k]] of Object.entries(SEASON_TINTS[season]) as [Token, [string, number]][]) {
    PALETTE[token] = `#${mixA.set(PALETTE[token]).lerp(mixB.set(to), k).getHexString()}`;
  }
}

export function isToken(name: string): name is Token {
  return name in PALETTE;
}

export function color(token: Token): Color {
  return new Color(PALETTE[token]);
}
