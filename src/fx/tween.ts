/** Tiny time-based animations driven by the game loop: `await tweens.run(800, k => …)`. */
export class Tweens {
  private active: ((dt: number) => boolean)[] = [];

  run(ms: number, step: (k: number) => void): Promise<void> {
    return new Promise((done) => {
      let t = 0;
      this.active.push((dt) => {
        t += dt * 1000;
        const k = Math.min(t / ms, 1);
        step(k);
        if (k >= 1) done();
        return k < 1;
      });
    });
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) if (!this.active[i](dt)) this.active.splice(i, 1);
  }
}

/** Overshoots a little and settles: for things popping into existence. */
export const easeOutBack = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
export const smoothstep = (k: number) => k * k * (3 - 2 * k);
