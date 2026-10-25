"""Print objects, materials, armature and actions of a glTF file.
Usage: blender -b -P tools/blender/inspect.py -- <file.glb>
"""
import sys
import bpy

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
for o in bpy.data.objects:
    dims = tuple(round(d, 2) for d in o.dimensions)
    mats = [s.material.name for s in getattr(o, "material_slots", []) if s.material]
    extra = f" verts={len(o.data.vertices)}" if o.type == "MESH" else ""
    print(f"OBJ {o.name} [{o.type}] parent={o.parent.name if o.parent else None} dims={dims}{extra} mats={mats}")
for m in bpy.data.materials:
    print("MAT", m.name)
print("ACTIONS", len(bpy.data.actions), sorted(a.name for a in bpy.data.actions))
