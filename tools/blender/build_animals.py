"""Build the farm animals and the feed trough (docs/MARKET.md, "Animals").

Chunky, round, few parts, like the bunny. Each animal is two meshes:
- "body": everything but the head, origin on the ground under the animal's centre;
- "head": head with its beak/bill/face/horns, a child of "body", origin at the neck joint,
  so the game can rotate it to peck or nod.
The trough is one mesh "trough" plus a separate mesh "feed" (the wheat inside) to hide/show.

Materials are `pal:<token>` (shared/palette.json). Front faces Blender -Y (three +Z).
No swaying tokens (foliage*, moss, grass-dark, bark*, flower-*) on these.

Usage: blender -b -P tools/blender/build_animals.py
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).parent))
from build_props import ROOT, export, join, prim, reset  # noqa: E402

OUT = ROOT / "public/assets/props"


# ---------- helpers ----------

def ell(name, token, loc, r, rot=(0, 0, 0), u=10, v=7):
    """Faceted ellipsoid with radii `r` (a number or an (x, y, z) tuple)."""
    r = (r, r, r) if isinstance(r, (int, float)) else r
    return prim("uv", name, token, u=u, v=v, loc=loc, rot=rot, scale=r)


def blob(name, token, loc, r, sub=1):
    r = (r, r, r) if isinstance(r, (int, float)) else r
    return prim("ico", name, token, sub=sub, loc=loc, scale=r)


def stick(name, token, a, b, r1, r2=None, seg=7):
    """A tapered cylinder from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = prim("cyl", name, token, seg=seg, r1=r1, r2=r1 if r2 is None else r2, depth=d.length)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    o.data.transform(Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4())
    return o


def cone_to(name, token, base, tip, r, seg=6):
    return stick(name, token, base, tip, r, 0.0, seg)


def eyes(token, x, y, z, r, shine=True):
    parts = []
    for s in (-1, 1):
        parts.append(blob("eye", token, (s * x, y, z), r, sub=1))
        if shine:
            parts.append(blob("shine", "eye-shine", (s * x + s * 0.2 * r, y - 0.75 * r, z + 0.35 * r), r * 0.35, sub=0))
    return parts


def cheeks(x, y, z, r):
    return [ell("blush", "blush", (s * x, y, z), (r, r * 0.4, r * 0.6), u=8, v=5) for s in (-1, 1)]


def finish(name, body_parts, head_parts, pivot):
    """Join into "body" (origin at ground) and "head" (origin at `pivot`, parented to body)."""
    body = join(body_parts, "body")
    head = join(head_parts, "head")
    p = Vector(pivot)
    head.data.transform(Matrix.Translation(-p))
    head.location = p
    head.parent = body
    export(OUT / f"{name}.glb", [body, head])
    vs = [body.matrix_world @ v.co for v in body.data.vertices] + [head.matrix_world @ v.co for v in head.data.vertices]
    zs, ys, xs = [v.z for v in vs], [v.y for v in vs], [v.x for v in vs]
    rad = max(v.xy.length for v in vs)
    print(f"STATS {name}: height {max(zs):.2f}  length {max(ys) - min(ys):.2f}  width {max(xs) - min(xs):.2f}"
          f"  max xy radius {rad:.2f}  head pivot three=({p.x:.2f}, {p.z:.2f}, {-p.y:.2f})")


# ---------- animals ----------

def build_chicken():
    """A round white hen: egg body, little wings, tail tuft, red comb, honey beak, orange legs."""
    reset()
    body = [
        ell("body", "bunny", (0, 0.02, 0.2), (0.15, 0.17, 0.14), u=12, v=8),
        ell("tail", "bunny", (0, 0.15, 0.3), (0.07, 0.06, 0.1), rot=(-0.5, 0, 0)),
        ell("wingL", "cloud", (-0.145, 0.04, 0.21), (0.035, 0.1, 0.07), rot=(0.25, 0, 0)),
        ell("wingR", "cloud", (0.145, 0.04, 0.21), (0.035, 0.1, 0.07), rot=(0.25, 0, 0)),
    ]
    for s in (-1, 1):
        body.append(stick("leg", "pumpkin", (s * 0.06, 0.02, 0.08), (s * 0.06, 0.0, 0.0), 0.02))
        body.append(ell("foot", "pumpkin", (s * 0.06, -0.03, 0.012), (0.04, 0.055, 0.014), u=8, v=5))
    head = [
        ell("head", "bunny", (0, -0.1, 0.35), 0.1, u=12, v=8),
        # comb: three little red bumps along the crown
        blob("comb", "barn", (0, -0.14, 0.45), (0.025, 0.035, 0.035)),
        blob("comb", "barn", (0, -0.09, 0.465), (0.028, 0.035, 0.04)),
        blob("comb", "barn", (0, -0.04, 0.45), (0.025, 0.035, 0.035)),
        cone_to("beak", "honey", (0, -0.18, 0.34), (0, -0.25, 0.33), 0.035, seg=6),
        blob("wattle", "barn", (0, -0.18, 0.295), (0.02, 0.02, 0.03)),
        *eyes("eye", 0.055, -0.175, 0.37, 0.018),
        *cheeks(0.07, -0.16, 0.33, 0.022),
    ]
    finish("chicken", body, head, (0, -0.06, 0.27))


def build_duck():
    """A white duck: low round body with an upturned tail, flat orange bill and webbed feet."""
    reset()
    body = [
        ell("body", "cloud", (0, 0.03, 0.17), (0.15, 0.2, 0.12), u=12, v=8),
        ell("tail", "cloud", (0, 0.2, 0.22), (0.06, 0.08, 0.05), rot=(-0.7, 0, 0)),
        ell("wingL", "bunny", (-0.14, 0.06, 0.19), (0.035, 0.12, 0.065), rot=(0.2, 0, 0)),
        ell("wingR", "bunny", (0.14, 0.06, 0.19), (0.035, 0.12, 0.065), rot=(0.2, 0, 0)),
    ]
    for s in (-1, 1):
        body.append(stick("leg", "pumpkin", (s * 0.06, 0.03, 0.07), (s * 0.06, 0.02, 0.0), 0.02))
        body.append(prim("cyl", "foot", "pumpkin", seg=3, r1=0.055, r2=0.055, depth=0.02,
                         loc=(s * 0.06, -0.01, 0.01), rot=(0, 0, -math.pi / 2)))
    head = [
        stick("neck", "cloud", (0, -0.1, 0.2), (0, -0.12, 0.33), 0.06, 0.055, seg=10),
        ell("head", "cloud", (0, -0.12, 0.36), 0.09, u=12, v=8),
        # flat, wide bill
        ell("bill", "pumpkin", (0, -0.23, 0.335), (0.055, 0.065, 0.022), u=10, v=5),
        *eyes("eye", 0.05, -0.19, 0.38, 0.016),
        *cheeks(0.065, -0.17, 0.345, 0.02),
    ]
    finish("duck", body, head, (0, -0.1, 0.24))


def build_sheep():
    """Cloud of wool (a few merged icospheres) on four dark legs, dark face with a wool fringe."""
    reset()
    wool = [
        blob("wool", "cloud", (0, 0.04, 0.4), (0.24, 0.3, 0.19), sub=2),
        blob("wool", "cloud", (0, -0.12, 0.53), 0.15, sub=2),
        blob("wool", "cloud", (0, 0.07, 0.58), 0.16, sub=2),
        blob("wool", "cloud", (0, 0.23, 0.5), 0.14, sub=2),
        blob("wool", "cloud", (-0.17, -0.1, 0.42), 0.14, sub=2),
        blob("wool", "cloud", (0.17, -0.1, 0.42), 0.14, sub=2),
        blob("wool", "cloud", (-0.18, 0.14, 0.41), 0.14, sub=2),
        blob("wool", "cloud", (0.18, 0.14, 0.41), 0.14, sub=2),
        blob("wool", "cloud", (0, 0.31, 0.38), 0.11, sub=2),
    ]
    legs = []
    for x, y in ((-0.12, -0.13), (0.12, -0.13), (-0.12, 0.2), (0.12, 0.2)):
        legs.append(stick("leg", "sheep-face", (x, y, 0.28), (x, y, 0.0), 0.058, 0.05))
    head = [
        ell("face", "sheep-face", (0, -0.36, 0.51), (0.12, 0.12, 0.14), u=12, v=8),
        ell("muzzle", "sheep-face", (0, -0.43, 0.46), (0.09, 0.07, 0.07), u=10, v=6),
        blob("fringe", "cloud", (0, -0.36, 0.63), (0.11, 0.1, 0.07), sub=2),
        blob("fringe", "cloud", (-0.06, -0.34, 0.61), 0.06, sub=2),
        blob("fringe", "cloud", (0.06, -0.34, 0.61), 0.06, sub=2),
    ]
    for s in (-1, 1):
        # white eye patch flat on the dark face, with an ink pupil and a shine
        head.append(ell("eyewhite", "eye-shine", (s * 0.05, -0.462, 0.545), (0.03, 0.012, 0.032), u=8, v=6))
        head.append(ell("pupil", "ink", (s * 0.048, -0.474, 0.54), (0.018, 0.008, 0.02), u=8, v=5))
        head.append(ell("ear", "sheep-face", (s * 0.15, -0.33, 0.54), (0.08, 0.035, 0.035), rot=(0, s * 0.35, s * 0.3)))
    head += cheeks(0.085, -0.43, 0.5, 0.02)
    finish("sheep", wool + legs, head, (0, -0.26, 0.48))


def build_goat():
    """Small tan goat: round body, stick legs with hooves, perky tail, horns, floppy ears, beard."""
    reset()
    body = [
        ell("body", "goat", (0, 0.04, 0.42), (0.19, 0.27, 0.17), u=12, v=8),
        ell("belly", "cream", (0, 0.02, 0.32), (0.13, 0.19, 0.08), u=10, v=6),
        ell("tail", "goat", (0, 0.3, 0.52), (0.035, 0.035, 0.07), rot=(-0.6, 0, 0)),
    ]
    for x, y in ((-0.1, -0.12), (0.1, -0.12), (-0.1, 0.18), (0.1, 0.18)):
        body.append(stick("leg", "goat", (x, y, 0.36), (x, y, 0.06), 0.052, 0.046))
        body.append(prim("cyl", "hoof", "wood-dark", seg=7, r1=0.054, r2=0.048, depth=0.07, loc=(x, y, 0.035)))
    head = [
        stick("neck", "goat", (0, -0.17, 0.45), (0, -0.26, 0.63), 0.085, 0.075, seg=10),
        ell("head", "goat", (0, -0.29, 0.67), (0.12, 0.13, 0.115), u=12, v=8),
        ell("muzzle", "cream", (0, -0.39, 0.63), (0.08, 0.07, 0.065), u=10, v=6),
        blob("nose", "ink", (0, -0.455, 0.65), (0.018, 0.012, 0.012), sub=0),
        cone_to("beard", "cream", (0, -0.38, 0.6), (0, -0.37, 0.47), 0.04, seg=6),
        *eyes("eye", 0.065, -0.385, 0.71, 0.018),
        *cheeks(0.09, -0.36, 0.66, 0.022),
    ]
    for s in (-1, 1):
        # horns: little curved cones sweeping back
        pts = [Vector((s * 0.05, -0.27, 0.76))]
        for d in ((0.01, 0.0, 0.06), (0.015, 0.05, 0.045), (0.01, 0.065, 0.0)):
            pts.append(pts[-1] + Vector((s * d[0], d[1], d[2])))
        radii = (0.032, 0.026, 0.018, 0.0)
        for i in range(3):
            head.append(stick("horn", "rock-dark", pts[i], pts[i + 1], radii[i], radii[i + 1], seg=6))
            if i:
                head.append(blob("hornj", "rock-dark", pts[i], radii[i], sub=1))
        # floppy ears sticking out sideways
        head.append(ell("ear", "goat", (s * 0.15, -0.26, 0.67), (0.085, 0.03, 0.035), rot=(0, s * 0.65, s * 0.25)))
    finish("goat", body, head, (0, -0.19, 0.5))


# ---------- trough ----------

def build_trough():
    """Small wooden feed trough on four stubby legs; the wheat inside is a separate mesh "feed"."""
    reset()
    L, W, Z0, Z1 = 1.0, 0.4, 0.13, 0.4
    t = 0.05
    parts = [
        prim("cube", "bottom", "wood", scale=(L - 0.08, W - 0.06, t), loc=(0, 0, Z0 + t / 2)),
        prim("cube", "front", "wood", scale=(L - 0.08, t, Z1 - Z0), loc=(0, -(W - t) / 2, (Z0 + Z1) / 2), rot=(-0.12, 0, 0)),
        prim("cube", "back", "wood", scale=(L - 0.08, t, Z1 - Z0), loc=(0, (W - t) / 2, (Z0 + Z1) / 2), rot=(0.12, 0, 0)),
        # top rim slats along the long sides
        prim("cube", "rimF", "wood-dark", scale=(L - 0.04, 0.08, 0.04), loc=(0, -W / 2 - 0.01, Z1)),
        prim("cube", "rimB", "wood-dark", scale=(L - 0.04, 0.08, 0.04), loc=(0, W / 2 + 0.01, Z1)),
    ]
    for s in (-1, 1):
        parts.append(prim("cube", "end", "wood-dark", scale=(0.07, W + 0.06, Z1 - Z0 + 0.04), loc=(s * (L / 2 - 0.035), 0, (Z0 + Z1) / 2 + 0.01)))
        for yy in (-1, 1):
            parts.append(prim("cube", "leg", "wood-dark", scale=(0.08, 0.08, Z0 + 0.02), loc=(s * (L / 2 - 0.08), yy * (W / 2 - 0.06), (Z0 + 0.02) / 2)))
    trough = join(parts, "trough")
    feed_parts = [prim("cube", "slab", "wheat", scale=(L - 0.16, W - 0.1, 0.06), loc=(0, 0, 0.33))]
    # a few soft heaps of grain peeking over the rim
    for x, y, r in ((-0.25, 0.0, 0.12), (0.0, 0.01, 0.14), (0.25, -0.01, 0.12)):
        feed_parts.append(blob("heap", "wheat", (x, y, 0.35), (r * 1.3, r, r * 0.55), sub=2))
    feed = join(feed_parts, "feed")
    export(OUT / "trough.glb", [trough, feed])
    vs = [v.co for o in (trough, feed) for v in o.data.vertices]
    print(f"STATS trough: height {max(v.z for v in vs):.2f}  length {max(v.x for v in vs) - min(v.x for v in vs):.2f}"
          f"  depth {max(v.y for v in vs) - min(v.y for v in vs):.2f}  max xy radius {max(v.xy.length for v in vs):.2f}")


def main():
    build_chicken()
    build_duck()
    build_sheep()
    build_goat()
    build_trough()


if __name__ == "__main__":
    main()
