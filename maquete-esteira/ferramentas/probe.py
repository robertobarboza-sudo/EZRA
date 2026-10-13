import bpy, time, mathutils, addon_utils
addon_utils.enable('cycles', default_set=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
t = time.time()
bpy.ops.import_scene.gltf(filepath='/tmp/claude-0/-home-user-EZRA/e079a19d-b652-513c-878e-8dd49b3b954c/scratchpad/render/cena.glb')
print('import', round(time.time() - t, 1), 's')
objs = bpy.data.objects
marks = [o for o in objs if o.name.startswith('marcador_')]
print('objetos', len(objs), 'marcadores', len(marks), 'malhas', sum(o.type == 'MESH' for o in objs))
for m in marks[:4]: print(m.name, tuple(round(v, 2) for v in m.matrix_world.translation), round(m.matrix_world.to_euler().z, 2))
tris = sum(len(o.data.polygons) for o in objs if o.type == 'MESH'); print('faces', tris)
import collections; print(collections.Counter(o.name.split('_')[0] for o in objs).most_common(12))
