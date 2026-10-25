/** A tiny generative music box: soft plucks wandering a pentatonic scale, with a little echo. */
export class MusicBox {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer = 0;
  private step = 0;
  private note = 4;
  playing = false;

  private setup() {
    const ctx = new AudioContext();
    const out = ctx.createGain();
    out.gain.value = 0.11;
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.36;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    out.connect(tone);
    tone.connect(ctx.destination);
    tone.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(ctx.destination);
    this.ctx = ctx;
    this.out = out;
  }

  private pluck(freq: number, at: number, length: number, volume: number) {
    const ctx = this.ctx!;
    for (const [mult, type, vol] of [[1, "triangle", 1], [2, "sine", 0.25]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(volume * vol, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + length);
      o.connect(g);
      g.connect(this.out!);
      o.start(at);
      o.stop(at + length + 0.05);
    }
  }

  private tick = () => {
    if (!this.playing || !this.ctx) return;
    // C major pentatonic over two octaves
    const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0];
    const t = this.ctx.currentTime + 0.05;
    if (Math.random() < 0.78) {
      this.note = Math.max(0, Math.min(scale.length - 1, this.note + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
      this.pluck(scale[this.note], t, 1.6, 0.5);
    }
    if (this.step % 8 === 0) {
      const root = [0, 3, 4, 2][(this.step / 8) % 4];
      this.pluck(scale[root] / 2, t, 3, 0.35);
      this.pluck(scale[root + 2] / 2, t + 0.02, 3, 0.25);
    }
    this.step++;
    this.timer = window.setTimeout(this.tick, 440);
  };

  toggle(): boolean {
    if (!this.ctx) this.setup();
    void this.ctx!.resume();
    this.playing = !this.playing;
    clearTimeout(this.timer);
    if (this.playing) this.tick();
    return this.playing;
  }
}
