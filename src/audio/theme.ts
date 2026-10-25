/**
 * "Seeds on the Wind", the game's theme: a little waltz in 6/8, D major, about a minute long.
 * Flute melody over kalimba arpeggios, a warm pad, bass, a soft shaker and, the second time round,
 * a bell countermelody. It closes on a minor iv (G minor) before coming home to D: a bittersweet
 * nod to the world these islands floated up from.
 *
 * Everything is synthesised; `scheduleTheme` plays it into any Web Audio context, so the same code
 * runs in the game and renders the song to a file (OfflineAudioContext).
 */

/** seconds per eighth note (a dotted quarter is about 62 bpm) */
const EIGHTH = 0.32;
const BAR = EIGHTH * 6;

type Note = [string | null, number];
interface Bar {
  bass: string;
  /** six eighth-note arpeggio notes for the kalimba */
  arp: string[];
  melody?: Note[];
  bell?: string;
  /** kick and shaker */
  drums?: boolean;
  pad?: boolean;
}

const ARP = {
  Dmaj7: ["D3", "A3", "C#4", "F#4", "A4", "F#4"],
  Gmaj7: ["G3", "D4", "F#4", "B4", "D5", "B4"],
  Asus: ["A3", "E4", "A4", "D5", "C#5", "A4"],
  D: ["D3", "A3", "D4", "F#4", "A4", "F#4"],
  Bm: ["B2", "F#3", "B3", "D4", "F#4", "D4"],
  G: ["G2", "D3", "G3", "B3", "D4", "B3"],
  A: ["A2", "E3", "A3", "C#4", "E4", "C#4"],
  Em7: ["E3", "B3", "D4", "G4", "B4", "G4"],
  A7: ["A2", "E3", "G3", "C#4", "E4", "G4"],
  F$m: ["F#2", "C#3", "F#3", "A3", "C#4", "A3"],
  C: ["C3", "G3", "C4", "E4", "G4", "E4"],
  DoverF$: ["F#2", "A3", "D4", "F#4", "A4", "F#4"],
  Asus4: ["A2", "E3", "A3", "D4", "E4", "D4"],
  Gm: ["G2", "D3", "G3", "A#3", "D4", "A#3"],
};

const A_TUNE: Note[][] = [
  [["A4", 3], ["F#4", 1], ["G4", 1], ["A4", 1]],
  [["B4", 2], ["A4", 1], ["F#4", 3]],
  [["G4", 1], ["A4", 1], ["B4", 1], ["D5", 3]],
  [["C#5", 2], ["B4", 1], ["A4", 3]],
  [["A4", 3], ["F#4", 1], ["G4", 1], ["A4", 1]],
  [["D5", 2], ["C#5", 1], ["B4", 3]],
  [["G4", 1], ["A4", 1], ["B4", 1], ["E5", 2], ["D5", 1]],
  [["C#5", 3], ["A4", 3]],
];

const SONG: Bar[] = [
  // intro: kalimba alone, the pad breathing underneath
  { bass: "D2", arp: ARP.Dmaj7, pad: true },
  { bass: "G2", arp: ARP.Gmaj7, pad: true },
  { bass: "D2", arp: ARP.Dmaj7, pad: true },
  { bass: "A2", arp: ARP.Asus, pad: true },
  // A: the tune
  ...([["D", "D2"], ["Bm", "B1"], ["G", "G2"], ["A", "A2"], ["D", "D2"], ["Bm", "B1"], ["Em7", "E2"], ["A7", "A2"]] as const).map(([c, low], i): Bar => ({ bass: low, arp: ARP[c], melody: A_TUNE[i], drums: true, pad: true })),
  // B: it lifts, and turns to C natural at the end (the witchy bar)
  { bass: "G2", arp: ARP.G, melody: [["B4", 1], ["D5", 1], ["G5", 3], ["F#5", 1]], drums: true, pad: true },
  { bass: "A2", arp: ARP.A, melody: [["E5", 3], ["C#5", 3]], drums: true, pad: true },
  { bass: "F#2", arp: ARP.F$m, melody: [["F#5", 2], ["E5", 1], ["C#5", 3]], drums: true, pad: true },
  { bass: "B1", arp: ARP.Bm, melody: [["D5", 1], ["C#5", 1], ["B4", 1], ["F#4", 3]], drums: true, pad: true },
  { bass: "G2", arp: ARP.G, melody: [["G4", 1], ["B4", 1], ["D5", 1], ["G5", 2], ["A5", 1]], drums: true, pad: true },
  { bass: "A2", arp: ARP.A, melody: [["F#5", 2], ["E5", 1], ["C#5", 3]], drums: true, pad: true },
  { bass: "B1", arp: ARP.Bm, melody: [["D5", 2], ["F#5", 1], ["B5", 3]], drums: true, pad: true },
  { bass: "C2", arp: ARP.C, melody: [["A5", 2], ["G5", 1], ["E5", 2], ["C5", 1]], drums: true, pad: true },
  // A': the tune again, bells above it, and a new ending
  { bass: "D2", arp: ARP.D, melody: A_TUNE[0], bell: "D6", drums: true, pad: true },
  { bass: "B1", arp: ARP.Bm, melody: A_TUNE[1], bell: "B5", drums: true, pad: true },
  { bass: "G2", arp: ARP.G, melody: A_TUNE[2], bell: "B5", drums: true, pad: true },
  { bass: "A2", arp: ARP.A, melody: A_TUNE[3], bell: "C#6", drums: true, pad: true },
  { bass: "F#2", arp: ARP.DoverF$, melody: [["A4", 3], ["F#4", 1], ["G4", 1], ["A4", 1]], bell: "D6", drums: true, pad: true },
  { bass: "G2", arp: ARP.G, melody: [["B4", 2], ["D5", 1], ["G5", 3]], bell: "B5", drums: true, pad: true },
  { bass: "A2", arp: ARP.Asus4, melody: [["E5", 3], ["D5", 1], ["C#5", 1], ["B4", 1]], bell: "A5", drums: true, pad: true },
  { bass: "D2", arp: ARP.D, melody: [["D5", 6]], bell: "F#5", drums: true, pad: true },
  // outro: the minor iv, then home
  { bass: "G2", arp: ARP.G, melody: [["B4", 3], ["D5", 3]], pad: true },
  { bass: "G2", arp: ARP.Gm, melody: [["A#4", 3], ["G4", 3]], pad: true },
  { bass: "D2", arp: ARP.Dmaj7, melody: [["A4", 6]], pad: true },
  { bass: "D2", arp: ["D3", "A3", "D4", "F#4", "A4", "D5"], pad: true },
];

/** Length of one play-through, with a breath before it starts again. */
export const THEME_SECONDS = SONG.length * BAR + BAR;

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function hz(note: string) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note)!;
  const semis = NAMES[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (+m[3] + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

// ---------- instruments ----------

function envelope(ctx: BaseAudioContext, out: AudioNode, t: number, attack: number, peak: number, hold: number, release: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  g.connect(out);
  return g;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, f: number, t: number, end: number, to: AudioNode, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  o.connect(to);
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

/** A breathy wooden flute: sine and a little octave, vibrato that arrives late, a puff of air. */
function flute(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: number, f: number, len: number) {
  const g = envelope(ctx, out, t, 0.07, 0.16, Math.max(0.05, len - 0.18), 0.22);
  const end = t + len + 0.3;
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, len));
  vib.connect(depth);
  for (const [mult, type, vol] of [[1, "sine", 1], [2, "sine", 0.18], [3, "triangle", 0.05]] as const) {
    const v = ctx.createGain();
    v.gain.value = vol;
    v.connect(g);
    const o = osc(ctx, type, f * mult, t, end, v);
    depth.connect(o.frequency);
  }
  vib.start(t);
  vib.stop(end);
  const air = ctx.createBufferSource();
  air.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = f * 2;
  bp.Q.value = 2;
  air.connect(bp).connect(envelope(ctx, out, t, 0.02, 0.05, 0.03, 0.12));
  air.start(t, Math.random());
  air.stop(t + 0.3);
}

/** Kalimba: a sine that rings and fades, with a faint metallic overtone. */
function kalimba(ctx: BaseAudioContext, out: AudioNode, t: number, f: number, vol: number) {
  osc(ctx, "sine", f, t, t + 1.6, envelope(ctx, out, t, 0.004, 0.09 * vol, 0, 1.5));
  osc(ctx, "sine", f * 4.02, t, t + 0.3, envelope(ctx, out, t, 0.002, 0.018 * vol, 0, 0.25));
}

/** A soft pad: two detuned saws through a gentle lowpass, swelling over the bar. */
function pad(ctx: BaseAudioContext, out: AudioNode, t: number, notes: string[], len: number) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  lp.Q.value = 0.5;
  lp.connect(envelope(ctx, out, t, len * 0.45, 0.022, len * 0.35, len * 0.6));
  for (const n of notes) for (const d of [-7, 7]) osc(ctx, "sawtooth", hz(n), t, t + len * 1.5, lp, d);
}

/** A round upright-ish bass: a triangle, its edges softened, a little sine underneath. */
function bass(ctx: BaseAudioContext, out: AudioNode, t: number, f: number, len: number) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 700;
  lp.connect(envelope(ctx, out, t, 0.012, 0.075, len * 0.3, len * 0.7));
  osc(ctx, "triangle", f, t, t + len + 0.4, lp);
  osc(ctx, "sine", f, t, t + len + 0.4, envelope(ctx, out, t, 0.012, 0.03, len * 0.3, len * 0.7));
}

function bell(ctx: BaseAudioContext, out: AudioNode, t: number, f: number) {
  osc(ctx, "sine", f, t, t + 3, envelope(ctx, out, t, 0.003, 0.035, 0, 2.8));
  osc(ctx, "sine", f * 2.76, t, t + 1.2, envelope(ctx, out, t, 0.002, 0.012, 0, 1.0));
}

function shaker(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: number, accent: boolean) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6500;
  s.connect(hp).connect(envelope(ctx, out, t, 0.008, accent ? 0.045 : 0.022, 0.01, 0.06));
  s.start(t, Math.random());
  s.stop(t + 0.12);
}

function kick(ctx: BaseAudioContext, out: AudioNode, t: number) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  o.connect(envelope(ctx, out, t, 0.004, 0.09, 0.01, 0.14));
  o.start(t);
  o.stop(t + 0.3);
}

function reverb(ctx: BaseAudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  return conv;
}

/**
 * Play the whole song once, starting at `t0`, into `out`. Returns how long it lasts. Every node it
 * makes hangs off one gain, so fading that gain stops the song.
 */
export function scheduleTheme(ctx: BaseAudioContext, out: AudioNode, t0: number): number {
  const bus = ctx.createGain();
  // nothing useful lives under 45 Hz on laptop speakers; keep it clean
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 45;
  bus.connect(hp).connect(out);
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  const verb = reverb(ctx, 2.4);
  verb.connect(wet).connect(bus);
  const dry = ctx.createGain();
  dry.connect(bus);
  dry.connect(verb);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  SONG.forEach((bar, b) => {
    const t = t0 + b * BAR;
    // a touch of swing, so the waltz leans forward
    const at = (e: number) => t + e * EIGHTH + (e % 3 === 1 ? 0.018 : 0);
    bar.arp.forEach((n, i) => kalimba(ctx, dry, at(i), hz(n), i === 0 ? 1 : 0.75));
    bass(ctx, dry, t, hz(bar.bass), EIGHTH * 3);
    bass(ctx, dry, at(3), hz(bar.bass) * 1.5, EIGHTH * 3);
    if (bar.pad) pad(ctx, dry, t, bar.arp.slice(2, 5), BAR);
    if (bar.bell) bell(ctx, dry, t, hz(bar.bell));
    if (bar.drums) {
      kick(ctx, dry, t);
      for (let e = 0; e < 6; e++) shaker(ctx, dry, noise, at(e), e === 0 || e === 3);
    }
    let e = 0;
    for (const [n, len] of bar.melody ?? []) {
      if (n) flute(ctx, dry, noise, at(e), hz(n), len * EIGHTH * 0.94);
      e += len;
    }
  });
  return THEME_SECONDS;
}
