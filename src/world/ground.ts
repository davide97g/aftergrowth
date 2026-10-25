import { Ray, Vector3 } from "three";

/** Ground height at (x, z). Flat islands answer 0; the kingdom's hill doesn't. */
export type Ground = (x: number, z: number) => number;
export const flat: Ground = () => 0;

/** Where a ray (from the camera, through a click) first meets the ground, or null. */
export function hitGround(ray: Ray, ground: Ground, top = 40): Vector3 | null {
  if (ray.direction.y >= -1e-4) return null;
  const p = new Vector3();
  if (ground === flat) return ray.at(-ray.origin.y / ray.direction.y, p);
  // march down from above the highest ground, then narrow it down
  let t = Math.max(0, (top - ray.origin.y) / ray.direction.y);
  let prev = t;
  for (let i = 0; i < 1200; i++) {
    ray.at(t, p);
    if (p.y <= ground(p.x, p.z)) {
      let a = prev;
      let b = t;
      for (let k = 0; k < 18; k++) {
        const m = (a + b) / 2;
        ray.at(m, p);
        if (p.y <= ground(p.x, p.z)) b = m;
        else a = m;
      }
      ray.at(b, p);
      p.y = ground(p.x, p.z);
      return p;
    }
    if (p.y < -2) return null;
    prev = t;
    t += 0.12;
  }
  return null;
}
