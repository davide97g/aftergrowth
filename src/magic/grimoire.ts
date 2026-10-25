import type { FizzleId, SpellId } from "./glyph";
import { type P, type Sigil, SIGIL_SHAPES } from "./recognizer";

const KEY = "af.grimoire.v1";

interface Entry { title: string; note: string; riddle?: string }

const SIGILS: Record<Sigil, Entry> = {
  growth: { title: "Growth", note: "A spiral, the way a fern unrolls. Flowers rise and crops grow a stage." },
  water: { title: "Water", note: "A wave. A small cloud rains on whatever sits under the seal." },
  wind: { title: "Wind", note: "A line with a single curl. Add a straight line to choose where it blows.", riddle: "A gust passes, curls once, and goes on its way." },
  light: { title: "Light", note: "A five-point star. A small light that floats and stays through the night.", riddle: "Five points, like the first star at dusk." },
  flame: { title: "Flame", note: "A triangle, the oldest sign for fire. A campfire, warm and safe in its stones.", riddle: "Three sides, older than any book." },
};

const RESULTS: Record<Exclude<SpellId, Sigil>, Entry> = {
  rainbow: { title: "Rainbow", note: "Water and light in one seal: rain, then a rainbow over it." },
  bloom: { title: "Bloom", note: "Growth and water together: rain, a field of flowers and a new sapling." },
  fireflies: { title: "Firefly dance", note: "Wind carries light: fireflies circle the seal." },
  steam: { title: "Steam", note: "Water and flame cancel out in a puff of steam. Worth knowing." },
};

const FAILS: Record<FizzleId, Entry> = {
  empty: { title: "Empty seal", note: "A circle with nothing inside holds nothing. Draw the sigil first, close the seal last." },
  unclear: { title: "Smudged mark", note: "One mark in the seal was unclear, and the ink smudged. Neater strokes." },
  crowded: { title: "Crowded seal", note: "Three sigils are too many for one seal." },
  "signs-only": { title: "Signs alone", note: "Dots and lines shape a spell, but without a sigil there is nothing to shape." },
  argue: { title: "Sigils argue", note: "Some pairs refuse to share a seal." },
};

export const SPELL_NAMES: Record<SpellId, string> = {
  ...Object.fromEntries(Object.entries(SIGILS).map(([k, v]) => [k, v.title])),
  ...Object.fromEntries(Object.entries(RESULTS).map(([k, v]) => [k, v.title])),
} as Record<SpellId, string>;
export const FIZZLE_NOTES: Record<FizzleId, string> = Object.fromEntries(Object.entries(FAILS).map(([k, v]) => [k, v.note])) as Record<FizzleId, string>;

function sigilSvg(points: P[], size = 64): string {
  const d = points.map((p, i) => `${i ? "L" : "M"}${(32 + p.x * 22).toFixed(1)} ${(32 + p.y * 22).toFixed(1)}`).join(" ");
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.5"/><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** The research journal: what you know, what you've found, what went wrong. Saved in this browser. */
export class Grimoire {
  private known = new Set<string>(["growth", "water"]);
  private panel = document.getElementById("grimoire")!;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
      saved.forEach((k) => this.known.add(k));
    } catch {
      // storage unavailable: start fresh
    }
    document.getElementById("grimoire-close")!.addEventListener("click", () => this.toggle(false));
    this.render();
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  toggle(open = this.panel.hidden) {
    this.panel.hidden = !open;
    if (open) this.render();
  }

  /** Record a result. Returns true the first time it is seen. */
  learn(id: string): boolean {
    if (this.known.has(id)) return false;
    this.known.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.known]));
    } catch {
      // not persisted, still known for this session
    }
    this.render();
    return true;
  }

  private render() {
    const body = document.getElementById("grimoire-body")!;
    const sigils = (Object.keys(SIGILS) as Sigil[]).map((k) => {
      const e = SIGILS[k];
      const known = this.known.has(k);
      return `<li class="${known ? "" : "unknown"}"><span class="glyph">${known ? sigilSvg(SIGIL_SHAPES[k]) : "<b>?</b>"}</span><span><strong>${known ? e.title : "Unknown sigil"}</strong><em>${known ? e.note : e.riddle}</em></span></li>`;
    });
    const results = (Object.keys(RESULTS) as (keyof typeof RESULTS)[]).map((k) => {
      const known = this.known.has(k);
      return `<li class="${known ? "" : "unknown"}"><span><strong>${known ? RESULTS[k].title : "???"}</strong><em>${known ? RESULTS[k].note : "Two sigils, one seal. Try pairs."}</em></span></li>`;
    });
    const fails = (Object.keys(FAILS) as FizzleId[])
      .filter((k) => this.known.has(`fizzle:${k}`))
      .map((k) => `<li><span><strong>${FAILS[k].title}</strong><em>${FAILS[k].note}</em></span></li>`);
    body.innerHTML = `
      <section><h3>Rules from the master's notes</h3>
        <ol class="rules">
          <li>Draw the sigil, then close the seal around it. The spell wakes when the circle closes.</li>
          <li>Each dot inside makes it stronger. A straight line points it.</li>
          <li>The spell lands on the ground under the circle.</li>
          <li>Every sigil and every dot costs a drop of ink. Brew more from flowers at the cauldron.</li>
          <li>Close a seal over a carving stone and the glyph is carved in: it works on its own after that. Carving costs double.</li>
        </ol></section>
      <section><h3>Sigils</h3><ul class="entries">${sigils.join("")}</ul></section>
      <section><h3>Combinations</h3><ul class="entries">${results.join("")}</ul></section>
      <section><h3>Mistakes worth remembering</h3>${fails.length ? `<ul class="entries">${fails.join("")}</ul>` : `<p class="empty">None yet. Every witch smudges eventually.</p>`}</section>`;
  }
}
