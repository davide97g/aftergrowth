"""Export KayKit Furniture Bits (CC0) pieces for the cottage interior as single .glb files.

Each piece keeps KayKit's gradient-atlas texture (the game gives it the toon ramp), is joined into
one mesh and sits with its base centred on the origin.

Usage: blender -b -P tools/blender/build_furniture.py
"""
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

sys.path.insert(0, str(Path(__file__).parent))
from build_props import ROOT, export, join, reset  # noqa: E402

SRC = ROOT / "assets/raw/kaykit-furniture/KayKit-Furniture-Bits-1.0-main/addons/kaykit_furniture_bits/Assets/gltf"
OUT = ROOT / "public/assets/furniture"
PIECES = [
    "armchair_pillows", "bed_double_A", "shelf_B_large_decorated", "shelf_A_big", "table_low", "table_small",
    "lamp_standing", "lamp_table", "rug_oval_A", "cabinet_small_decorated", "book_set", "pictureframe_large_A",
    "pictureframe_standing_A", "chair_stool_wood", "pillow_A", "cactus_small_A",
]


def build(name):
    reset()
    bpy.ops.import_scene.gltf(filepath=str(SRC / f"{name}.gltf"))
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
    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    zs = [v.co.z for v in o.data.vertices]
    o.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    export(OUT / f"{name}.glb", [o])


if __name__ == "__main__":
    for p in PIECES:
        build(p)
