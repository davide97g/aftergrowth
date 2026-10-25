"""Render an isometric preview PNG of one or more glTF files laid out in a row.
Usage: blender -b -P tools/blender/preview.py -- <out.png> <file1.glb> [file2.glb ...]
"""
import math
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out, files = args[0], args[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)

x = 0.0
for f in files:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    meshes = [o for o in new if o.type == "MESH"]
    bpy.context.view_layer.update()
    xs = [(o.matrix_world @ Vector(c)).x for o in meshes for c in o.bound_box] or [0]
    width = max(xs) - min(xs)
    for r in roots:
        r.location.x += x - min(xs)
    x += width + 0.4

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1400, 800
scene.render.film_transparent = False
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.93, 1.0, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
scene.world = world
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
scene.collection.objects.link(sun)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type = "ORTHO"
scene.collection.objects.link(cam)
scene.camera = cam
meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.visible_get()]
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
center = sum(pts, Vector()) / len(pts)
size = max((p - center).length for p in pts)
d = Vector((1, -1, 0.9)).normalized()
cam.location = center + d * size * 4
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.ortho_scale = size * 2.2
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
