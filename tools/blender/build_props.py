"""Build every environment asset for the game.

- Restyles Kenney Nature Kit (CC0) models: material names remapped to palette tokens.
- Models the hero props procedurally (egg cottage, greenhouse, windmill, trees, flowers,
  bunny, lantern) and the floating islands.

All materials are named `pal:<token>` (see shared/palette.json); the game swaps them
for shared toon materials at runtime. Front of every prop faces Blender -Y (three +Z).

Usage: blender -b -P tools/blender/build_props.py
"""
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector, noise

ROOT = Path(__file__).resolve().parents[2]
KENNEY = ROOT / "assets/raw/kenney-nature-kit/Models/GLTF format"
OUT = ROOT / "public/assets/props"
PALETTE = json.loads((ROOT / "shared/palette.json").read_text())

KENNEY_MAP = {
    "leafsGreen": "foliage",
    "leafsDark": "foliage-teal",
    "leafsFall": "pumpkin",
    "woodBark": "bark",
    "woodBarkDark": "bark-dark",
    "woodInner": "cream",
    "wood": "wood",
    "woodDark": "wood-dark",
    "grass": "grass-dark",
    "dirt": "soil",
    "dirtDark": "soil-dark",
    "stone": "rock",
    "stoneDark": "rock-dark",
    "colorRed": "flower-pink",
    "colorYellow": "flower-yellow",
    "colorPurple": "flower-blue",
    "colorTan": "cream",
    "_defaultMat": "cream",
}

# name -> (kenney file, scale[, material overrides])
KENNEY_PROPS = {
    "grass_tuft": ("grass", 1.4),
    "grass_tuft_large": ("grass_large", 1.4),
    "grass_leafs": ("grass_leafs", 1.6),
    "bush": ("plant_bush", 2.0),
    "bush_large": ("plant_bushDetailed", 2.0),
    "pine_small": ("tree_pineSmallA", 1.6),
    "pine_round": ("tree_pineRoundC", 1.8),
    "rock_large": ("stone_largeA", 1.4),
    "rock_small": ("stone_smallA", 1.4),
    "rock_flat": ("stone_smallFlatA", 1.6),
    "rock_tall": ("stone_tallA", 1.2),
    "lily": ("lily_large", 2.0),
    "lily_small": ("lily_small", 2.0),
    "mushroom_red": ("mushroom_redGroup", 2.0),
    "mushroom_tan": ("mushroom_tanGroup", 2.0),
    "crop_row": ("crops_dirtRow", 1.0),
    "crop_row_end": ("crops_dirtRowEnd", 1.0),
    "sprout_a": ("crops_leafsStageA", 0.9),
    "sprout_b": ("crops_leafsStageB", 0.9),
    "pumpkin": ("crop_pumpkin", 1.2),
    "carrot": ("crop_carrot", 1.0),
    "turnip": ("crop_turnip", 1.1),
    "wheat": ("crops_wheatStageB", 1.0, {"_defaultMat": "wheat", "woodInner": "wheat"}),
    "corn": ("crops_cornStageD", 0.85, {"corn": "corn"}),
    "melon": ("crop_melon", 1.15, {"dirt": "bark"}),
    "bridge": ("bridge_wood", 1.6),
    "log": ("log", 1.6),
    "stump": ("stump_round", 1.6),
    "fence": ("fence_simple", 1.0),
    "pot": ("pot_large", 1.0),
    "moss_hang": ("hanging_moss", 2.2),
    # garden and decor for the island editor
    "tree_oak": ("tree_oak", 1.9),
    "tree_fat": ("tree_fat", 2.0),
    "tree_detailed": ("tree_detailed", 1.9),
    "hedge": ("plant_bushLargeTriangle", 2.4),
    "stump_old": ("stump_old", 1.7),
    "pot_small": ("pot_small", 1.4),
    "tent": ("tent_detailedOpen", 2.3, {"colorRed": "cream"}),
    "signpost": ("sign", 2.0, {"_defaultMat": "cream"}),
    "statue_obelisk": ("statue_obelisk", 1.9, {"_defaultMat": "rock"}),
    "statue_ring": ("statue_ring", 1.9),
    "statue_column": ("statue_column", 1.9, {"_defaultMat": "rock"}),
    "canoe": ("canoe", 1.7, {"leafsFall": "flower-pink"}),
    "log_stack": ("log_stackLarge", 1.6),
    "path_stone": ("path_stone", 1.4, {"_defaultMat": "grass"}),
    "path_wood": ("path_wood", 1.4, {"dirt": "wood", "dirtDark": "wood-dark"}),
    "fence_planks": ("fence_planks", 1.4),
    "fence_gate": ("fence_gate", 1.4),
}


# ---------- helpers ----------

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mat(token):
    name = f"pal:{token}"
    m = bpy.data.materials.get(name)
    if m:
        return m
    h = PALETTE[token].lstrip("#")
    rgb = [srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    m.diffuse_color = (*rgb, 1)
    return m


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, bm, token=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    if token:
        o.data.materials.append(mat(token))
    return o


def flat(o):
    for p in o.data.polygons:
        p.use_smooth = False


def prim(kind, name, token, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), **kw):
    bm = bmesh.new()
    if kind == "cube":
        bmesh.ops.create_cube(bm, size=1.0)
    elif kind == "ico":
        bmesh.ops.create_icosphere(bm, subdivisions=kw.get("sub", 1), radius=1.0)
    elif kind == "uv":
        bmesh.ops.create_uvsphere(bm, u_segments=kw.get("u", 10), v_segments=kw.get("v", 7), radius=1.0)
    elif kind == "cyl":
        bmesh.ops.create_cone(bm, cap_ends=True, segments=kw.get("seg", 8),
                              radius1=kw.get("r1", 1.0), radius2=kw.get("r2", 1.0), depth=kw.get("depth", 1.0))
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((*scale, 1)), verts=bm.verts)
    bmesh.ops.transform(bm, matrix=Euler(rot).to_matrix().to_4x4(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    o = mesh_obj(name, bm, token)
    flat(o)
    return o


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def jitter(o, amount, seed):
    rnd = random.Random(seed)
    for v in o.data.vertices:
        v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * amount


def export(path, objs=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs or bpy.context.scene.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_materials="EXPORT",
        export_normals=True, export_texcoords=True, export_animations=False,
    )
    print("EXPORTED", path.relative_to(ROOT))


# ---------- Kenney restyle ----------

def build_kenney(name, src, scale, overrides=None):
    reset()
    bpy.ops.import_scene.gltf(filepath=str(KENNEY / f"{src}.glb"))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        o.matrix_world = o.matrix_world.copy()
        o.parent = None
    o = join(meshes, name) if len(meshes) > 1 else meshes[0]
    for e in [x for x in bpy.context.scene.objects if x.type == "EMPTY"]:
        bpy.data.objects.remove(e)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.transform(Matrix.Scale(scale, 4))
    # base center at origin
    zs = [v.co.z for v in o.data.vertices]
    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    o.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    for i, slot in enumerate(o.material_slots):
        key = slot.material.name.split(".")[0]
        token = (overrides or {}).get(key) or KENNEY_MAP.get(key, "cream")
        o.material_slots[i].material = mat(token)
    flat(o)
    export(OUT / f"{name}.glb", [o])


# ---------- procedural props ----------

def ellipsoid_point(a, c, theta, phi, z0):
    """Point + normal on ellipsoid radii (a, a, c) centred at z0; theta around Z, phi from equator."""
    d = Vector((math.cos(phi) * math.cos(theta), math.cos(phi) * math.sin(theta), math.sin(phi)))
    p = Vector((a * d.x, a * d.y, c * d.z + z0))
    n = Vector((d.x / a, d.y / a, d.z / c)).normalized()
    return p, n


def place_on(o, p, n, push=0.0):
    o.matrix_world = Matrix.Translation(p + n * push) @ n.to_track_quat("Z", "Y").to_matrix().to_4x4()


def build_cottage():
    reset()
    a, c, z0 = 1.7, 2.1, 1.75
    parts = [prim("uv", "egg", "cream", loc=(0, 0, z0), scale=(a, a, c), u=12, v=9)]
    front = -math.pi / 2  # -Y
    # door: box + rounded top, set into the egg front
    p, n = ellipsoid_point(a, c, front, math.asin(-0.55), z0)
    door = [prim("cube", "door", "wood-dark", scale=(0.85, 0.3, 0.8), loc=(0, 0, 0.4)),
            prim("cyl", "doortop", "wood-dark", r1=0.425, r2=0.425, depth=0.3, seg=10, rot=(math.pi / 2, 0, 0), loc=(0, 0, 0.8))]
    frame = [prim("cube", "frame", "rock", scale=(1.05, 0.26, 0.85), loc=(0, 0.06, 0.42)),
             prim("cyl", "frametop", "rock", r1=0.53, r2=0.53, depth=0.26, seg=10, rot=(math.pi / 2, 0, 0), loc=(0, 0.06, 0.82))]
    knob = prim("ico", "knob", "brass", loc=(0.25, -0.17, 0.45), scale=(0.06, 0.06, 0.06), sub=0)
    d = join(door + frame + [knob], "door")
    d.location = (0, -a * 0.86, 0)
    parts.append(d)
    # steps
    parts.append(prim("cube", "step1", "rock", loc=(0, -a - 0.25, 0.06), scale=(1.1, 0.5, 0.12)))
    parts.append(prim("cube", "step2", "rock", loc=(0, -a - 0.6, 0.03), scale=(1.0, 0.4, 0.06)))
    # round windows
    for th, ph, r in [(front + 0.75, 0.55, 0.36), (front - 0.95, 0.15, 0.3), (front + 1.9, 0.25, 0.3)]:
        p, n = ellipsoid_point(a, c, th, ph, z0)
        win = prim("cyl", "win", "window", r1=r, r2=r, depth=0.16, seg=10)
        rim = prim("cyl", "rim", "wood", r1=r + 0.08, r2=r + 0.08, depth=0.1, seg=10, loc=(0, 0, -0.03))
        bar1 = prim("cube", "bar", "wood", scale=(r * 2, 0.06, 0.06), loc=(0, 0, 0.09))
        bar2 = prim("cube", "bar", "wood", scale=(0.06, r * 2, 0.06), loc=(0, 0, 0.09))
        w = join([win, rim, bar1, bar2], "window")
        place_on(w, p, n, 0.0)
        parts.append(w)
    # chimney
    p, n = ellipsoid_point(a, c, front + 2.4, 0.95, z0)
    ch = join([prim("cube", "ch", "chimney", scale=(0.42, 0.42, 1.1), loc=(0, 0, 0.55)),
               prim("cube", "cap", "bark-dark", scale=(0.55, 0.55, 0.14), loc=(0, 0, 1.12))], "chimney")
    ch.location = p - Vector((0, 0, 0.3))
    parts.append(ch)
    o = join(parts, "cottage")
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # smoke spawn marker
    smoke = link(bpy.data.objects.new("smoke_origin", None))
    smoke.location = p + Vector((0, 0, 1.0))
    export(OUT / "cottage.glb", [o, smoke])


def build_greenhouse():
    reset()
    w, d, h, roof = 2.4, 1.7, 1.15, 0.75
    base = prim("cube", "base", "wood", loc=(0, 0, 0.08), scale=(w + 0.25, d + 0.25, 0.16))
    bm = bmesh.new()
    hw, hd = w / 2, d / 2
    vs = [bm.verts.new(v) for v in [
        (-hw, -hd, 0.16), (hw, -hd, 0.16), (hw, hd, 0.16), (-hw, hd, 0.16),
        (-hw, -hd, 0.16 + h), (hw, -hd, 0.16 + h), (hw, hd, 0.16 + h), (-hw, hd, 0.16 + h),
        (-hw, 0, 0.16 + h + roof), (hw, 0, 0.16 + h + roof)]]
    faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 9, 8), (6, 7, 8, 9), (5, 6, 9), (7, 4, 8)]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4 and abs(e.verts[0].co.y - e.verts[1].co.y) < 1e-4], cuts=2)
    glass = mesh_obj("glass", bm.copy(), "glass")
    frame = mesh_obj("frame", bm, "brass")
    mod = frame.modifiers.new("wf", "WIREFRAME")
    mod.thickness = 0.07
    mod.use_replace = True
    bpy.context.view_layer.objects.active = frame
    bpy.ops.object.modifier_apply(modifier="wf")
    flat(frame)
    flat(glass)
    plants = []
    rnd = random.Random(3)
    for i in range(5):
        x = -0.8 + i * 0.4
        plants.append(prim("ico", "plant", rnd.choice(["foliage", "moss", "foliage-teal"]), sub=1,
                           loc=(x, rnd.uniform(-0.3, 0.3), 0.45), scale=(0.28, 0.28, 0.3)))
        plants.append(prim("cyl", "pot", "chimney", seg=6, r1=0.14, r2=0.18, depth=0.22, loc=(x, plants[-1].location.y, 0.27)))
    door = prim("cube", "door", "wood-dark", loc=(0.55, -hd - 0.01, 0.16 + 0.45), scale=(0.55, 0.05, 0.9))
    o = join([base, frame, door] + plants, "greenhouse")
    export(OUT / "greenhouse.glb", [o, glass])


def build_windmill():
    reset()
    tower = prim("cyl", "tower", "brass", seg=6, r1=0.55, r2=0.22, depth=2.8, loc=(0, 0, 1.4))
    base = prim("cyl", "base", "rock", seg=6, r1=0.75, r2=0.7, depth=0.3, loc=(0, 0, 0.15))
    door = prim("cube", "door", "wood-dark", loc=(0, -0.42, 0.65), scale=(0.34, 0.12, 0.6))
    rings = [prim("cyl", "ring", "wood", seg=6, r1=r, r2=r, depth=0.08, loc=(0, 0, z)) for r, z in [(0.5, 0.9), (0.36, 1.8)]]
    head = prim("cyl", "head", "brass", seg=8, r1=0.28, r2=0.28, depth=0.7, rot=(math.pi / 2, 0, 0), loc=(0, -0.1, 2.85))
    hub_z = 2.85
    body = join([tower, base, door, head] + rings, "windmill")
    blades = []
    for i in range(3):
        ang = i * 2 * math.pi / 3
        leaf = prim("uv", "leaf", "foliage", u=8, v=5, scale=(0.32, 0.05, 0.85))
        vein = prim("cube", "vein", "moss", scale=(0.04, 0.06, 1.5))
        bl = join([leaf, vein], "blade")
        bl.data.transform(Matrix.Translation((0, 0, 1.0)))
        bl.data.transform(Matrix.Rotation(ang, 4, "Y"))
        blades.append(bl)
    blades.append(prim("ico", "hub", "brass", sub=1, scale=(0.2, 0.2, 0.2)))
    b = join(blades, "Blades")
    b.location = (0, -0.5, hub_z)
    export(OUT / "windmill.glb", [body, b])


def build_trees():
    # round blob tree
    for i, (r, trunk) in enumerate([(1.05, 1.0), (0.85, 0.8), (1.25, 1.1)]):
        reset()
        t = prim("cyl", "trunk", "bark", seg=6, r1=0.18, r2=0.13, depth=trunk + 0.4, loc=(0, 0, (trunk + 0.4) / 2))
        crown = prim("ico", "crown", "foliage", sub=1, loc=(0, 0, trunk + r * 0.8), scale=(r, r, r * 0.92))
        jitter(crown, 0.06, i)
        export(OUT / f"tree_round_{i}.glb", [join([t, crown], f"tree_round_{i}")])
    # cypress cones
    for i, (hgt, r) in enumerate([(3.0, 0.7), (2.4, 0.6), (3.6, 0.8)]):
        reset()
        t = prim("cyl", "trunk", "bark-dark", seg=5, r1=0.14, r2=0.12, depth=0.5, loc=(0, 0, 0.25))
        cone = prim("cyl", "cone", "foliage-teal", seg=7, r1=r, r2=0.02, depth=hgt, loc=(0, 0, 0.35 + hgt / 2))
        jitter(cone, 0.04, 10 + i)
        export(OUT / f"tree_cypress_{i}.glb", [join([t, cone], f"tree_cypress_{i}")])


def build_flowers():
    for color in ["pink", "yellow", "blue", "white"]:
        reset()
        stem = prim("cyl", "stem", "moss", seg=4, r1=0.025, r2=0.02, depth=0.32, loc=(0, 0, 0.16))
        leaf = prim("uv", "leaf", "grass-dark", u=6, v=4, scale=(0.09, 0.03, 0.04), loc=(0.07, 0, 0.1), rot=(0, -0.5, 0))
        petals = []
        for k in range(5):
            a = k * 2 * math.pi / 5
            petals.append(prim("uv", "petal", f"flower-{color}", u=6, v=4, scale=(0.075, 0.075, 0.03),
                               loc=(math.cos(a) * 0.075, math.sin(a) * 0.075, 0.34)))
        center = prim("ico", "center", "flower-yellow" if color != "yellow" else "flower-white", sub=1,
                      loc=(0, 0, 0.355), scale=(0.045, 0.045, 0.03))
        f = join([stem, leaf, center] + petals, f"flower_{color}")
        f.data.transform(Matrix.Scale(1.5, 4))
        export(OUT / f"flower_{color}.glb", [f])


def build_bunny():
    reset()
    parts = [
        prim("uv", "body", "bunny", u=10, v=7, loc=(0, 0.05, 0.24), scale=(0.2, 0.26, 0.2)),
        prim("uv", "head", "bunny", u=10, v=7, loc=(0, -0.2, 0.42), scale=(0.15, 0.15, 0.14)),
        prim("uv", "earL", "bunny", u=6, v=5, loc=(-0.06, -0.18, 0.64), scale=(0.04, 0.03, 0.13), rot=(0.2, -0.15, 0)),
        prim("uv", "earR", "bunny", u=6, v=5, loc=(0.06, -0.18, 0.64), scale=(0.04, 0.03, 0.13), rot=(0.2, 0.15, 0)),
        prim("uv", "earLi", "bunny-pink", u=6, v=5, loc=(-0.06, -0.2, 0.64), scale=(0.022, 0.02, 0.1), rot=(0.2, -0.15, 0)),
        prim("uv", "earRi", "bunny-pink", u=6, v=5, loc=(0.06, -0.2, 0.64), scale=(0.022, 0.02, 0.1), rot=(0.2, 0.15, 0)),
        prim("ico", "tail", "flower-white", sub=1, loc=(0, 0.32, 0.26), scale=(0.07, 0.07, 0.07)),
        prim("ico", "eyeL", "ink", sub=0, loc=(-0.08, -0.32, 0.45), scale=(0.022, 0.022, 0.022)),
        prim("ico", "eyeR", "ink", sub=0, loc=(0.08, -0.32, 0.45), scale=(0.022, 0.022, 0.022)),
        prim("ico", "nose", "bunny-pink", sub=0, loc=(0, -0.35, 0.4), scale=(0.02, 0.02, 0.018)),
    ]
    export(OUT / "bunny.glb", [join(parts, "bunny")])


def build_lantern():
    reset()
    parts = [
        prim("cyl", "post", "wood-dark", seg=6, r1=0.06, r2=0.05, depth=1.1, loc=(0, 0, 0.55)),
        prim("cube", "arm", "wood-dark", scale=(0.08, 0.35, 0.06), loc=(0, -0.14, 1.08)),
        prim("cyl", "cap", "brass", seg=6, r1=0.13, r2=0.03, depth=0.12, loc=(0, -0.28, 0.98)),
        prim("cyl", "glow", "window", seg=6, r1=0.1, r2=0.1, depth=0.18, loc=(0, -0.28, 0.83)),
        prim("cyl", "bottom", "brass", seg=6, r1=0.11, r2=0.11, depth=0.03, loc=(0, -0.28, 0.73)),
    ]
    export(OUT / "lantern.glb", [join(parts, "lantern")])


def crystal_shard(name, token, length, width, seed):
    """A tall faceted crystal: an octahedron stretched along Z."""
    o = prim("ico", name, token, sub=0, scale=(width, width, length))
    o.data.transform(Matrix.Translation((0, 0, length * 0.9)))
    jitter(o, width * 0.12, seed)
    return o


def build_island_decor():
    # standing crystal cluster for the island top
    reset()
    rnd = random.Random(5)
    shards = []
    for i in range(5):
        tok = "crystal" if i % 2 == 0 else "crystal-deep"
        sh = crystal_shard(f"s{i}", tok, rnd.uniform(0.35, 0.8), rnd.uniform(0.12, 0.2), i)
        sh.data.transform(Matrix.Rotation(rnd.uniform(-0.45, 0.45), 4, "X") @ Matrix.Rotation(rnd.uniform(-0.45, 0.45), 4, "Y"))
        sh.data.transform(Matrix.Translation((rnd.uniform(-0.18, 0.18), rnd.uniform(-0.18, 0.18), 0)))
        shards.append(sh)
    base = prim("ico", "base", "rock", sub=0, loc=(0, 0, 0.05), scale=(0.35, 0.35, 0.15))
    export(OUT / "crystal_cluster.glb", [join(shards + [base], "crystal_cluster")])
    # hanging crystals for the underside: they point down from their origin
    reset()
    shards = []
    for i in range(4):
        tok = "crystal" if i % 2 else "crystal-deep"
        sh = crystal_shard(f"h{i}", tok, rnd.uniform(0.5, 1.2), rnd.uniform(0.15, 0.26), 10 + i)
        sh.data.transform(Matrix.Rotation(math.pi + rnd.uniform(-0.35, 0.35), 4, "X") @ Matrix.Rotation(rnd.uniform(-0.35, 0.35), 4, "Y"))
        sh.data.transform(Matrix.Translation((rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 0.1)))
        shards.append(sh)
    export(OUT / "crystal_hang.glb", [join(shards, "crystal_hang")])
    # root tangle: a few curved roots hanging from their origin
    reset()
    roots = []
    for i in range(4):
        curve = bpy.data.curves.new(f"root{i}", "CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = rnd.uniform(0.05, 0.09)
        curve.bevel_resolution = 1
        sp = curve.splines.new("BEZIER")
        n = 4
        sp.bezier_points.add(n - 1)
        a = rnd.uniform(0, math.tau)
        for k, bp in enumerate(sp.bezier_points):
            t = k / (n - 1)
            bp.co = (math.cos(a) * 0.3 * t + rnd.uniform(-0.12, 0.12), math.sin(a) * 0.3 * t + rnd.uniform(-0.12, 0.12), -t * rnd.uniform(1.4, 2.4))
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        # taper to a point
        sp.bezier_points[-1].radius = 0.15
        ob = bpy.data.objects.new(f"root{i}", curve)
        bpy.context.scene.collection.objects.link(ob)
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.convert(target="MESH")
        ob.select_set(False)
        ob.data.materials.clear()
        ob.data.materials.append(mat("bark-dark"))
        flat(ob)
        roots.append(ob)
    knot = prim("ico", "knot", "bark", sub=1, scale=(0.3, 0.3, 0.2))
    export(OUT / "root_tangle.glb", [join(roots + [knot], "root_tangle")])



def build_garden():
    """Garden buildings and decor for the island editor, modelled from primitives."""
    rnd = random.Random(21)

    # wishing well: stone ring, water, two posts, a little roof, crank and bucket
    reset()
    parts = [
        prim("cyl", "ring", "rock", seg=12, r1=0.78, r2=0.74, depth=0.75, loc=(0, 0, 0.375)),
        prim("cyl", "lip", "rock-dark", seg=12, r1=0.82, r2=0.82, depth=0.1, loc=(0, 0, 0.75)),
        prim("cyl", "water", "water", seg=12, r1=0.62, r2=0.62, depth=0.04, loc=(0, 0, 0.78)),
        prim("cube", "postL", "wood-dark", scale=(0.12, 0.12, 1.5), loc=(-0.68, 0, 1.45)),
        prim("cube", "postR", "wood-dark", scale=(0.12, 0.12, 1.5), loc=(0.68, 0, 1.45)),
        prim("cyl", "roof", "foliage-teal", seg=4, r1=1.05, r2=0.02, depth=0.7, loc=(0, 0, 2.45), rot=(0, 0, math.pi / 4)),
        prim("cyl", "crank", "wood", seg=6, r1=0.05, r2=0.05, depth=1.5, loc=(0, 0, 1.6), rot=(0, math.pi / 2, 0)),
        prim("cyl", "rope", "cream", seg=4, r1=0.015, r2=0.015, depth=0.5, loc=(0, 0, 1.33)),
        prim("cyl", "bucket", "wood", seg=8, r1=0.13, r2=0.16, depth=0.22, loc=(0, 0, 1.0)),
    ]
    export(OUT / "well.glb", [join(parts, "well")])

    # beehive: a straw skep on a stump
    reset()
    parts = [prim("cyl", "stand", "bark", seg=8, r1=0.36, r2=0.32, depth=0.4, loc=(0, 0, 0.2))]
    z = 0.4
    for i, r in enumerate([0.42, 0.46, 0.44, 0.38, 0.3, 0.18]):
        parts.append(prim("cyl", f"band{i}", "honey" if i % 2 else "wheat", seg=14, r1=r, r2=r * 0.94, depth=0.14, loc=(0, 0, z + 0.07)))
        z += 0.13
    parts.append(prim("ico", "knob", "wheat", sub=1, loc=(0, 0, z + 0.04), scale=(0.1, 0.1, 0.08)))
    parts.append(prim("cyl", "door", "ink", seg=8, r1=0.07, r2=0.07, depth=0.06, loc=(0, -0.43, 0.5), rot=(math.pi / 2, 0, 0)))
    export(OUT / "beehive.glb", [join(parts, "beehive")])

    # bench
    reset()
    parts = [
        prim("cube", "seat", "wood", scale=(1.4, 0.42, 0.08), loc=(0, 0, 0.46)),
        prim("cube", "back", "wood", scale=(1.4, 0.06, 0.32), loc=(0, 0.2, 0.78)),
        prim("cube", "back2", "wood-dark", scale=(1.4, 0.05, 0.06), loc=(0, 0.21, 0.98)),
    ]
    for x in (-0.6, 0.6):
        for y in (-0.15, 0.17):
            parts.append(prim("cube", "leg", "wood-dark", scale=(0.08, 0.08, 0.46), loc=(x, y, 0.23)))
        parts.append(prim("cube", "arm", "wood-dark", scale=(0.08, 0.42, 0.06), loc=(x * 1.12, 0, 0.66)))
        parts.append(prim("cube", "armpost", "wood-dark", scale=(0.06, 0.06, 0.24), loc=(x * 1.12, -0.17, 0.55)))
    export(OUT / "bench.glb", [join(parts, "bench")])

    # swing: an A-frame and a seat on ropes that the game swings
    reset()
    frame = []
    for x in (-0.95, 0.95):
        for sy in (-1, 1):
            leg = prim("cube", "leg", "wood-dark", scale=(0.1, 0.1, 2.15), loc=(x, sy * 0.3, 1.0), rot=(sy * 0.28, 0, 0))
            frame.append(leg)
    frame.append(prim("cyl", "beam", "wood", seg=8, r1=0.07, r2=0.07, depth=2.1, loc=(0, 0, 2.05), rot=(0, math.pi / 2, 0)))
    f = join(frame, "swing_frame")
    seat = [
        prim("cube", "seat", "wood", scale=(0.75, 0.32, 0.06), loc=(0, 0, -1.5)),
        prim("cyl", "ropeL", "cream", seg=4, r1=0.018, r2=0.018, depth=1.5, loc=(-0.32, 0, -0.75)),
        prim("cyl", "ropeR", "cream", seg=4, r1=0.018, r2=0.018, depth=1.5, loc=(0.32, 0, -0.75)),
    ]
    for k in range(5):
        seat.append(prim("ico", "garland", "flower-pink" if k % 2 else "flower-yellow", sub=0, loc=(-0.32 + (k % 2) * 0.64, 0, -0.3 - k * 0.22), scale=(0.05, 0.05, 0.05)))
    sw = join(seat, "SwingSeat")
    sw.location = (0, 0, 2.0)
    export(OUT / "swing.glb", [f, sw])

    # scarecrow
    reset()
    parts = [
        prim("cyl", "post", "wood-dark", seg=6, r1=0.06, r2=0.05, depth=1.75, loc=(0, 0, 0.87)),
        prim("cube", "bar", "wood-dark", scale=(1.2, 0.08, 0.08), loc=(0, 0, 1.3)),
        prim("cube", "shirt", "flower-blue", scale=(0.5, 0.26, 0.55), loc=(0, 0, 1.18)),
        prim("cyl", "sleeves", "flower-blue", seg=6, r1=0.1, r2=0.1, depth=1.1, loc=(0, 0, 1.3), rot=(0, math.pi / 2, 0)),
        prim("uv", "head", "cream", u=12, v=8, loc=(0, 0, 1.68), scale=(0.22, 0.22, 0.22)),
        prim("cyl", "brim", "wheat", seg=12, r1=0.36, r2=0.34, depth=0.04, loc=(0, 0, 1.86)),
        prim("cyl", "crown", "wheat", seg=10, r1=0.2, r2=0.06, depth=0.3, loc=(0, 0, 2.02)),
        prim("cube", "eyeL", "ink", scale=(0.05, 0.02, 0.05), loc=(-0.08, -0.21, 1.72)),
        prim("cube", "eyeR", "ink", scale=(0.05, 0.02, 0.05), loc=(0.08, -0.21, 1.72)),
        prim("cube", "smile", "ink", scale=(0.16, 0.02, 0.025), loc=(0, -0.21, 1.6)),
        prim("cube", "patch", "flower-pink", scale=(0.14, 0.02, 0.14), loc=(0.12, -0.14, 1.1)),
    ]
    for x in (-0.62, 0.62):
        parts.append(prim("cyl", "straw", "wheat", seg=5, r1=0.09, r2=0.0, depth=0.18, loc=(x, 0, 1.3), rot=(0, math.copysign(math.pi / 2, x), 0)))
    export(OUT / "scarecrow.glb", [join(parts, "scarecrow")])

    # leaf solar lamp: a stem, a leaf-shaped panel with brass veins, a little lamp underneath
    reset()
    parts = [
        prim("cyl", "stem", "moss", seg=6, r1=0.07, r2=0.05, depth=1.7, loc=(0, 0, 0.85)),
        prim("cyl", "stem2", "moss", seg=6, r1=0.05, r2=0.04, depth=0.6, loc=(0, -0.18, 1.85), rot=(-0.6, 0, 0)),
        prim("uv", "panel", "solar", u=12, v=8, loc=(0, -0.45, 2.15), scale=(0.55, 0.85, 0.05), rot=(0.5, 0, 0)),
        prim("cube", "vein", "brass", scale=(0.04, 1.6, 0.03), loc=(0, -0.45, 2.18), rot=(0.5, 0, 0)),
        prim("ico", "bulb", "window", sub=1, loc=(0, -0.55, 1.75), scale=(0.1, 0.1, 0.12)),
        prim("cyl", "cap", "brass", seg=6, r1=0.03, r2=0.11, depth=0.08, loc=(0, -0.55, 1.86)),
        prim("ico", "leafA", "foliage", sub=1, loc=(0.15, 0.05, 0.5), scale=(0.22, 0.08, 0.12), rot=(0, 0.5, 0.4)),
        prim("ico", "leafB", "foliage", sub=1, loc=(-0.16, 0.0, 0.9), scale=(0.2, 0.08, 0.1), rot=(0, -0.5, -0.4)),
    ]
    for k in (-1, 1):
        parts.append(prim("cube", "rib", "brass", scale=(0.5, 0.025, 0.02), loc=(k * 0.2, -0.45, 2.17), rot=(0.5, 0, k * 0.5)))
    export(OUT / "solar_leaf.glb", [join(parts, "solar_leaf")])

    # rain barrel with a copper pipe
    reset()
    parts = [
        prim("cyl", "low", "wood", seg=12, r1=0.32, r2=0.39, depth=0.42, loc=(0, 0, 0.21)),
        prim("cyl", "high", "wood", seg=12, r1=0.39, r2=0.33, depth=0.42, loc=(0, 0, 0.63)),
        prim("cyl", "band1", "brass", seg=12, r1=0.37, r2=0.37, depth=0.05, loc=(0, 0, 0.2)),
        prim("cyl", "band2", "brass", seg=12, r1=0.37, r2=0.37, depth=0.05, loc=(0, 0, 0.66)),
        prim("cyl", "water", "water", seg=12, r1=0.3, r2=0.3, depth=0.02, loc=(0, 0, 0.8)),
        prim("cyl", "pipe", "brass", seg=6, r1=0.05, r2=0.05, depth=1.1, loc=(0.32, 0.1, 1.2)),
        prim("cyl", "elbow", "brass", seg=6, r1=0.05, r2=0.05, depth=0.35, loc=(0.2, 0.1, 0.78), rot=(0, 0.9, 0)),
        prim("cyl", "tap", "brass", seg=6, r1=0.04, r2=0.04, depth=0.18, loc=(0, -0.38, 0.18), rot=(math.pi / 2, 0, 0)),
        prim("ico", "leaf", "foliage", sub=1, loc=(-0.3, 0.2, 0.15), scale=(0.2, 0.2, 0.15)),
    ]
    export(OUT / "rain_barrel.glb", [join(parts, "rain_barrel")])

    # vine arch
    reset()
    parts = [
        prim("cube", "postL", "wood-dark", scale=(0.12, 0.12, 2.0), loc=(-0.85, 0, 1.0)),
        prim("cube", "postR", "wood-dark", scale=(0.12, 0.12, 2.0), loc=(0.85, 0, 1.0)),
    ]
    for k in range(13):
        a = math.pi * k / 12
        x, z = math.cos(a) * 0.85, 2.0 + math.sin(a) * 0.55
        parts.append(prim("cube", "arc", "wood-dark", scale=(0.12, 0.12, 0.26), loc=(x, 0, z), rot=(0, -a + math.pi / 2, 0)))
        parts.append(prim("ico", "vine", rnd.choice(["foliage", "moss", "foliage"]), sub=1, loc=(x + rnd.uniform(-0.1, 0.1), rnd.uniform(-0.12, 0.12), z + rnd.uniform(-0.05, 0.1)), scale=(0.2, 0.2, 0.18)))
        if k % 3 == 1:
            parts.append(prim("ico", "bloom", rnd.choice(["flower-pink", "flower-yellow", "flower-white"]), sub=0, loc=(x, -0.18, z), scale=(0.08, 0.08, 0.08)))
    for z in (0.5, 1.1, 1.6):
        for x in (-0.85, 0.85):
            parts.append(prim("ico", "climb", "foliage", sub=1, loc=(x + rnd.uniform(-0.08, 0.08), -0.08, z), scale=(0.16, 0.12, 0.2)))
    export(OUT / "vine_arch.glb", [join(parts, "vine_arch")])

    # gazebo: hexagonal floor, six slim posts, a roof, a lantern hanging inside
    reset()
    parts = [
        prim("cyl", "floor", "wood", seg=6, r1=1.7, r2=1.7, depth=0.18, loc=(0, 0, 0.09)),
        prim("cyl", "step", "wood-dark", seg=6, r1=1.82, r2=1.82, depth=0.06, loc=(0, 0, 0.03)),
        prim("cyl", "roof", "foliage-teal", seg=6, r1=2.15, r2=0.05, depth=1.1, loc=(0, 0, 2.85)),
        prim("cyl", "eave", "cream", seg=6, r1=2.1, r2=2.1, depth=0.12, loc=(0, 0, 2.3)),
        prim("ico", "finial", "brass", sub=1, loc=(0, 0, 3.45), scale=(0.12, 0.12, 0.16)),
        prim("cyl", "chain", "brass", seg=4, r1=0.015, r2=0.015, depth=0.4, loc=(0, 0, 2.1)),
        prim("cyl", "lantern", "window", seg=6, r1=0.14, r2=0.14, depth=0.24, loc=(0, 0, 1.8)),
        prim("cyl", "lcap", "brass", seg=6, r1=0.03, r2=0.17, depth=0.08, loc=(0, 0, 1.95)),
    ]
    for k in range(6):
        a = k * math.pi / 3
        parts.append(prim("cyl", "post", "cream", seg=6, r1=0.07, r2=0.07, depth=2.15, loc=(math.cos(a) * 1.5, math.sin(a) * 1.5, 1.2)))
        if k != 4:  # leave the front open
            mid = a + math.pi / 6
            parts.append(prim("cube", "rail", "cream", scale=(1.45, 0.06, 0.06), loc=(math.cos(mid) * 1.3, math.sin(mid) * 1.3, 0.62), rot=(0, 0, mid + math.pi / 2)))
    export(OUT / "gazebo.glb", [join(parts, "gazebo")])

    # flower bed
    reset()
    parts = [
        prim("cube", "box", "wood", scale=(1.3, 0.62, 0.32), loc=(0, 0, 0.16)),
        prim("cube", "soil", "soil", scale=(1.18, 0.5, 0.04), loc=(0, 0, 0.32)),
    ]
    for k in range(7):
        x = -0.48 + k * 0.16
        y = rnd.uniform(-0.12, 0.12)
        col = rnd.choice(["flower-pink", "flower-yellow", "flower-blue", "flower-white"])
        parts.append(prim("cyl", "stem", "moss", seg=4, r1=0.02, r2=0.02, depth=0.3, loc=(x, y, 0.47)))
        parts.append(prim("ico", "bloom", col, sub=1, loc=(x, y, 0.64), scale=(0.09, 0.09, 0.06)))
        parts.append(prim("ico", "eye", "flower-yellow" if col != "flower-yellow" else "flower-white", sub=0, loc=(x, y - 0.02, 0.68), scale=(0.035, 0.035, 0.03)))
    export(OUT / "flower_bed.glb", [join(parts, "flower_bed")])

    # tall lamp post
    reset()
    parts = [
        prim("cyl", "base", "rock", seg=6, r1=0.2, r2=0.16, depth=0.18, loc=(0, 0, 0.09)),
        prim("cyl", "pole", "ink", seg=6, r1=0.05, r2=0.04, depth=2.3, loc=(0, 0, 1.25)),
        prim("cyl", "glass", "window", seg=6, r1=0.16, r2=0.12, depth=0.32, loc=(0, 0, 2.5)),
        prim("cyl", "cap", "brass", seg=6, r1=0.03, r2=0.22, depth=0.14, loc=(0, 0, 2.72)),
        prim("ico", "top", "brass", sub=0, loc=(0, 0, 2.84), scale=(0.05, 0.05, 0.06)),
    ]
    export(OUT / "lamp_post.glb", [join(parts, "lamp_post")])

    # crystal lamp: a glowing crystal on a stone pedestal
    reset()
    parts = [
        prim("cyl", "pedestal", "rock", seg=6, r1=0.32, r2=0.24, depth=0.7, loc=(0, 0, 0.35)),
        prim("cyl", "top", "rock-dark", seg=6, r1=0.3, r2=0.3, depth=0.08, loc=(0, 0, 0.74)),
    ]
    sh = crystal_shard("shard", "crystal", 0.55, 0.16, 3)
    sh.data.transform(Matrix.Translation((0, 0, 0.72)))
    sh2 = crystal_shard("shard2", "crystal-deep", 0.3, 0.1, 4)
    sh2.data.transform(Matrix.Rotation(0.5, 4, "Y") @ Matrix.Translation((0.05, 0, 0.0)))
    sh2.data.transform(Matrix.Translation((0.12, 0, 0.72)))
    export(OUT / "crystal_lamp.glb", [join(parts + [sh, sh2], "crystal_lamp")])

    # campfire: stones, logs, and three flames the game flickers
    reset()
    parts = []
    for k in range(9):
        a = k * math.tau / 9
        parts.append(prim("ico", "stone", "rock", sub=0, loc=(math.cos(a) * 0.55, math.sin(a) * 0.55, 0.08), scale=(0.15, 0.13, 0.11)))
    for a in (0.3, -0.5, 1.4):
        parts.append(prim("cyl", "log", "bark-dark", seg=6, r1=0.08, r2=0.08, depth=0.85, loc=(0, 0, 0.12), rot=(0, math.pi / 2, a)))
    base = join(parts, "campfire_base")
    flames = []
    for i, (tok, r, h) in enumerate([("flame", 0.24, 0.6), ("flame", 0.17, 0.5), ("window", 0.1, 0.36)]):
        fl = prim("cyl", f"Flame{i}", tok, seg=7, r1=r, r2=0.0, depth=h, loc=(0, 0, h / 2))
        fl.location = ((i - 1) * 0.08, 0, 0.12)
        fl.name = f"Flame{i}"
        flames.append(fl)
    export(OUT / "campfire.glb", [base] + flames)

def main():
    for name, (src, scale, *extra) in KENNEY_PROPS.items():
        build_kenney(name, src, scale, extra[0] if extra else None)
    build_cottage()
    build_greenhouse()
    build_windmill()
    build_trees()
    build_flowers()
    build_bunny()
    build_lantern()
    build_island_decor()
    build_garden()


if __name__ == "__main__":
    main()
