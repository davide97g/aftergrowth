"""Build the market island buildings and props (docs/MARKET.md, "The island").

Six walk-up shops, a market booth, the fountain and the notice board, each one bold
silhouette from a few primitives, in the style of the egg cottage. Every shop has a wooden
counter in front (top at 0.9 m) as its own mesh named "counter", and an Empty named
"keeper" on the ground where the keeper stands, between the building and the counter.

Materials are `pal:<token>` (shared/palette.json). Front faces Blender -Y (three +Z).

Usage: blender -b -P tools/blender/build_market.py
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).parent))
from build_props import ROOT, export, flat, join, link, mat, mesh_obj, prim, reset  # noqa: E402

OUT = ROOT / "public/assets/props"

COUNTER_W, COUNTER_D, COUNTER_H = 1.6, 0.5, 0.9


# ---------- helpers ----------

def xf(o, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    """Bake scale, then rotation, then translation into the mesh."""
    o.data.transform(Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Scale(scale, 4))
    return o


def lathe(name, token, prof, seg=12, offset=0.0, closed=False):
    """Revolve a (radius, z) profile around Z. Ends with r > 0 get flat caps unless `closed` (a ring)."""
    bm = bmesh.new()
    rings = []
    for r, z in prof:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((math.cos(offset + k * math.tau / seg) * r,
                                        math.sin(offset + k * math.tau / seg) * r, z)) for k in range(seg)])
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        for k in range(seg):
            k2 = (k + 1) % seg
            if len(a) == 1:
                bm.faces.new((a[0], b[k2], b[k]))
            elif len(b) == 1:
                bm.faces.new((a[k], a[k2], b[0]))
            else:
                bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if not closed:
        for ring in (rings[0], rings[-1]):
            if len(ring) > 2:
                bm.faces.new(ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, token)
    flat(o)
    return o


def extrude_xz(name, token, pts, depth, y=0.0):
    """A polygon drawn in the XZ plane, extruded `depth` along Y and centred on `y`."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y - depth / 2, z)) for x, z in pts]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, depth, 0), verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, token)
    flat(o)
    return o


def leaf(name, token, length, width, thick=0.06, curl=0.0, u=10, v=6):
    """A pointed leaf lying along +X from the origin; `curl` lifts the tip."""
    o = prim("uv", name, token, u=u, v=v)
    for vert in o.data.vertices:
        t = (vert.co.x + 1) / 2
        shape = math.sin(math.pi * min(max(t, 0), 1) ** 0.75) ** 0.9
        vert.co = Vector((t * length, vert.co.y * width * shape, vert.co.z * thick * (0.4 + shape) + curl * t * t * length))
    return o


def bent_cone(name, token, base_z, r0, height, bend=(0.0, 0.0), droop=0.0, rings=8, seg=14):
    """Witch-hat cone built ring by ring so the tip curls (see build_chibi.bent_cone)."""
    bm = bmesh.new()
    loops = []
    for i in range(rings):
        t = i / (rings - 1)
        r = r0 * (1 - t) ** 0.85
        off = Vector((bend[0] * t ** 2.2, bend[1] * t ** 2.2, -droop * t ** 3))
        if i == rings - 1:
            loops.append([bm.verts.new(Vector((0, 0, base_z + height * t)) + off)])
            break
        loops.append([bm.verts.new(Vector((math.cos(a) * r, math.sin(a) * r, base_z + height * t)) + off)
                      for a in (k / seg * math.tau for k in range(seg))])
    bm.faces.new(list(reversed(loops[0])))
    for a, b in zip(loops, loops[1:]):
        for k in range(seg):
            if len(b) == 1:
                bm.faces.new((a[k], a[(k + 1) % seg], b[0]))
            else:
                bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, token)
    flat(o)
    return o


def door(w=0.8, h=1.3, token="wood-dark", frame="rock", depth=0.3):
    """Arched door like the cottage's: box + round top, inside a slightly bigger frame. Faces -Y."""
    r = w / 2
    parts = [prim("cube", "door", token, scale=(w, depth, h - r), loc=(0, 0, (h - r) / 2)),
             prim("cyl", "doortop", token, r1=r, r2=r, depth=depth, seg=10, rot=(math.pi / 2, 0, 0), loc=(0, 0, h - r))]
    if frame:
        fr = r + 0.11
        parts += [prim("cube", "frame", frame, scale=(w + 0.22, depth - 0.04, h - r + 0.02), loc=(0, 0.06, (h - r) / 2)),
                  prim("cyl", "frametop", frame, r1=fr, r2=fr, depth=depth - 0.04, seg=10, rot=(math.pi / 2, 0, 0), loc=(0, 0.06, h - r))]
    parts.append(prim("ico", "knob", "brass", loc=(r * 0.55, -depth / 2 - 0.02, (h - r) * 0.75), scale=(0.06, 0.06, 0.06), sub=0))
    return join(parts, "door")


def round_window(r=0.32, rim="wood"):
    """Cottage-style round window lying on XY, facing +Z (orient it with `face`)."""
    win = prim("cyl", "win", "window", r1=r, r2=r, depth=0.16, seg=10)
    ring = prim("cyl", "rim", rim, r1=r + 0.08, r2=r + 0.08, depth=0.1, seg=10, loc=(0, 0, -0.03))
    bar1 = prim("cube", "bar", rim, scale=(r * 2, 0.06, 0.06), loc=(0, 0, 0.09))
    bar2 = prim("cube", "bar", rim, scale=(0.06, r * 2, 0.06), loc=(0, 0, 0.09))
    return join([win, ring, bar1, bar2], "window")


def face(o, p, n):
    """Bake a +Z-facing part onto point p looking along normal n."""
    o.data.transform(Matrix.Translation(Vector(p)) @ Vector(n).normalized().to_track_quat("Z", "Y").to_matrix().to_4x4())
    return o


def on_wall(radius, angle, z):
    """Point and outward normal on a vertical cylinder wall; angle 0 = front (-Y), + towards +X."""
    a = -math.pi / 2 + angle
    n = Vector((math.cos(a), math.sin(a), 0))
    return n * radius + Vector((0, 0, z)), n


def counter(y, accent):
    """Wooden walk-up counter, top at 0.9 m, centred at (0, y). Accent stripe on the customer side."""
    body_h = COUNTER_H - 0.08
    parts = [
        prim("cube", "body", "wood", scale=(COUNTER_W - 0.1, COUNTER_D - 0.1, body_h), loc=(0, y, body_h / 2)),
        prim("cube", "top", "wood-dark", scale=(COUNTER_W, COUNTER_D, 0.08), loc=(0, y, COUNTER_H - 0.04)),
        prim("cube", "stripe", accent, scale=(COUNTER_W - 0.06, 0.04, 0.22), loc=(0, y - (COUNTER_D - 0.1) / 2 - 0.01, 0.6)),
        prim("cube", "kick", "wood-dark", scale=(COUNTER_W - 0.06, 0.04, 0.12), loc=(0, y - (COUNTER_D - 0.1) / 2 - 0.01, 0.06)),
    ]
    return join(parts, "counter")


def finish(name, parts, counter_obj=None, keeper=None, extra=()):
    o = join(parts, name)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    objs = [o, *extra]
    if counter_obj:
        objs.append(counter_obj)
    if keeper is not None:
        k = link(bpy.data.objects.new("keeper", None))
        k.location = keeper
        objs.append(k)
    export(OUT / f"{name}.glb", objs)
    zs = [(ob.matrix_world @ v.co).z for ob in objs if ob.type == "MESH" for v in ob.data.vertices]
    rs = [(ob.matrix_world @ v.co).xy.length for ob in [o] for v in ob.data.vertices if (ob.matrix_world @ v.co).z < 0.5]
    print(f"STATS {name}: height {max(zs):.2f}  ground radius {max(rs):.2f}"
          + (f"  keeper three=({keeper[0]:.2f}, 0, {-keeper[1]:.2f})" if keeper else ""))


# ---------- shops ----------

def build_seeds():
    """Seed & Sprout: a big terracotta flower pot with a sprout for a roof."""
    reset()
    parts = [
        lathe("pot", "terracotta", [(1.45, 0), (1.8, 2.15), (1.62, 2.15)], seg=14),
        lathe("lip", "terracotta", [(1.6, 2.1), (2.05, 2.1), (2.12, 2.75), (1.95, 2.85), (1.6, 2.85)], seg=14),
        prim("cyl", "soil", "soil", seg=14, r1=1.9, r2=1.2, depth=0.22, loc=(0, 0, 2.9)),
        prim("cyl", "stem", "cape", seg=7, r1=0.26, r2=0.17, depth=1.5, loc=(0, 0.05, 3.7)),
    ]
    # two big leaves and a little curled bud on top
    for side in (1, -1):
        lf = leaf("leaf", "grass", 2.1, 0.85, thick=0.1, curl=0.22)
        xf(lf, loc=(0.08 * side, 0.05, 4.25), rot=(0, -0.22, (0.35 if side > 0 else math.pi + 0.35)))
        parts.append(lf)
    bud = leaf("bud", "cape", 1.0, 0.45, thick=0.09, curl=0.5)
    xf(bud, loc=(0, 0.05, 4.35), rot=(0, -1.2, math.pi / 2 + 0.35))
    parts.append(bud)
    # arched door set into the sloping wall, plus two round windows
    d = door(0.82, 1.3, frame="cream")
    xf(d, loc=(0, -1.52, 0), rot=(0.17, 0, 0))
    parts.append(d)
    for ang, z in ((0.95, 1.3), (-1.1, 1.15)):
        r = 1.45 + 0.35 * z / 2.15
        p, n = on_wall(r - 0.02, ang, z)
        n = (n + Vector((0, 0, -0.16))).normalized()
        parts.append(face(round_window(0.3, rim="cream"), p, n))
    # seed sacks by the counter
    cy = -2.4
    for x, s, tie in ((-1.22, 1.2, "barn"), (1.22, 1.0, "honey")):
        sack = lathe("sack", "cork", [(0.0, 0), (0.3, 0.02), (0.36, 0.2), (0.32, 0.44), (0.13, 0.58), (0.2, 0.7), (0.0, 0.72)], seg=8)
        band = prim("cyl", "tie", tie, seg=8, r1=0.15, r2=0.15, depth=0.07, loc=(0, 0, 0.58))
        seeds = prim("ico", "seeds", "cape", sub=0, loc=(0, -0.33, 0.3), scale=(0.11, 0.03, 0.11))
        sk = join([sack, band, seeds], "sack")
        xf(sk, loc=(x, cy, 0), rot=(0, 0, 0.3 * x), scale=s)
        parts.append(sk)
    finish("shop_seeds", parts, counter(cy, "cape"), keeper=(0, -1.9, 0))


def build_ink():
    """The Inkwell: a tower shaped like an ink bottle, cork top, a big quill sticking out."""
    reset()
    off = math.pi / 8  # octagon with a flat face to the front
    R = 1.75
    apothem = R * math.cos(math.pi / 8)
    parts = [
        lathe("bottle", "ink-glass", [(1.6, 0), (R, 0.15), (R, 2.15), (1.3, 2.6), (0.72, 2.75), (0.72, 2.9)],
              seg=8, offset=off),
        lathe("lip", "ink-glass", [(0.68, 2.85), (0.92, 2.85), (0.94, 3.08), (0.68, 3.08)], seg=8, offset=off),
        prim("cyl", "cork", "cork", seg=8, r1=0.66, r2=0.76, depth=0.62, loc=(0, 0, 3.3)),
        prim("cyl", "corktop", "cork", seg=8, r1=0.76, r2=0.62, depth=0.1, loc=(0, 0, 3.66)),
        # parchment label on the front face
        prim("cube", "label", "cream", scale=(1.25, 0.06, 0.5), loc=(0, -apothem - 0.02, 1.68)),
        prim("cube", "labelband", "ink", scale=(0.9, 0.07, 0.07), loc=(0, -apothem - 0.03, 1.68)),
    ]
    # a pale glass glint: two streaks on the front-right facet
    for dx, h in ((-0.18, 1.5), (0.08, 0.8)):
        p, n = on_wall(apothem + 0.01, math.pi / 4, 1.1)
        p += Vector((n.y, -n.x, 0)) * dx
        parts.append(face(prim("cube", "glint", "glass", scale=(0.13, h, 0.04)), p, n))
    d = door(0.8, 1.3, frame="cream")
    xf(d, loc=(0, -apothem + 0.12, 0))
    parts.append(d)
    for ang in (math.pi / 2, -math.pi / 4, 3 * math.pi / 4):
        p, n = on_wall(apothem, ang, 1.25)
        parts.append(face(round_window(0.3, rim="brass"), p, n))
    # quill: shaft + a long feather with a blue tip, in a plane facing the iso camera
    shaft = prim("cyl", "shaft", "brass", seg=6, r1=0.08, r2=0.03, depth=2.75, loc=(0, 0, 1.375))
    vane = leaf("vane", "cloud", 2.35, 0.48, thick=0.035, curl=0.0)
    xf(vane, loc=(0, 0, 0.45), rot=(0, -math.pi / 2, 0))
    tip = leaf("tip", "blush", 0.85, 0.4, thick=0.045, curl=0.0)
    xf(tip, loc=(0, 0, 2.0), rot=(0, -math.pi / 2, 0))
    quill = join([shaft, vane, tip], "quill")
    xf(quill, rot=(0, 0, math.pi / 2))
    xf(quill, loc=(0.0, 0.1, 3.15), rot=(0, 0.58, math.pi / 4))
    parts.append(quill)
    finish("shop_ink", parts, counter(-2.4, "ink-glass"), keeper=(0, -1.9, 0))


def build_barn():
    """Menagerie: a small round-roofed barn with hay bales and a bit of fence."""
    reset()
    hw, wall, depth = 1.55, 1.6, 3.0
    arc = [(math.cos(math.pi * k / 10) * hw, wall + math.sin(math.pi * k / 10) * hw) for k in range(11)]
    body = extrude_xz("body", "barn", [(-hw, 0), (hw, 0)] + arc[:-1] + [(-hw, wall)], depth)
    ro, ri = hw + 0.22, hw - 0.02
    a0, a1 = -0.18, math.pi + 0.18
    outer = [(math.cos(a0 + (a1 - a0) * k / 12) * ro, wall + math.sin(a0 + (a1 - a0) * k / 12) * ro) for k in range(13)]
    inner = [(math.cos(a0 + (a1 - a0) * k / 12) * ri, wall + math.sin(a0 + (a1 - a0) * k / 12) * ri) for k in range(13)]
    roof = extrude_xz("roof", "wood-dark", outer + inner[::-1], depth + 0.4)
    front = -depth / 2
    parts = [body, roof,
             prim("cube", "plinth", "rock", scale=(2 * hw + 0.16, depth + 0.16, 0.2), loc=(0, 0, 0.1))]
    # barn door: two leaves with cream cross-braces
    dw, dh = 1.3, 1.45
    parts.append(prim("cube", "door", "wood-dark", scale=(dw, 0.12, dh), loc=(0, front - 0.04, dh / 2 + 0.05)))
    parts.append(prim("cube", "frame", "cream", scale=(dw + 0.16, 0.1, 0.12), loc=(0, front - 0.06, dh + 0.1)))
    for sx in (-1, 1):
        parts.append(prim("cube", "jamb", "cream", scale=(0.1, 0.1, dh), loc=(sx * (dw / 2 + 0.03), front - 0.06, dh / 2 + 0.05)))
        cx = sx * dw / 4
        ln = math.hypot(dw / 2, dh) * 0.9
        ang = math.atan2(dh, dw / 2)
        for s in (1, -1):
            parts.append(prim("cube", "brace", "cream", scale=(ln, 0.06, 0.1), loc=(cx, front - 0.11, dh / 2 + 0.05), rot=(0, s * ang, 0)))
    parts.append(prim("cube", "split", "cream", scale=(0.08, 0.08, dh), loc=(0, front - 0.11, dh / 2 + 0.05)))
    # hay loft window in the gable
    parts.append(face(round_window(0.36, rim="cream"), (0, front - 0.02, wall + 0.75), (0, -1, 0)))
    # little cupola on the ridge
    rz = wall + ro
    parts += [prim("cube", "cupola", "cream", scale=(0.5, 0.5, 0.45), loc=(0, 0, rz + 0.12)),
              prim("cyl", "cupolaroof", "wood-dark", seg=4, r1=0.5, r2=0.02, depth=0.4, loc=(0, 0, rz + 0.54), rot=(0, 0, math.pi / 4)),
              prim("cube", "vent", "wood-dark", scale=(0.22, 0.52, 0.22), loc=(0, 0, rz + 0.15))]
    # hay bales stacked by the counter, a short fence on the right
    cy = -2.45
    for x, y, z, rot in ((-1.45, cy - 0.05, 0.22, 0.1), (-1.5, cy + 0.6, 0.22, -0.15), (-1.5, cy + 0.3, 0.66, 0.05)):
        parts.append(prim("cube", "hay", "wheat", scale=(0.62, 0.5, 0.44), loc=(x, y, z), rot=(0, 0, rot)))
        parts.append(prim("cube", "twine", "honey", scale=(0.64, 0.52, 0.06), loc=(x, y, z), rot=(0, 0, rot)))
    for k in range(3):
        parts.append(prim("cube", "fpost", "wood", scale=(0.14, 0.14, 0.95), loc=(2.0, -1.5 + k * 0.8, 0.47)))
    for z in (0.4, 0.72):
        parts.append(prim("cube", "frail", "wood", scale=(0.07, 1.8, 0.12), loc=(1.94, -0.7, z)))
    finish("shop_barn", parts, counter(cy, "barn"), keeper=(0, -1.95, 0))


def build_timber():
    """Timber & Stone: an open shed on posts with a sloped shingle roof, logs and stone blocks."""
    reset()
    hx, hy = 1.65, 1.15
    zf, zb = 3.25, 2.6
    parts = [prim("cube", "floor", "wood", scale=(2 * hx + 0.3, 2 * hy + 0.3, 0.14), loc=(0, 0, 0.07))]
    for x in (-hx, hx):
        for y, h in ((-hy, zf), (hy, zb)):
            parts.append(prim("cube", "post", "wood-dark", scale=(0.24, 0.24, h), loc=(x, y, h / 2)))
    # back wall of planks, a beam across the front
    parts.append(prim("cube", "back", "wood", scale=(2 * hx, 0.14, zb - 0.1), loc=(0, hy + 0.04, (zb - 0.1) / 2)))
    parts.append(prim("cube", "beam", "wood-dark", scale=(2 * hx + 0.3, 0.22, 0.24), loc=(0, -hy, zf - 0.08)))
    # lean-to roof: three overlapping rows of big slate shingles, high at the front
    slope = math.atan2(zf - zb, 2 * hy)
    rows = 3
    span = 2 * hy + 0.9
    for i in range(rows):
        t = (i + 0.5) / rows
        y = -hy - 0.45 + span * t
        z = zf + 0.14 - (y + hy) * math.tan(slope) + (rows - 1 - i) * 0.1
        parts.append(prim("cube", "shingle", "rock-dark", scale=(2 * hx + 0.7, span / rows + 0.2, 0.16), loc=(0, y, z), rot=(-slope - 0.06, 0, 0)))
    parts.append(prim("cube", "fascia", "wood-dark", scale=(2 * hx + 0.75, 0.12, 0.2), loc=(0, -hy - 0.5, zf + 0.08)))
    # a moss cushion and a flower growing on the roof
    parts.append(prim("ico", "tuft", "grass", sub=1, loc=(1.2, 0.5, zb + 0.45), scale=(0.32, 0.32, 0.22)))
    parts.append(prim("ico", "bloom", "honey", sub=0, loc=(1.25, 0.42, zb + 0.66), scale=(0.1, 0.1, 0.1)))
    # log stack against the back wall
    r = 0.24
    for row, n in enumerate((3, 2, 1)):
        for k in range(n):
            x = -0.8 + (k - (n - 1) / 2) * 2 * r
            z = 0.14 + r + row * r * 1.75
            parts.append(prim("cyl", "log", "wood-dark", seg=7, r1=r, r2=r, depth=1.3, loc=(x, 0.5, z), rot=(math.pi / 2, 0, 0)))
            parts.append(prim("cyl", "ring", "cream", seg=7, r1=r * 0.75, r2=r * 0.75, depth=1.34, loc=(x, 0.5, z), rot=(math.pi / 2, 0, 0)))
    # stone blocks
    for x, y, z, s, rot in ((0.75, 0.5, 0.14, 0.58, 0.15), (1.28, 0.4, 0.14, 0.46, -0.2), (0.95, 0.5, 0.72, 0.44, 0.4)):
        parts.append(prim("cube", "stone", "rock", scale=(s, s, s), loc=(x, y, z + s / 2), rot=(0, 0, rot)))
    parts.append(prim("cube", "stone", "rock", scale=(0.5, 0.42, 0.38), loc=(1.75, -1.75, 0.19), rot=(0, 0, 0.3)))
    # chopping stump with an axe in it
    parts += [prim("cyl", "stump", "wood-dark", seg=8, r1=0.34, r2=0.3, depth=0.5, loc=(-1.6, -1.75, 0.25)),
              prim("cyl", "stumptop", "cream", seg=8, r1=0.27, r2=0.27, depth=0.04, loc=(-1.6, -1.75, 0.5)),
              prim("cube", "handle", "wood", scale=(0.07, 0.07, 0.75), loc=(-1.6, -1.8, 0.88), rot=(-0.35, 0, 0)),
              prim("cube", "axehead", "rock-dark", scale=(0.06, 0.3, 0.2), loc=(-1.6, -1.95, 0.56), rot=(-0.35, 0, 0))]
    finish("shop_timber", parts, counter(-1.75, "rock"), keeper=(0, -1.05, 0))


def book(w, d, h, cover, spine_side):
    """A giant book lying flat, centred on the origin, bottom at z=0. spine_side: '-Y' front or '-X' left."""
    t = 0.1
    parts = [prim("cube", "low", cover, scale=(w, d, t), loc=(0, 0, t / 2)),
             prim("cube", "high", cover, scale=(w, d, t), loc=(0, 0, h - t / 2))]
    inset = 0.09
    if spine_side == "-Y":
        parts.append(prim("cube", "spine", cover, scale=(w, t + 0.04, h), loc=(0, -d / 2 + t / 2 - 0.02, h / 2)))
        parts.append(prim("cube", "pages", "cream", scale=(w - 2 * inset, d - inset - t, h - 2 * t + 0.01),
                          loc=(0, (t - inset) / 2, h / 2)))
        for z in (0.28, h - 0.28):
            parts.append(prim("cube", "gilt", "brass", scale=(w * 0.9, 0.04, 0.07), loc=(0, -d / 2 - 0.04, z)))
    else:
        parts.append(prim("cube", "spine", cover, scale=(t + 0.04, d, h), loc=(-w / 2 + t / 2 - 0.02, 0, h / 2)))
        parts.append(prim("cube", "pages", "cream", scale=(w - inset - t, d - 2 * inset, h - 2 * t + 0.01),
                          loc=((t - inset) / 2, 0, h / 2)))
    return join(parts, "book")


def build_scriptorium():
    """Scriptorium: a tower of stacked giant books under a pointed witch-hat roof, round windows."""
    reset()
    stack = [  # w, d, h, cover, spine, twist, shift
        (3.3, 2.75, 1.4, "awning", "-Y", 0.0, (0, 0)),
        (2.95, 2.55, 0.68, "blush", "-X", 0.12, (0.08, 0.05)),
        (2.75, 2.35, 0.64, "honey", "-Y", -0.1, (-0.08, 0.0)),
        (2.5, 2.2, 0.58, "cape", "-X", 0.16, (0.05, 0.08)),
    ]
    parts = []
    z = 0.0
    for i, (w, d, h, cover, spine, twist, (sx, sy)) in enumerate(stack):
        b = book(w, d, h, cover, spine)
        xf(b, loc=(sx, sy, z), rot=(0, 0, twist))
        parts.append(b)
        z += h
    # bookmark ribbon hanging from the second book
    parts.append(prim("cube", "ribbon", "barn", scale=(0.16, 0.03, 0.75), loc=(1.0, -1.32, 1.65), rot=(0, 0, 0.12)))
    # door in the big bottom tome
    d = door(0.8, 1.25, frame="brass")
    xf(d, loc=(-0.5, -1.4, 0))
    parts.append(d)
    # round windows: bottom tome front, third book spine, pages of the second book
    parts.append(face(round_window(0.27, rim="brass"), (0.75, -1.43, 0.75), (0, -1, 0)))
    c, s = math.cos(-0.1), math.sin(-0.1)
    parts.append(face(round_window(0.22, rim="brass"), (-0.08 + 0.55 * c + 1.23 * s, 0.55 * s - 1.23 * c, 2.4), (s, -c, 0)))
    c, s = math.cos(0.12), math.sin(0.12)
    parts.append(face(round_window(0.22, rim="wood"), (0.08 + 1.42 * c, 1.42 * s + 0.05, 1.74), (c, s, 0)))
    # witch-hat roof: a small drooping brim, a cone with a bent tip, a band
    brim = prim("cyl", "brim", "hat", seg=16, r1=1.75, r2=1.35, depth=0.16, loc=(0.05, 0.08, z + 0.06))
    cone = bent_cone("cone", "hat", z + 0.12, 1.3, 2.3, bend=(0.35, 0.7), droop=0.25)
    xf(cone, loc=(0.05, 0.08, 0))
    band = prim("cyl", "band", "hat-band", seg=14, r1=1.33, r2=1.2, depth=0.26, loc=(0.05, 0.08, z + 0.3))
    star = prim("ico", "star", "brass", sub=0, loc=(0.05, 0.08 - 1.2, z + 0.32), scale=(0.16, 0.06, 0.16))
    parts += [brim, cone, band, star]
    finish("shop_scriptorium", parts, counter(-2.3, "hat"), keeper=(0, -1.85, 0))


def build_hat():
    """Outfitter: a building that IS a giant witch hat; the brim is the roof overhang."""
    reset()
    wr, wh = 1.6, 2.2
    parts = [
        prim("cyl", "wall", "cream", seg=14, r1=wr, r2=wr - 0.05, depth=wh, loc=(0, 0, wh / 2)),
        prim("cyl", "plinth", "rock", seg=14, r1=wr + 0.12, r2=wr + 0.1, depth=0.2, loc=(0, 0, 0.1)),
    ]
    brim = prim("cyl", "brim", "plum", seg=20, r1=2.35, r2=1.8, depth=0.2, loc=(0, 0, wh + 0.1))
    for v in brim.data.vertices:  # soft droop at the edge, a little more at the front
        r = v.co.xy.length
        v.co.z -= max(r - 1.7, 0) * 0.28 * (1.2 - 0.3 * v.co.y / 2.35)
    parts.append(brim)
    cz = wh + 0.18
    parts.append(bent_cone("cone", "plum", cz, 1.62, 3.0, bend=(0.55, 1.05), droop=0.45, rings=9, seg=16))
    parts.append(prim("cyl", "band", "hat-band", seg=16, r1=1.56, r2=1.42, depth=0.42, loc=(0, 0, cz + 0.26)))
    parts.append(prim("cube", "buckle", "brass", scale=(0.48, 0.1, 0.48), loc=(0, -1.52, cz + 0.27), rot=(0.17, 0, 0)))
    parts.append(prim("cube", "buckleh", "plum", scale=(0.26, 0.12, 0.26), loc=(0, -1.54, cz + 0.27), rot=(0.17, 0, 0)))
    # round attic window in the cone
    parts.append(face(round_window(0.26, rim="brass"), (0, -1.05, cz + 1.05), (0, -1, 0.42)))
    # door and side windows in the cream wall
    d = door(0.82, 1.3, frame="plum")
    xf(d, loc=(0, -wr + 0.08, 0))
    parts.append(d)
    for ang in (0.95, -0.95):
        p, n = on_wall(wr - 0.03, ang, 1.15)
        parts.append(face(round_window(0.3, rim="wood"), p, n))
    finish("shop_hat", parts, counter(-2.55, "plum"), keeper=(0, -2.0, 0))


# ---------- market props ----------

def build_booth():
    """A small market booth: counter, four posts, a striped awning (cream + one colour)."""
    reset()
    hx, yf, yb = 0.8, -0.55, 0.45
    zf, zb = 2.0, 2.3
    parts = []
    for x in (-hx, hx):
        parts.append(prim("cube", "post", "wood-dark", scale=(0.1, 0.1, zf), loc=(x, yf, zf / 2)))
        parts.append(prim("cube", "post", "wood-dark", scale=(0.1, 0.1, zb), loc=(x, yb, zb / 2)))
    parts.append(prim("cube", "crate", "wood", scale=(0.5, 0.36, 0.34), loc=(-0.45, 0.32, 0.17), rot=(0, 0, 0.1)))
    # awning stripes running front to back, front valance with round scallops
    slope = math.atan2(zb - zf, yb - yf)
    ln = (yb - yf) / math.cos(slope) + 0.45
    n = 6
    sw = (2 * hx + 0.3) / n
    for k in range(n):
        x = -hx - 0.15 + sw * (k + 0.5)
        tok = "awning" if k % 2 else "cream"
        parts.append(prim("cube", "stripe", tok, scale=(sw, ln, 0.06), loc=(x, (yf + yb) / 2 - 0.12, (zf + zb) / 2 + 0.05), rot=(slope, 0, 0)))
        parts.append(prim("cube", "flap", tok, scale=(sw, 0.05, 0.22), loc=(x, yf - 0.43, zf - 0.13)))
        parts.append(prim("cyl", "scallop", tok, seg=8, r1=sw / 2, r2=sw / 2, depth=0.05, loc=(x, yf - 0.43, zf - 0.24), rot=(math.pi / 2, 0, 0)))
    o_counter = join([prim("cube", "body", "wood", scale=(1.5, 0.45, 0.82), loc=(0, -0.3, 0.41)),
                      prim("cube", "top", "wood-dark", scale=(COUNTER_W, 0.55, 0.08), loc=(0, -0.3, 0.86)),
                      prim("cube", "stripe", "awning", scale=(1.46, 0.04, 0.2), loc=(0, -0.54, 0.6))], "counter")
    finish("stall_booth", parts, o_counter, keeper=(0, 0.2, 0))


def build_fountain():
    """Round stone basin, water surface (mesh "water"), a central spout column."""
    reset()
    parts = [
        prim("cyl", "basin", "rock", seg=16, r1=1.5, r2=1.45, depth=0.4, loc=(0, 0, 0.2)),
        lathe("lip", "rock", [(1.22, 0.38), (1.62, 0.38), (1.62, 0.62), (1.22, 0.62)], seg=16, closed=True),
        prim("cyl", "column", "rock-dark", seg=8, r1=0.28, r2=0.22, depth=1.0, loc=(0, 0, 0.9)),
        lathe("bowl", "rock", [(0.2, 1.3), (0.62, 1.42), (0.66, 1.58), (0.5, 1.58), (0.5, 1.48), (0.2, 1.48)], seg=12, closed=True),
        prim("cyl", "spout", "rock-dark", seg=8, r1=0.12, r2=0.08, depth=0.45, loc=(0, 0, 1.7)),
        prim("ico", "spoutcap", "brass", sub=1, loc=(0, 0, 1.95), scale=(0.13, 0.13, 0.1)),
        # a jet of water bubbling from the top
        prim("cyl", "jet", "water-light", seg=8, r1=0.09, r2=0.02, depth=0.3, loc=(0, 0, 2.15)),
        prim("ico", "plop", "water-light", sub=1, loc=(0, 0, 2.3), scale=(0.1, 0.1, 0.08)),
    ]
    # two lily pads with a flower
    for x, y, r in ((0.75, -0.55, 0.26), (-0.8, 0.35, 0.2)):
        parts.append(prim("cyl", "lily", "foliage", seg=8, r1=r, r2=r, depth=0.03, loc=(x, y, 0.5)))
    parts.append(prim("ico", "lilyflower", "flower-pink", sub=0, loc=(0.78, -0.58, 0.56), scale=(0.08, 0.08, 0.06)))
    water = join([prim("cyl", "pool", "water", seg=16, r1=1.24, r2=1.24, depth=0.06, loc=(0, 0, 0.46)),
                  prim("cyl", "pool2", "water", seg=12, r1=0.52, r2=0.52, depth=0.04, loc=(0, 0, 1.53))], "water")
    finish("fountain", parts, extra=(water,))


def build_notice_board():
    """Wooden board on two posts with a tiny roof and a few pinned papers."""
    reset()
    parts = []
    for x in (-0.78, 0.78):
        parts.append(prim("cube", "post", "wood-dark", scale=(0.13, 0.13, 2.15), loc=(x, 0, 1.07)))
    parts.append(prim("cube", "board", "wood", scale=(1.5, 0.1, 1.0), loc=(0, 0, 1.45)))
    parts.append(prim("cube", "ledge", "wood-dark", scale=(1.65, 0.2, 0.07), loc=(0, -0.03, 0.93)))
    for s in (1, -1):
        parts.append(prim("cube", "roof", "chimney", scale=(2.0, 0.42, 0.08), loc=(0, s * 0.17, 2.24), rot=(-s * 0.55, 0, 0)))
    parts.append(prim("cube", "ridge", "wood-dark", scale=(2.05, 0.1, 0.1), loc=(0, 0, 2.36)))
    papers = [(-0.45, 1.6, 0.36, 0.44, 0.08, "barn"), (0.08, 1.52, 0.4, 0.52, -0.06, "hat"),
              (0.52, 1.66, 0.3, 0.36, 0.12, "honey"), (0.42, 1.18, 0.34, 0.26, -0.1, "barn"),
              (-0.4, 1.17, 0.3, 0.24, 0.05, "awning")]
    for x, z, w, h, rot, pin in papers:
        parts.append(prim("cube", "paper", "cream" if x < 0.3 else "cloud", scale=(w, 0.02, h), loc=(x, -0.06, z), rot=(0, rot, 0)))
        parts.append(prim("ico", "pin", pin, sub=0, loc=(x, -0.08, z + h / 2 - 0.06), scale=(0.04, 0.04, 0.04)))
    finish("notice_board", parts)


def main():
    build_seeds()
    build_ink()
    build_barn()
    build_timber()
    build_scriptorium()
    build_hat()
    build_booth()
    build_fountain()
    build_notice_board()


if __name__ == "__main__":
    main()
