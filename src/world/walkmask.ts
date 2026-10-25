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

/** Where the witch may stand: union of ground polygons, minus water and solid props. */
export class WalkMask {
  private ground: Pt[][] = [];
  private holes: Pt[][] = [];
  private solids: Circle[] = [];

  addGround(poly: Pt[]) { this.ground.push(poly); }
  addHole(poly: Pt[]) { this.holes.push(poly); }
  addSolid(x: number, z: number, r: number) { this.solids.push({ x, z, r }); }
  removeSolid(x: number, z: number) {
    const i = this.solids.findIndex((c) => c.x === x && c.z === z);
    if (i >= 0) this.solids.splice(i, 1);
  }

  onGround(x: number, z: number): boolean {
    return this.ground.some((p) => insidePoly(x, z, p)) && !this.holes.some((p) => insidePoly(x, z, p));
  }

  blocked(x: number, z: number, radius = 0): boolean {
    return this.solids.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + radius) ** 2);
  }

  walkable(x: number, z: number, radius = 0.25): boolean {
    return this.onGround(x, z) && !this.blocked(x, z, radius);
  }
}
