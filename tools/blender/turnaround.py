"""Render a character glTF from front, three-quarter, side, back and three-quarter-back in one strip.
Usage: blender -b -P tools/blender/turnaround.py -- <out.png> <file.glb>
"""
import math
import sys

import bpy
from mathutils import Vector

out, path = sys.argv[sys.argv.index("--") + 1:][:2]
YAWS = [0, 45, 90, 180, 225]  # model turned by this much in front of a fixed camera looking +Y

bpy.ops.wm.read_factory_settings(use_empty=True)
height = 0.0
for i, yaw in enumerate(YAWS):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = set(bpy.data.objects) - before
    if i == 0:
        bpy.context.view_layer.update()
        zs = [(o.matrix_world @ Vector(c)).z for o in new if o.type == "MESH" for c in o.bound_box]
        height = max(zs) - min(zs)
    for o in new:
        if o.parent is None:
            o.rotation_mode = "XYZ"  # the glTF importer leaves quaternions on
            o.rotation_euler.z = math.radians(yaw)
            o.location.x = (i - (len(YAWS) - 1) / 2) * height * 0.8

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1500, 400
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.45, 0.7, 0.25, 1)
scene.world = world
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(25))
scene.collection.objects.link(sun)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type = "ORTHO"
scene.collection.objects.link(cam)
scene.camera = cam
pitch = math.radians(25)
cz = height / 2
cam.location = Vector((0, -30 * math.cos(pitch), cz + 30 * math.sin(pitch)))
cam.rotation_euler = (math.radians(90) - pitch, 0, 0)
cam.data.ortho_scale = height * 0.8 * len(YAWS)
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
