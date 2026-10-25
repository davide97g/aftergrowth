import { Color } from "three";
import type { Theme } from "../../shared/protocol";
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

export function setTheme(theme: Theme) {
  Object.assign(PALETTE, raw, THEMES[theme] ?? {});
}

export function isToken(name: string): name is Token {
  return name in PALETTE;
}

export function color(token: Token): Color {
  return new Color(PALETTE[token]);
}
