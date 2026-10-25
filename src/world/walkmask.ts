export type Pt = [number, number];

export function insidePoly(x: number, z: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

interface Circle { x: number; z: number; r: number }
/** an oriented rectangle: centre, half width (local x), half depth (local z), yaw */
interface Box { x: number; z: number; hw: number; hd: number; c: number; s: number }

/** Where the witch may stand: union of ground polygons, minus water and solid props. */
export class WalkMask {
  private ground: Pt[][] = [];
  private holes: Pt[][] = [];
  private solids: Circle[] = [];
  private boxes: Box[] = [];

  addGround(poly: Pt[]) { this.ground.push(poly); }
  addHole(poly: Pt[]) { this.holes.push(poly); }
  addSolid(x: number, z: number, r: number) { this.solids.push({ x, z, r }); }
  /** a solid rectangle (a house, a wall) turned by `rot` like a three.js yaw */
  addBox(x: number, z: number, hw: number, hd: number, rot: number) { this.boxes.push({ x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot) }); }
  removeSolid(x: number, z: number) {
    const i = this.solids.findIndex((c) => c.x === x && c.z === z);
    if (i >= 0) this.solids.splice(i, 1);
  }

  onGround(x: number, z: number): boolean {
    return this.ground.some((p) => insidePoly(x, z, p)) && !this.holes.some((p) => insidePoly(x, z, p));
  }

  blocked(x: number, z: number, radius = 0): boolean {
    return this.solids.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + radius) ** 2) ||
      this.boxes.some((b) => {
        const dx = x - b.x;
        const dz = z - b.z;
        const lx = Math.abs(dx * b.c - dz * b.s) - b.hw;
        const lz = Math.abs(dx * b.s + dz * b.c) - b.hd;
        return (lx < 0 && lz < 0) || Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) < radius;
      });
  }

  walkable(x: number, z: number, radius = 0.25): boolean {
    return this.onGround(x, z) && !this.blocked(x, z, radius);
  }

  /** The nearest spot to (x, z) the witch can stand on, searching outwards up to `within`. */
  nearestWalkable(x: number, z: number, within = 4): Pt | null {
    if (this.walkable(x, z)) return [x, z];
    for (let d = 0.3; d <= within; d += 0.3) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * d;
        const pz = z + Math.sin(a) * d;
        if (this.walkable(px, pz)) return [px, pz];
      }
    }
    return null;
  }

  /** Everything the mask knows, for drawing the island's map. */
  shapes() {
    return { ground: this.ground, holes: this.holes, solids: this.solids, boxes: this.boxes };
  }
}
