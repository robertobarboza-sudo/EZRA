import sys, bpy, addon_utils, time, math
sys.path.insert(0, '/tmp/claude-0/-home-user-EZRA/e079a19d-b652-513c-878e-8dd49b3b954c/scratchpad/render')
addon_utils.enable('cycles', default_set=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
import mhpeople as mh
t = time.time()
r1 = mh.build_variant('a', 1.0, {'african': .7, 'caucasian': .3}, .6, .5, .5, mh.SKIN_TONES[3], (.9, .32, .04), hair=('short', (.08, .06, .05)), seed=1)
mh.pose(r1, 'carry')
r2 = mh.build_variant('b', 0.0, {'caucasian': .8, 'asian': .2}, .5, .45, .45, mh.SKIN_TONES[0], (.93, .78, .06), hair=('long', (.35, .22, .12)), seed=2)
r2.location.x = .9; mh.pose(r2, 'stand')
r3 = mh.build_variant('c', 1.0, {'asian': .6, 'caucasian': .4}, .5, .6, .5, mh.SKIN_TONES[1], (.9, .32, .04), hair=('short', (.08, .06, .05)), cap=(.03, .07, .15), seed=3)
r3.location.x = -.9; mh.pose(r3, 'reach')
print('build', round(time.time() - t, 1))
for r in (r1, r2, r3):
    b = [o for o in r.children if o.type == 'MESH']
    print(r.name, 'altura', round(max((r.matrix_world @ v.co).z for o in b if o.name.startswith('corpo') for v in o.data.vertices), 2))
sc = bpy.context.scene
bpy.ops.mesh.primitive_plane_add(size=20)
fl = bpy.context.active_object; m = bpy.data.materials.new('chao'); m.use_nodes = True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.6, .6, .58, 1); fl.data.materials.append(m)
bpy.ops.object.light_add(type='AREA', location=(2, -3, 4)); L = bpy.context.active_object; L.data.energy = 900; L.data.size = 3
L.rotation_euler = (math.radians(45), 0, math.radians(35))
bpy.ops.object.light_add(type='AREA', location=(-3, -1, 3)); L2 = bpy.context.active_object; L2.data.energy = 300; L2.data.size = 4
L2.rotation_euler = (math.radians(50), 0, math.radians(-60))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = .4
bpy.ops.object.camera_add(location=(0.1, -3.4, 1.35), rotation=(math.radians(87), 0, 0)); cam = bpy.context.active_object; sc.camera = cam
cam.data.lens = 50
sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1200, 800
sc.render.filepath = '/tmp/claude-0/-home-user-EZRA/e079a19d-b652-513c-878e-8dd49b3b954c/scratchpad/render/teste_pessoas.png'
t = time.time(); bpy.ops.render.render(write_still=True); print('render', round(time.time() - t, 1))
