/**
 * Every sound in the game, synthesised with Web Audio: no sample files. Ambient beds (wind, rain,
 * pond, fire) follow the world each frame; birds, crickets and crackles are scheduled at random;
 * one-shots (footsteps, the pen, the seal, coins) are played on demand.
 *
 * The context starts on the first key or tap (browsers require it). M mutes; the choice is remembered.
 */
import { scheduleTheme } from "./theme";

export interface Ambience {
  /** 0..1 */
  wind: number;
  rain: number;
  /** 1 at noon, 0 at night */
  day: number;
  /** pond nearby, 0..1 */
  water: number;
  /** a fire nearby, 0..1 */
  fire: number;
  /** the market's bustle, 0..1 */
  crowd: number;
  inside: boolean;
}

type SpellSound = "growth" | "water" | "wind" | "light" | "flame" | "rainbow" | "bloom" | "fireflies" | "steam" | "fizzle";

const KEY = "af.sound";
const MUSIC_KEY = "af.music";
const PENTA = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5, 1174.7, 1318.5];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  /** ambient beds go through here, muffled indoors */
  private outside!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private beds: Record<"wind" | "rain" | "water" | "fire" | "pen" | "crowd", { gain: GainNode; filter: BiquadFilterNode }> | null = null;
  private windFilter = 0;
  private penLevel = 0;
  private next = { bird: 2, cricket: 1, crackle: 0, drop: 0, voice: 1 };
  private amb: Ambience = { wind: 0, rain: 0, day: 1, water: 0, fire: 0, crowd: 0, inside: false };
  muted = false;
  onMute: (muted: boolean) => void = () => {};
  /** the theme song plays (N toggles it) */
  music = true;
  onMusic: (on: boolean) => void = () => {};
  private musicBus!: GainNode;
  private song: { gain: GainNode; nextAt: number } | null = null;

  constructor() {
    try {
      this.muted = localStorage.getItem(KEY) === "off";
      this.music = localStorage.getItem(MUSIC_KEY) !== "off";
    } catch {
      // storage blocked: sound on
    }
    const unlock = () => {
      this.start();
      if (this.ctx?.state === "running") {
        removeEventListener("pointerdown", unlock);
        removeEventListener("keydown", unlock);
      }
    };
    addEventListener("pointerdown", unlock);
    addEventListener("keydown", unlock);
    addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "KeyM") this.toggle();
      if (e.code === "KeyN") this.toggleMusic();
    });
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(KEY, this.muted ? "off" : "on");
    } catch {
      // not remembered, still muted for now
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.1);
    this.onMute(this.muted);
  }

  toggleMusic() {
    this.music = !this.music;
    try {
      localStorage.setItem(MUSIC_KEY, this.music ? "on" : "off");
    } catch {
      // not remembered
    }
    if (this.ctx) {
      if (this.music) this.playSong();
      else this.stopSong();
    }
    this.onMusic(this.music);
  }

  /** Start the theme a moment from now; `update` queues the next play-through as each one ends. */
  private playSong() {
    if (this.song || !this.ctx) return;
    const gain = this.ctx.createGain();
    gain.connect(this.musicBus);
    this.song = { gain, nextAt: this.ctx.currentTime + 1.5 };
  }

  private stopSong() {
    if (!this.song || !this.ctx) return;
    const { gain } = this.song;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => gain.disconnect(), 2500);
    this.song = null;
  }

  private start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);
    this.outside = ctx.createBiquadFilter();
    this.outside.type = "lowpass";
    this.outside.frequency.value = 18000;
    this.outside.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.2;
    this.musicBus.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const bed = (type: BiquadFilterType, freq: number, q: number, to: AudioNode = this.outside) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = rand(0.9, 1.1);
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(to);
      src.start(ctx.currentTime + Math.random());
      return { gain, filter };
    };
    this.beds = {
      wind: bed("bandpass", 500, 0.7),
      rain: bed("highpass", 1800, 0.3),
      water: bed("lowpass", 420, 0.8),
      fire: bed("lowpass", 260, 0.6),
      pen: bed("bandpass", 3200, 1.4, this.master),
      crowd: bed("bandpass", 520, 1.1),
    };
    if (this.music) this.playSong();
  }

  /** Follow the world: call once per frame. */
  update(dt: number, amb: Ambience) {
    this.amb = amb;
    const ctx = this.ctx;
    if (!ctx || !this.beds || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const indoor = amb.inside ? 0.25 : 1;
    // the theme: queue each play-through shortly before the last one ends (never while the tab sleeps)
    if (this.song && this.song.nextAt - t < 3) this.song.nextAt += scheduleTheme(ctx, this.song.gain, Math.max(this.song.nextAt, t + 0.1));
    // softer indoors, where the music box lives
    this.musicBus.gain.setTargetAtTime(amb.inside ? 0.06 : 0.2, t, 0.8);
    this.outside.frequency.setTargetAtTime(amb.inside ? 650 : 18000, t, 0.3);
    // wind: a breath that swells and wanders in pitch
    this.windFilter += dt * (0.3 + amb.wind);
    const gust = 0.6 + 0.4 * Math.sin(this.windFilter * 0.7) * Math.sin(this.windFilter * 0.23 + 1);
    this.beds.wind.gain.gain.setTargetAtTime((0.012 + amb.wind * 0.07) * gust * indoor, t, 0.4);
    this.beds.wind.filter.frequency.setTargetAtTime(380 + gust * 420 + amb.wind * 300, t, 0.5);
    this.beds.rain.gain.gain.setTargetAtTime(amb.rain * 0.09 * (amb.inside ? 0.6 : 1), t, 0.6);
    this.beds.water.gain.gain.setTargetAtTime(amb.water * 0.05 * indoor, t, 0.4);
    this.beds.fire.gain.gain.setTargetAtTime(amb.fire * 0.06, t, 0.3);
    // a soft hum of people, swelling and fading like a real crowd
    this.beds.crowd.gain.gain.setTargetAtTime(amb.crowd * (0.018 + 0.01 * Math.sin(this.windFilter * 0.9)) * indoor, t, 0.5);
    // the pen scratches only while it moves
    this.penLevel = Math.max(0, this.penLevel - dt * 6);
    this.beds.pen.gain.gain.setTargetAtTime(this.penLevel * 0.05, t, 0.03);

    const n = this.next;
    n.bird -= dt;
    n.cricket -= dt;
    n.crackle -= dt;
    n.drop -= dt;
    n.voice -= dt;
    if (n.voice <= 0) {
      n.voice = rand(0.4, 1.6);
      if (amb.crowd > 0.1 && !amb.inside) this.voice(amb.crowd);
    }
    if (n.bird <= 0) {
      n.bird = rand(2.5, 8);
      if (Math.random() < amb.day * (1 - amb.rain) && !amb.inside) this.bird();
    }
    if (n.cricket <= 0) {
      n.cricket = rand(0.6, 1.6);
      if (amb.day < 0.3 && amb.rain < 0.3 && !amb.inside) this.cricket();
    }
    if (n.crackle <= 0) {
      n.crackle = rand(0.04, 0.35);
      if (amb.fire > 0.05) this.crackle(amb.fire);
    }
    if (n.drop <= 0) {
      n.drop = rand(0.05, 0.25) / Math.max(amb.rain, 0.1);
      if (amb.rain > 0.3) this.drop(amb.inside ? 0.3 : 1);
    }
  }

  // ---------- building blocks ----------

  private env(at: number, attack: number, peak: number, release: number, to: AudioNode = this.master) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
    g.connect(to);
    return g;
  }

  private tone(freq: number, at: number, peak: number, release: number, type: OscillatorType = "sine", to?: AudioNode, glide?: number) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + release);
    o.connect(this.env(at, 0.005, peak, release, to));
    o.start(at);
    o.stop(at + release + 0.05);
  }

  private burst(at: number, length: number, peak: number, type: BiquadFilterType, freq: number, q = 1, to?: AudioNode, sweep?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, at + length);
    f.Q.value = q;
    src.connect(f).connect(this.env(at, Math.min(0.02, length / 4), peak, length, to));
    src.start(at, Math.random() * Math.max(0, 1.9 - length));
    src.stop(at + length + 0.05);
  }

  private get now() {
    return this.ctx && this.ctx.state === "running" && !this.muted ? this.ctx.currentTime : null;
  }

  // ---------- the world ----------

  private bird() {
    const t = this.now;
    if (t === null) return;
    const base = rand(2400, 3800);
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const at = t + i * rand(0.08, 0.14);
      this.tone(base * rand(0.9, 1.15), at, 0.018, 0.07, "sine", this.outside, base * rand(1.2, 1.5));
    }
  }

  private cricket() {
    const t = this.now;
    if (t === null) return;
    const f = rand(4200, 4700);
    for (let i = 0; i < 3; i++) this.tone(f, t + i * 0.055, 0.006, 0.035, "triangle", this.outside);
  }

  private crackle(level: number) {
    const t = this.now;
    if (t === null) return;
    this.burst(t, rand(0.008, 0.03), 0.05 * level * rand(0.4, 1), "highpass", rand(1200, 3000));
  }

  /** Somebody across the plaza says something: a couple of soft vowel-ish syllables. */
  private voice(level: number) {
    const t = this.now;
    if (t === null) return;
    const base = rand(160, 320);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const at = t + i * rand(0.12, 0.2);
      const f = this.ctx!.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = rand(500, 1100);
      f.Q.value = 4;
      f.connect(this.outside);
      this.tone(base * rand(0.9, 1.2), at, 0.012 * level, 0.12, "sawtooth", f);
    }
  }

  private drop(level: number) {
    const t = this.now;
    if (t === null) return;
    this.tone(rand(1800, 3200), t, 0.006 * level, 0.03, "sine", this.outside, rand(900, 1400));
  }

  // ---------- one-shots ----------

  footstep(running: boolean) {
    const t = this.now;
    if (t === null || this.amb.inside) return;
    this.burst(t, running ? 0.06 : 0.08, running ? 0.05 : 0.035, "bandpass", rand(600, 1000), 1.2);
  }

  /** The dip pen on paper; `pixels` is how far it just moved. */
  scratch(pixels: number) {
    this.penLevel = Math.min(1, this.penLevel + pixels / 40);
  }

  /** The seal closes: a little bell run, or a soft smudge when the glyph fails. */
  seal(fizzled: boolean) {
    const t = this.now;
    if (t === null) return;
    if (fizzled) {
      this.burst(t, 0.4, 0.06, "lowpass", 900, 0.7, undefined, 200);
      this.tone(330, t, 0.03, 0.5, "triangle", undefined, 196);
      return;
    }
    [0, 2, 4, 5].forEach((k, i) => {
      this.tone(PENTA[k], t + i * 0.07, 0.05, 1.2);
      this.tone(PENTA[k] * 2.01, t + i * 0.07, 0.012, 0.6);
    });
  }

  spell(id: SpellSound, power = 1) {
    const t = this.now;
    if (t === null) return;
    const k = 0.7 + Math.min(power, 4) * 0.1;
    switch (id) {
      case "growth":
      case "bloom":
        for (let i = 0; i < 6; i++) this.tone(PENTA[i] / 2, t + 0.2 + i * 0.09, 0.03 * k, 0.5, "triangle");
        break;
      case "water":
      case "rainbow":
        for (let i = 0; i < 18; i++) this.tone(rand(1500, 3000), t + 0.2 + Math.random() * 1.2, 0.012 * k, 0.04, "sine", undefined, rand(800, 1200));
        if (id === "rainbow") PENTA.forEach((f, i) => this.tone(f * 2, t + 0.4 + i * 0.08, 0.02, 1, "sine"));
        break;
      case "wind":
        this.burst(t + 0.1, 1.2, 0.07 * k, "bandpass", 300, 1.5, undefined, 1600);
        break;
      case "flame":
        this.burst(t + 0.1, 0.7, 0.09 * k, "lowpass", 200, 0.8, undefined, 2400);
        break;
      case "steam":
        this.burst(t + 0.1, 0.9, 0.05 * k, "highpass", 3000, 0.5, undefined, 1200);
        break;
      case "light":
      case "fireflies":
        for (let i = 0; i < 5; i++) this.tone(PENTA[7 - i] * 2, t + 0.2 + i * 0.12, 0.012 * k, 0.9);
        break;
      case "fizzle":
        this.burst(t, 0.3, 0.04, "lowpass", 700, 0.7, undefined, 200);
        break;
    }
  }

  /** Water from the can, or the can being filled. */
  pour(fill = false) {
    const t = this.now;
    if (t === null) return;
    this.burst(t, fill ? 0.9 : 0.6, 0.05, "bandpass", fill ? 500 : 1800, 2, undefined, fill ? 1400 : 700);
    for (let i = 0; i < 6; i++) this.tone(rand(500, 900), t + Math.random() * 0.5, 0.012, 0.06, "sine", undefined, rand(900, 1400));
  }

  /** A petted animal says something. */
  animal(kind: "cluck" | "quack" | "baa" | "bleat") {
    const t = this.now;
    if (t === null) return;
    if (kind === "cluck") for (let i = 0; i < 3; i++) this.tone(rand(500, 640), t + i * 0.11, 0.04, 0.07, "triangle", undefined, 380);
    else if (kind === "quack") for (let i = 0; i < 2; i++) this.tone(380, t + i * 0.16, 0.05, 0.12, "sawtooth", this.outside, 300);
    else {
      // a wobbly baa (a goat's bleat is higher)
      const f = kind === "baa" ? 260 : 380;
      const o = this.ctx!.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, t);
      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = 9;
      const depth = this.ctx!.createGain();
      depth.gain.value = f * 0.06;
      lfo.connect(depth).connect(o.frequency);
      const soft = this.ctx!.createBiquadFilter();
      soft.type = "lowpass";
      soft.frequency.value = 1400;
      o.connect(soft).connect(this.env(t, 0.04, 0.05, 0.55));
      o.start(t);
      lfo.start(t);
      o.stop(t + 0.65);
      lfo.stop(t + 0.65);
    }
  }

  /** Pruning a tree: a soft wooden knock and a rustle. */
  chop() {
    const t = this.now;
    if (t === null) return;
    this.tone(190, t, 0.08, 0.12, "triangle", undefined, 120);
    this.burst(t + 0.02, 0.25, 0.04, "bandpass", 2400, 0.8);
  }

  /** Chipping a rock: a bright click. */
  chip() {
    const t = this.now;
    if (t === null) return;
    this.burst(t, 0.05, 0.08, "highpass", 2500);
    this.tone(900, t, 0.03, 0.08, "square", undefined, 600);
  }

  /** The little bell on a shop counter. */
  bell() {
    const t = this.now;
    if (t === null) return;
    for (const [f, v] of [[1760, 0.04], [2637, 0.015], [4186, 0.008]] as const) this.tone(f, t, v, 1.1);
  }

  /** Something picked up, harvested or bought. */
  pop() {
    const t = this.now;
    if (t === null) return;
    this.tone(620, t, 0.05, 0.12, "sine", undefined, 980);
  }

  coins() {
    const t = this.now;
    if (t === null) return;
    this.tone(1318, t, 0.03, 0.18, "triangle");
    this.tone(1760, t + 0.07, 0.03, 0.3, "triangle");
  }

  /** Into the portal. */
  whoosh() {
    const t = this.now;
    if (t === null) return;
    this.burst(t, 1.6, 0.08, "bandpass", 200, 2, undefined, 3000);
    PENTA.forEach((f, i) => this.tone(f, t + 0.3 + i * 0.1, 0.02, 1.2));
  }
}

export const sound = new Sound();
