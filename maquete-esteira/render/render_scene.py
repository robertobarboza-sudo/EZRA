"""Render fotorrealista (Cycles) da maquete com pessoas MakeHuman nos marcadores exportados pela página."""
import sys, os, json, math, random, time
import bpy, addon_utils
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
addon_utils.enable('cycles', default_set=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
import mhpeople as mh

SHOTS = sys.argv[sys.argv.index('--') + 1].split(',') if '--' in sys.argv else ['ilha', 'eixo', 'aerea', 'inducao', 'goleiro']
RES = tuple(int(v) for v in os.environ.get('RES', '1600x900').split('x')); SAMPLES = int(os.environ.get('SAMPLES', 96))
L = json.load(open(f'{HERE}/layout.json'))
t3 = lambda x, y, z: Vector((x, -z, y))           # three.js -> Blender

bpy.ops.import_scene.gltf(filepath=f'{HERE}/cena.glb')
sc = bpy.context.scene

# volumes que ficaram "no ar" (estavam nas mãos dos bonecos removidos)
for o in list(bpy.data.objects):
    if o.type != 'MESH' or o.name.startswith(('fixo_', 'scuttle', 'gaiola', 'paleteira')) or o.parent and o.parent.name.startswith(('scuttle', 'gaiola', 'paleteira')):
        continue
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    dims = Vector((max(v.x for v in bb) - min(v.x for v in bb), max(v.y for v in bb) - min(v.y for v in bb), max(v.z for v in bb) - min(v.z for v in bb)))
    if max(dims) < .8 and min(v.z for v in bb) > 1.0:
        bpy.data.objects.remove(o)

# pessoas: uma por marcador, colete e pose pela função
VEST = {'inducao': (.95, .80, .08), 'pescador': (.95, .40, .06), 'separador': (.95, .40, .06), 'goleiro': (.22, .62, .34),
        'paleteiro': (.80, .86, .26), 'setup': (.95, .80, .08), 'carregador': (.80, .86, .26)}
POSE = {'inducao': 'reach', 'pescador': 'reach', 'separador': 'carry', 'goleiro': 'reach', 'paleteiro': 'pull', 'setup': 'push', 'carregador': 'pull'}
RACES = [{'caucasian': 1}, {'african': 1}, {'asian': 1}, {'caucasian': .5, 'african': .5}, {'caucasian': .6, 'asian': .4}, {'african': .6, 'caucasian': .4}]
TONE_BY = lambda r: 0 if r.get('caucasian', 0) > .8 else 4 if r.get('african', 0) > .8 else 1 if r.get('asian', 0) > .8 else 3 if r.get('african', 0) >= .5 else 2
HAIRC = [(.06, .045, .035), (.12, .08, .05), (.25, .16, .09), (.03, .025, .02), (.4, .3, .18)]
t = time.time()
marks = sorted([o for o in bpy.data.objects if o.name.startswith('marcador_')], key=lambda o: o.name)
for i, m in enumerate(marks):
    role = m.name.split('_')[1]
    rnd = random.Random(1000 + i)
    female = rnd.random() < .38
    race = rnd.choice(RACES); tone = mh.SKIN_TONES[TONE_BY(race)]
    cap = rnd.choice([(.03, .06, .13), None, None]) if role in ('inducao', 'pescador', 'goleiro', 'paleteiro') else rnd.choice([None, (.92, .4, .1)])
    hair = ('long' if female and rnd.random() < .75 else 'short', rnd.choice(HAIRC))
    rig = mh.build_variant(f'{i:02d}', 0.0 if female else 1.0, race, rnd.uniform(.4, .7), rnd.uniform(.35, .7),
                           rnd.uniform(.38, .55) if not female else rnd.uniform(.4, .6), tone, VEST.get(role, (.95, .4, .06)),
                           hair=hair, cap=cap, seed=i)
    rig.matrix_world = m.matrix_world.normalized()
    bpy.context.view_layer.update()
    mh.pose(rig, POSE.get(role, 'stand'), rnd)
    if role == 'separador':          # volume nas mãos
        bpy.context.view_layer.update()
        hl = rig.matrix_world @ rig.pose.bones['wrist.L'].head; hr = rig.matrix_world @ rig.pose.bones['wrist.R'].head
        fwd = (rig.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()
        c = (hl + hr) / 2 + fwd * .1 + Vector((0, 0, .06))
        bpy.ops.mesh.primitive_cube_add(size=1, location=c); b = bpy.context.active_object
        b.scale = (.42, .32, .3); b.rotation_euler = rig.matrix_world.to_euler()
        b.data.materials.append(mh.cloth_mat('papelao_caixa', (.72, .55, .36), .8, 0, 200))
print('pessoas', len(marks), round(time.time() - t, 1), 's')

# luz: céu físico + sol suave + preenchimento de estúdio
w = bpy.data.worlds.new('ceu'); sc.world = w; w.use_nodes = True
nt = w.node_tree; bg = nt.nodes['Background']
bg.inputs[0].default_value = (.62, .64, .66, 1); bg.inputs[1].default_value = .55   # fundo neutro de estúdio
bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, -.62)); gnd = bpy.context.active_object
gm = mh.cloth_mat('mesa_maquete', (.70, .71, .72), .9, 0, 30); gnd.data.materials.append(gm)
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.active_object
sun.data.energy = 3.2; sun.data.angle = math.radians(2.5); sun.rotation_euler = (math.radians(42), 0, math.radians(-35))
cx = (L['xWest'] + L['xEast']) / 2
bpy.ops.object.light_add(type='AREA', location=(cx, 0, 18)); fill = bpy.context.active_object
fill.data.energy = 9000; fill.data.size = 60; fill.data.size_y = 25; fill.data.shape = 'RECTANGLE'

# câmeras
def camera(name, pos, tgt, lens=35, fstop=None):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_width = 36
    co = bpy.data.objects.new(name, cd); sc.collection.objects.link(co)
    co.location = pos; co.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
    if fstop:
        cd.dof.use_dof = True; cd.dof.focus_distance = (tgt - pos).length; cd.dof.aperture_fstop = fstop
    return co
isl = bpy.data.objects.get('ilha_02')
loc = lambda x, y, z: isl.matrix_world @ Vector((x, -z, y))
hw = L['bw'] / 2
CAMS = {
    'ilha': (loc(L['rackW'] / 2 + L['P']['corredorFlow'] / 2, 1.62, L['rack1'] + 1.6), loc(-.4, .95, L['rack0'] * .5), 28, 2.8),
    'eixo': (t3(L['X0'] - 12, 9.6, .01), t3(L['X0'] + 30, 0, 0), 32, None),
    'aerea': (t3(cx - 30, 36, 40), t3(cx - 3, 0, -1), 35, None),
    'inducao': (t3(L['X0'] + L['ind'] + 1.6, 1.75, .35), t3(L['X0'] + 1.5, 1.0, 0), 30, 3.5),
    'goleiro': (t3(L['golX'] + 4.2, 2.1, hw + 4.2), t3(L['golX'] - .2, .95, 0), 30, 3.2),
}
sc.render.engine = 'CYCLES'
if os.environ.get('GPU'):   # GPU=OPTIX ou GPU=CUDA para usar a placa de vídeo
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = os.environ['GPU']; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = 'GPU'
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 3; sc.cycles.transparent_max_bounces = 16
sc.render.resolution_x, sc.render.resolution_y = RES
try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
sc.render.image_settings.file_format = 'PNG'
for name in SHOTS:
    p, tg, lens, f = CAMS[name]
    sc.camera = camera(name, p, tg, lens, f)
    sc.render.filepath = f'{HERE}/render_{name}.png'
    t = time.time(); bpy.ops.render.render(write_still=True); print('render', name, round(time.time() - t, 1), 's', flush=True)
    img = bpy.data.images.load(sc.render.filepath); img.file_format = 'JPEG'
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
    img.save_render(sc.render.filepath.replace('.png', '.jpg')); sc.render.image_settings.file_format = 'PNG'
