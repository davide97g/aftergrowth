import type { CritterId } from "../world/critters";

/** A page of the field journal: what it is, what you noted, and a hint before you've found it. */
interface Page { name: string; note: string; hint: string; sketch: string; tint?: string }

const BUTTERFLY = "M32 30 C20 14 8 20 14 32 C8 44 22 50 32 36 C42 50 56 44 50 32 C56 20 44 14 32 30 Z M32 22 L32 44 M32 22 L27 14 M32 22 L37 14";
const BIRD = "M14 36 C16 26 28 22 38 26 C44 22 50 24 52 28 L58 30 L52 32 C50 40 40 46 28 44 C22 43 16 42 14 36 Z M28 34 C32 30 38 31 37 35 M24 44 L22 52 M30 45 L30 52";

export const JOURNAL: Record<CritterId, Page> = {
  butterfly_pink: { name: "Rose flutter", note: "Pink wings, never still for long. Loves the flower beds on sunny days.", hint: "Pink wings over the flowers, on a sunny day.", sketch: BUTTERFLY, tint: "#F28CC0" },
  butterfly_yellow: { name: "Sun sulphur", note: "A scrap of sunshine that drifts from bloom to bloom.", hint: "Yellow wings in the sunshine.", sketch: BUTTERFLY, tint: "#F7D34A" },
  butterfly_blue: { name: "Sky morpho", note: "Blue as the sky above the clouds. Rests with its wings closed.", hint: "Blue wings among the flowers by day.", sketch: BUTTERFLY, tint: "#6C8CF0" },
  butterfly_white: { name: "Cloud wing", note: "So pale it could be a petal blowing past.", hint: "White wings, easy to mistake for a petal.", sketch: BUTTERFLY, tint: "#FFF8EC" },
  bunny: { name: "Meadow bunny", note: "Hops off if you come too close. Twitchy nose, kind heart.", hint: "Something hops through the grass.", sketch: "M18 44 C18 32 30 28 40 32 C50 34 52 46 44 48 L22 48 C19 48 18 46 18 44 Z M40 32 C42 26 46 24 48 26 C50 28 48 33 44 34 M42 30 L40 14 C39 10 43 10 44 14 L45 28 M46 29 L48 14 C49 10 53 11 52 15 L49 29 M18 42 C14 42 14 38 18 38", tint: "#F6F1EA" },
  bluebird: { name: "Bluebird", note: "Pecks between the crops and scolds the scarecrow.", hint: "A blue bird pecking near the field.", sketch: BIRD, tint: "#5A8FD8" },
  sparrow: { name: "Field sparrow", note: "Small and brown and everywhere, if you look.", hint: "A little brown bird near the crops.", sketch: BIRD, tint: "#A8744E" },
  robin: { name: "Robin", note: "Red-breasted and bold. Follows the watering can about.", hint: "A red breast among the furrows.", sketch: BIRD, tint: "#E0705A" },
  bee: { name: "Honeybee", note: "From the hive to the flowers and home again, all day long.", hint: "Something buzzes round a beehive by day.", sketch: "M22 34 C22 26 42 26 42 34 C42 42 22 42 22 34 Z M28 28 L28 40 M34 28 L34 40 M42 34 L48 34 M30 28 C24 16 16 20 22 28 M34 28 C40 16 48 20 42 28", tint: "#F2B33D" },
  firefly: { name: "Firefly", note: "A hundred small lanterns over the meadow on a warm night.", hint: "Little lights in the meadow after dark.", sketch: "M28 30 C28 24 36 24 36 30 L36 40 C36 46 28 46 28 40 Z M32 24 L32 20 M28 22 L24 16 M36 22 L40 16 M22 46 L18 50 M42 46 L46 50 M32 50 L32 56", tint: "#FFE27A" },
  frog: { name: "Pond frog", note: "Sits on its own lily pad and dives in with a plop if you lean too close.", hint: "Something croaks by the pond, at night or in the rain.", sketch: "M14 44 C14 34 22 28 32 28 C42 28 50 34 50 44 C50 48 46 50 32 50 C18 50 14 48 14 44 Z M22 30 C18 24 26 20 28 28 M42 30 C46 24 38 20 36 28 M24 42 C28 46 36 46 40 42 M14 46 L8 50 M50 46 L56 50", tint: "#7DB65A" },
  moth: { name: "Moon moth", note: "Pale green and as wide as your hand. Circles a light all night.", hint: "Wings around a light, long after dark.", sketch: "M32 24 C22 12 6 16 10 28 C12 34 20 36 32 32 C44 36 52 34 54 28 C58 16 42 12 32 24 Z M32 32 C24 38 18 48 26 50 C30 50 32 42 32 36 C32 42 34 50 38 50 C46 48 40 38 32 32 Z M32 24 L32 44 M30 22 C26 14 22 12 20 12 M34 22 C38 14 42 12 44 12", tint: "#BFE8C4" },
  snail: { name: "Garden snail", note: "Comes out to taste the world after rain. In no hurry at all.", hint: "Something slow, out on the wet grass after rain.", sketch: "M10 46 L46 46 C50 46 54 42 54 38 L56 30 M54 38 L58 32 M40 46 C26 46 22 34 30 28 C36 24 44 30 40 36 C38 40 32 38 34 34", tint: "#B9814F" },
  ladybird: { name: "Ladybird", note: "Four spots. Walks round and round the rim of one flower.", hint: "A red dot on a flower, in spring or summer.", sketch: "M18 38 C18 26 46 26 46 38 C46 48 18 48 18 38 Z M32 27 L32 47 M18 36 C16 30 22 24 26 26 M46 36 C48 30 42 24 38 26", tint: "#D8433E" },
  dragonfly: { name: "Pond dragonfly", note: "Darts over the water and stops dead in the air. Show-off.", hint: "Something darts over the pond on a warm day.", sketch: "M32 16 L32 54 M32 22 C22 16 8 18 10 22 C12 26 24 26 32 24 M32 22 C42 16 56 18 54 22 C52 26 40 26 32 24 M32 28 C22 26 10 30 12 34 C14 36 24 34 32 30 M32 28 C42 26 54 30 52 34 C50 36 40 34 32 30", tint: "#3A9AD8" },
  owl: { name: "Tawny owl", note: "Watches from a treetop at night and turns its head to follow you.", hint: "Two eyes in a treetop at night. Listen for it.", sketch: "M18 50 C14 36 18 18 32 16 C46 18 50 36 46 50 Z M20 18 L24 12 L28 17 M44 18 L40 12 L36 17 M30 32 L32 35 L34 32 M26 44 L26 50 M38 44 L38 50", tint: "#B98A5E" },
};

export const CRITTER_IDS = Object.keys(JOURNAL) as CritterId[];

/** pages found that pay out a little: [how many, coins] */
export const MILESTONES: [number, number][] = [[4, 10], [8, 25], [CRITTER_IDS.length, 60]];

function sketch(p: Page, size = 56) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><path d="${p.sketch}" fill="${p.tint ?? "none"}" fill-opacity="0.35" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** The field journal's section of the grimoire. `found` maps each creature to the day it was sketched. */
export function journalHtml(found: Partial<Record<CritterId, number>>) {
  const n = CRITTER_IDS.filter((id) => found[id]).length;
  const pages = CRITTER_IDS.map((id) => {
    const p = JOURNAL[id];
    const day = found[id];
    if (!day) return `<li class="unknown"><span class="glyph"><b>?</b></span><span><strong>Not yet seen</strong><em>${p.hint}</em></span></li>`;
    return `<li><span class="glyph">${sketch(p)}</span><span><strong>${p.name}</strong><em>${p.note} <small>Sketched on day ${day}.</small></em></span></li>`;
  }).join("");
  return `<section><h3>Field journal · ${n} of ${CRITTER_IDS.length}</h3><p class="empty">Walk up to a creature and press F to sketch it.</p><ul class="entries">${pages}</ul></section>`;
}
