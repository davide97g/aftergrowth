/**
 * Letters from the witches of the Lantern Market and Aetherhold. Each new day may bring one to your
 * mailbox: a bit of news or a hint, a small gift, or a favour to ask (some crops, flowers or tea
 * by a certain day), answered with a thank-you and a reward the morning after you post it.
 * Pure data and rules, no three.js, so tests can run them.
 */
import { FLOWER_COLORS, ITEMS, type ItemId, TEA_IDS } from "../../shared/items.ts";

export type Sender = "Fern" | "Odile" | "Bramble" | "Rowan" | "Hazel" | "Tilly" | "Ottilie";

/** What a letter brings: things for the satchel, or coins. */
export type Parcel = { item: ItemId; n: number } | { coins: number };

export interface Letter {
  id: string;
  /** the game day it arrived */
  day: number;
  from: Sender;
  text: string;
  read?: boolean;
  gift?: Parcel;
  claimed?: boolean;
  /** a favour: send `n` of `item` by `due` (a game day); `reward` comes back the next morning */
  ask?: { item: ItemId; n: number; due: number; reward: Parcel; sent?: boolean };
}

export interface Post {
  /** the last game day letters were delivered for */
  day: number;
  letters: Letter[];
  /** thank-you letters on their way, delivered the next morning */
  outbox: { from: Sender; reward: Parcel; what: string }[];
}

/** where each sender lives and how they sign off */
export const SENDERS: Record<Sender, { place: string; sign: string }> = {
  Fern: { place: "Seed & Sprout", sign: "Green thumbs up,\nFern" },
  Odile: { place: "the Inkwell", sign: "In blue-black ink,\nOdile" },
  Bramble: { place: "the Menagerie", sign: "Muddy paws and all,\nBramble" },
  Rowan: { place: "Timber & Stone", sign: "Steady as oak,\nRowan" },
  Hazel: { place: "the Scriptorium", sign: "Ever your teacher,\nHazel" },
  Tilly: { place: "the Outfitter", sign: "Stitch by stitch,\nTilly" },
  Ottilie: { place: "the Gilded Griffin", sign: "A warm hearth waits,\nOttilie" },
};

const NOTES: Record<Sender, string[]> = {
  Fern: [
    "Did you know a crop only grows while its soil is wet? A rain glyph over the whole field saves a lot of trips to the pond.",
    "Melons are slow, but nothing pays like them. Plant one before a long sleep and you'll wake to good news.",
    "The bees from a hive visit the flowers nearby. A hive by a flower bed is a happy hive, and a happy hive makes honey.",
  ],
  Odile: [
    "A little secret of the trade: draw a dot inside the seal and your spell grows stronger. Every dot costs a drop, unless your nib is silver.",
    "Blue flowers make the same ink as any other, but I swear it writes smoother. Don't tell Hazel I said so.",
    "Ink runs out when you least expect it. Rosehip tea warms the last drops in the bottle back to life.",
  ],
  Bramble: [
    "My goat ate a whole hat yesterday. Not mine, luckily. Keep your animals fed in the morning and they'll keep you in eggs and milk.",
    "Ducks only lay near water. Put your pond where they can see it and they'll thank you every morning.",
    "A scarecrow keeps the birds off the field. The birds don't mind much; they sing from the trees instead.",
  ],
  Rowan: [
    "Prune a tree and you'll have wood; chip a rock and you'll have stone. Both grow back in a day, if you're patient.",
    "Brass is dear, but a brass sprinkler waters six plots at once. Worth every coin, says the man who sells brass.",
    "The rope bridge to your portal is older than it looks. It creaks, but it holds. Mostly.",
  ],
  Hazel: [
    "Two sigils in one seal make something new. Water and light, for instance. Try it after a shower.",
    "Growth and water together make a bloom, and sometimes a new sapling. A garden that plants itself!",
    "Wind and light set the fireflies dancing. Best done at dusk, with someone to watch it with.",
    "A carved stone repeats its spell on its own. Rain every few hours, without lifting your pen.",
  ],
  Tilly: [
    "Mossy boots are the comfiest thing I've ever stitched. Your feet will thank you on long walks to the market.",
    "A flower crown never goes out of style. Ask anyone. Well, ask me.",
    "Rain on your hat? A big leaf over your head works better than any umbrella I've sold.",
  ],
  Ottilie: [
    "The bard plays most evenings at the Griffin. Come up the hill when the lanterns are lit.",
    "Honey mead puts a skip in your step. Sunpetal tea does too, and it doesn't make you hiccup.",
    "The great bell rings sweetest first thing in the day. And it pays the first ringer, too.",
  ],
};

/** A small, seeded random generator: the same letter for the same witch and day. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function describe(p: Parcel) {
  if ("coins" in p) return `${p.coins} coins`;
  return `${p.n} × ${ITEMS[p.item].name}`;
}

/** "3 turnips", "2 pink flowers", "1 cup of Rosehip tea" */
export function amount(item: ItemId, n: number) {
  const name = ITEMS[item].name;
  if (item.startsWith("tea:")) return `${n} ${n === 1 ? "cup" : "cups"} of ${name}`;
  // wheat, corn and honey don't take an s
  const plural = n === 1 || ["crop:wheat", "crop:corn", "honey", "wood", "stone", "glass", "wool", "milk"].includes(item) ? "" : "s";
  return `${n} ${name.toLowerCase()}${plural}`;
}

const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

/** The letter that `day` brings (or none), the same every time for the same witch. */
export function letterFor(user: string, day: number): Letter | null {
  const r = rng(hash(`${user}:${day}`));
  if (r() > 0.8) return null;
  const from = pick(r, Object.keys(SENDERS) as Sender[]);
  const id = `${day}-${from}`;
  const kind = r();
  const open = pick(r, ["Dear apprentice,", "Hello, little witch!", "Good morning to you,", "My dear,"]);
  if (kind < 0.4) {
    // a favour to ask
    const wants: { item: ItemId; n: number; why: string }[] = [
      { item: "crop:wheat", n: 3, why: "for a loaf of bread" },
      { item: "crop:turnip", n: 3, why: "for a winter soup" },
      { item: "crop:carrot", n: 2, why: "for a very spoiled pony" },
      { item: "crop:corn", n: 2, why: "for the chickens' birthday" },
      { item: `flower:${pick(r, FLOWER_COLORS)}`, n: 4, why: "to brighten up the shop" },
      { item: `tea:${pick(r, TEA_IDS)}`, n: 1, why: "for a long night of work" },
    ];
    const w = pick(r, wants);
    const worth = ITEMS[w.item].pays * w.n;
    const reward: Parcel = r() < 0.6 ? { coins: Math.round(worth * 1.35 + 3) } : { item: pick(r, [`seed:${pick(r, ["carrot", "corn", "pumpkin"] as const)}`, "charm:water", "charm:growth"] as ItemId[]), n: 2 };
    return {
      id, day, from,
      text: `${open}\n\nCould I trouble you for ${amount(w.item, w.n)}, ${w.why}? Pop them in your mailbox before day ${day + 3} and I'll send ${describe(reward)} back by morning.\n\n${SENDERS[from].sign}`,
      ask: { item: w.item, n: w.n, due: day + 3, reward },
    };
  }
  if (kind < 0.65) {
    // a little gift
    const gifts: Record<Sender, Parcel[]> = {
      Fern: [{ item: "seed:carrot", n: 3 }, { item: "seed:corn", n: 2 }, { item: "seed:pumpkin", n: 1 }],
      Odile: [{ item: "flower:blue", n: 3 }, { item: "flower:pink", n: 3 }],
      Bramble: [{ item: "honey", n: 1 }, { item: "egg", n: 2 }],
      Rowan: [{ item: "wood", n: 4 }, { item: "glass", n: 1 }],
      Hazel: [{ item: "charm:light", n: 1 }, { item: "charm_blank", n: 3 }],
      Tilly: [{ coins: 10 }, { item: "flower:white", n: 3 }],
      Ottilie: [{ item: "tea:chamomile", n: 1 }, { item: "tea:sunpetal", n: 1 }],
    };
    const gift = pick(r, gifts[from]);
    const why = pick(r, ["I had more than I need.", "Just because.", "For no reason at all, which is the best reason.", "It made me think of you."]);
    return { id, day, from, text: `${open}\n\nI've tucked ${describe(gift)} in with this letter. ${why}\n\n${SENDERS[from].sign}`, gift };
  }
  return { id, day, from, text: `${open}\n\n${pick(r, NOTES[from])}\n\n${SENDERS[from].sign}` };
}

/** Hazel's first letter, waiting on your first morning. */
function welcome(day: number): Letter {
  return {
    id: `${day}-welcome`, day, from: "Hazel",
    text: "Dear new apprentice,\n\nWelcome to your island! The witches down at the market will write to you now and then: news, little gifts, and the odd favour. Do answer them; we're a small sky.\n\nI've enclosed some white flowers. Brew them at the kettle by your fireplace: chamomile, for sweet dreams.\n\nEver your teacher,\nHazel",
    gift: { item: "flower:white", n: 2 },
  };
}

/**
 * Bring the post up to `day`: the morning's thank-you letters (for favours posted yesterday), and
 * the day's own letter. Favours past their day are dropped quietly. Returns how many new letters came.
 */
export function deliver(post: Post, user: string, day: number): number {
  if (day <= post.day) return 0;
  const before = post.letters.length;
  if (post.day === 0) post.letters.push(welcome(day));
  for (const t of post.outbox) {
    post.letters.push({
      id: `${day}-thanks-${t.from}-${post.letters.length}`, day, from: t.from,
      text: `Thank you, thank you! The ${t.what} arrived safe and sound. Here's ${describe(t.reward)}, as promised.\n\n${SENDERS[t.from].sign}`,
      gift: t.reward,
    });
  }
  post.outbox = [];
  // only today's letter: a long time away doesn't fill the mailbox
  const today = post.day === 0 ? null : letterFor(user, day);
  if (today) post.letters.push(today);
  post.day = day;
  // keep the last 30, and forget favours nobody answered in time
  post.letters = post.letters.filter((l) => !l.ask || l.ask.sent || l.ask.due >= day).slice(-30);
  return post.letters.length - before;
}

/** Answer a favour: the goods leave your satchel now (the caller takes them), the reward comes tomorrow. */
export function answer(post: Post, letter: Letter) {
  if (!letter.ask || letter.ask.sent) return;
  letter.ask.sent = true;
  post.outbox.push({ from: letter.from, reward: letter.ask.reward, what: amount(letter.ask.item, letter.ask.n).replace(/^\d+ /, "") });
}

export const unread = (post: Post | undefined) => (post?.letters ?? []).filter((l) => !l.read).length;

export const newPost = (): Post => ({ day: 0, letters: [], outbox: [] });
