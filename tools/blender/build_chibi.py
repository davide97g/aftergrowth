"""Model the apprentice witch: a chibi made of soft primitives.

No rig: every moving part is its own node with its pivot at the joint, so the game animates
it procedurally (waddle, bob, blink, cape and hat sway). Front faces Blender -Y (three +Z).

Usage: blender -b -P tools/blender/build_chibi.py
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).parent))
from build_props import ROOT, export, join, mat, prim, reset  # noqa: E402

OUT = ROOT / "public/assets/witch.glb"


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def part(name, objs, pivot, soft=True):
    """Join objs into one node whose origin sits at `pivot` (the joint it rotates around)."""
    o = join(objs, name) if len(objs) > 1 else objs[0]
    o.name = name
    o.data.transform(Matrix.Translation(-Vector(pivot)))
    o.location = pivot
    return smooth(o) if soft else o


def bent_cone(name, token, base_z, r0, height, rings=9, seg=18, bend=(0.12, 0.34)):
    """Witch-hat cone built ring by ring so the tip can curl back instead of just tilting."""
    bm = bmesh.new()
    loops = []
    for i in range(rings):
        t = i / (rings - 1)
        r = r0 * (1 - t) ** 0.85
        off = Vector((bend[0] * t ** 2.2, bend[1] * t ** 2.2, -0.12 * t ** 3))
        if i == rings - 1:
            loops.append([bm.verts.new(Vector((0, 0, base_z + height * t)) + off)])
            break
        loops.append([bm.verts.new(Vector((math.cos(a) * r, math.sin(a) * r, base_z + height * t)) + off)
                      for a in (k / seg * 2 * math.pi for k in range(seg))])
    bm.faces.new(list(reversed(loops[0])))
    for a, b in zip(loops, loops[1:]):
        for k in range(seg):
            if len(b) == 1:
                bm.faces.new((a[k], a[(k + 1) % seg], b[0]))
            else:
                bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat(token))
    return o


def carve(o, drop):
    """Delete the faces of `o` whose centre matches `drop(centre)`."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if drop(f.calc_center_median())], context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    return o


def attach(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def build():
    reset()
    root = bpy.data.objects.new("Witch", None)
    bpy.context.scene.collection.objects.link(root)

    # legs: stubby boots
    legs = []
    for side, name in ((1, "LegL"), (-1, "LegR")):
        x = 0.12 * side
        leg = prim("cyl", "leg", "boot", seg=10, r1=0.075, r2=0.07, depth=0.22, loc=(x, 0, 0.2))
        boot = prim("uv", "boot", "boot", u=14, v=9, loc=(x, -0.035, 0.075), scale=(0.1, 0.135, 0.085))
        legs.append(part(name, [leg, boot], (x, 0, 0.3)))

    # body: a little bell of a dress with a collar
    dress = prim("cyl", "dress", "dress", seg=16, r1=0.33, r2=0.19, depth=0.48, loc=(0, 0, 0.47))
    hem = prim("cyl", "hem", "hat-band", seg=16, r1=0.335, r2=0.33, depth=0.05, loc=(0, 0, 0.25))
    collar = prim("cyl", "collar", "cape", seg=14, r1=0.23, r2=0.17, depth=0.07, loc=(0, 0, 0.72))
    brooch = prim("ico", "brooch", "brass", sub=1, loc=(0, -0.2, 0.71), scale=(0.035, 0.02, 0.035))
    satchel = prim("cube", "satchel", "satchel", loc=(0.27, -0.02, 0.42), scale=(0.07, 0.16, 0.13), rot=(0, 0, 0.2))
    flap = prim("cube", "flap", "boot", loc=(0.3, -0.02, 0.47), scale=(0.02, 0.165, 0.06), rot=(0, 0, 0.2))
    body = part("Body", [dress, hem, collar, brooch, satchel, flap], (0, 0, 0.3))

    # cape: back half of a cone shell, pivot at the shoulders
    cape_bm = prim("cyl", "capecone", "cape", seg=24, r1=0.355, r2=0.205, depth=0.47, loc=(0, 0.0, 0.485))
    bm = bmesh.new()
    bm.from_mesh(cape_bm.data)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.1], cuts=3)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < -0.04 or abs(f.normal.z) > 0.9], context="FACES")
    for v in bm.verts:  # flare the hem a little
        k = max(0.6 - v.co.z, 0) * 0.35
        v.co.x *= 1 + k
        v.co.y *= 1 + k
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.018)
    bm.to_mesh(cape_bm.data)
    bm.free()
    hood = prim("uv", "hood", "cape", u=14, v=9, loc=(0, 0.17, 0.74), scale=(0.2, 0.1, 0.09))
    cape = part("Cape", [cape_bm, hood], (0, 0.15, 0.72))

    # arms: short sleeves with round hands
    arms = []
    for side, name in ((1, "ArmL"), (-1, "ArmR")):
        x = 0.2 * side
        sleeve = prim("cyl", "sleeve", "dress", seg=10, r1=0.075, r2=0.06, depth=0.22,
                      loc=(x + 0.04 * side, 0, 0.56), rot=(0, 0.25 * side, 0))
        cuff = prim("cyl", "cuff", "hat-band", seg=10, r1=0.078, r2=0.078, depth=0.035,
                    loc=(x + 0.07 * side, 0, 0.455), rot=(0, 0.25 * side, 0))
        hand = prim("uv", "hand", "skin", u=10, v=7, loc=(x + 0.08 * side, 0, 0.41), scale=(0.06, 0.06, 0.06))
        pieces = [sleeve, cuff, hand]
        if side < 0:  # quill in the right hand
            feather = prim("uv", "feather", "eye-shine", u=8, v=5, loc=(x - 0.09, -0.07, 0.52), scale=(0.025, 0.01, 0.11), rot=(0.5, 0.35, 0))
            vane = prim("uv", "vane", "hat", u=8, v=5, loc=(x - 0.1, -0.09, 0.56), scale=(0.018, 0.008, 0.05), rot=(0.5, 0.35, 0))
            nib = prim("cyl", "nib", "brass", seg=6, r1=0.012, r2=0.0, depth=0.06, loc=(x - 0.07, -0.02, 0.4), rot=(0.5, 0.35, 0))
            pieces += [feather, vane, nib]
        arms.append(part(name, pieces, (x, 0, 0.64)))

    # head: big, round, soft
    hz = 1.03
    head = prim("uv", "head", "skin", u=24, v=16, loc=(0, 0, hz), scale=(0.36, 0.34, 0.33))
    hair = prim("uv", "hair", "hair", u=28, v=18, loc=(0, 0, hz), scale=(0.39, 0.37, 0.36))
    # face opening: a wedge of about +-55 degrees around the front, from chin to brow
    carve(hair, lambda c: c.z < hz - 0.2 or (-c.y > 0.7 * abs(c.x) + 0.02 and hz - 0.3 < c.z < hz + 0.13))
    for v in hair.data.vertices:  # bob that flares out at the ends
        k = max(hz - 0.04 - v.co.z, 0) * 0.55
        v.co.x *= 1 + k
        v.co.y *= 1 + k
    bangs = prim("uv", "bangs", "hair", u=18, v=10, loc=(0, -0.24, hz + 0.16), scale=(0.34, 0.13, 0.12), rot=(-0.45, 0, 0))
    fringe = [prim("uv", "fringe", "hair", u=12, v=8, loc=(0.13 * s, -0.27, hz + 0.1), scale=(0.11, 0.07, 0.1), rot=(-0.4, 0, 0.3 * s))
              for s in (1, -1)]

    blush = [prim("uv", "blush", "blush", u=12, v=6, loc=(0.19 * s, -0.285, hz - 0.08), scale=(0.055, 0.02, 0.032), rot=(0, 0, -0.55 * s))
             for s in (1, -1)]
    mouth = prim("uv", "mouth", "eye", u=10, v=6, loc=(0, -0.335, hz - 0.12), scale=(0.028, 0.01, 0.014))
    headnode = part("Head", [head, hair, bangs, *fringe, *blush, mouth], (0, 0, 0.72))

    eyes = []
    for side, name in ((1, "EyeL"), (-1, "EyeR")):
        x = 0.115 * side
        eye = prim("uv", "eye", "eye", u=12, v=8, loc=(x, -0.31, hz - 0.03), scale=(0.05, 0.022, 0.07), rot=(0, 0, -0.12 * side))
        shine = prim("uv", "shine", "eye-shine", u=8, v=5, loc=(x + 0.016, -0.333, hz + 0.0), scale=(0.017, 0.008, 0.019))
        eyes.append(part(name, [eye, shine], (x, -0.31, hz - 0.03)))

    # hat: bent tip, modest brim so the face stays visible from the iso camera
    brim = prim("cyl", "brim", "hat", seg=24, r1=0.52, r2=0.5, depth=0.04, loc=(0, 0, hz + 0.3))
    for v in brim.data.vertices:  # soft droop at the edge
        r = math.hypot(v.co.x, v.co.y)
        v.co.z -= max(r - 0.3, 0) * 0.18
    cone = bent_cone("cone", "hat", hz + 0.3, 0.3, 0.72)
    band = prim("cyl", "band", "hat-band", seg=18, r1=0.305, r2=0.285, depth=0.08, loc=(0, 0, hz + 0.35))
    star = prim("ico", "star", "brass", sub=0, loc=(0.0, -0.295, hz + 0.35), scale=(0.045, 0.02, 0.045))
    hat = part("Hat", [brim, cone, band, star], (0, 0, hz + 0.3))

    # hierarchy
    for leg in legs:
        attach(leg, root)
    attach(body, root)
    attach(cape, body)
    for arm in arms:
        attach(arm, body)
    attach(headnode, body)
    for eye in eyes:
        attach(eye, headnode)
    attach(hat, headnode)

    export(OUT, [root, body, cape, headnode, hat, *legs, *arms, *eyes])


if __name__ == "__main__":
    build()
