"""Exporta variações de pessoas MakeHuman (com esqueleto) em .glb leves para a maquete interativa."""
import sys, os, json, math, random
import bpy, bmesh, addon_utils
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
addon_utils.enable('cycles', default_set=True)
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.join(HERE, 'pessoas')
os.makedirs(OUT, exist_ok=True)
import mhpeople as mh

YEL, ORA, GRN, LIM = (.95, .80, .08), (.95, .40, .06), (.22, .62, .34), (.80, .86, .26)
NAVY, ORCAP = (.03, .06, .13), (.92, .40, .10)
HC = [(.06, .045, .035), (.12, .08, .05), (.25, .16, .09), (.03, .025, .02), (.4, .3, .18)]
VARIANTS = [  # (papéis, gênero, raça, colete, cabelo, boné)
    (['inducao', 'setup'], 1, {'african': 1}, YEL, ('short', HC[3]), None),
    (['inducao', 'setup'], 0, {'caucasian': .7, 'african': .3}, YEL, ('long', HC[2]), None),
    (['inducao', 'setup'], 1, {'caucasian': 1}, YEL, ('short', HC[1]), NAVY),
    (['inducao', 'setup'], 1, {'asian': .7, 'caucasian': .3}, YEL, ('short', HC[0]), ORCAP),
    (['pescador', 'separador'], 1, {'caucasian': .5, 'african': .5}, ORA, ('short', HC[0]), NAVY),
    (['pescador', 'separador'], 0, {'asian': 1}, ORA, ('long', HC[3]), None),
    (['pescador', 'separador'], 1, {'caucasian': 1}, ORA, ('short', HC[4]), None),
    (['pescador', 'separador'], 1, {'african': 1}, ORA, ('short', HC[3]), None),
    (['goleiro'], 1, {'caucasian': .6, 'asian': .4}, GRN, ('short', HC[1]), NAVY),
    (['goleiro'], 0, {'african': .6, 'caucasian': .4}, GRN, ('long', HC[0]), None),
    (['paleteiro', 'carregador'], 1, {'caucasian': 1}, LIM, ('short', HC[2]), None),
    (['paleteiro', 'carregador'], 1, {'african': .7, 'caucasian': .3}, LIM, ('short', HC[3]), NAVY),
]
TONE = lambda r: 0 if r.get('caucasian', 0) > .8 else 4 if r.get('african', 0) > .8 else 1 if r.get('asian', 0) > .8 else 3 if r.get('african', 0) >= .5 else 2

def flat_material(mat, color=None, rough=None, metal=0.0):
    """Troca a árvore de nós por um Principled simples (o que o glTF exporta)."""
    nt = mat.node_tree; p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if color is None and p is not None:
        bc = p.inputs['Base Color']
        if bc.is_linked:
            src = bc.links[0].from_node
            color = tuple(src.inputs[6].default_value[:3]) if src.type == 'MIX' else tuple(bc.default_value[:3])
        else:
            color = tuple(bc.default_value[:3])
    if rough is None and p is not None:
        rough = p.inputs['Roughness'].default_value
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Roughness'].default_value = rough or .7
    p.inputs['Metallic'].default_value = metal
    nt.links.new(p.outputs[0], out.inputs['Surface'])

def simple_mat(name, color, rough, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; flat_material(m, color, rough, metal); return m

index = []
for i, (roles, g, race, vest, hair, cap) in enumerate(VARIANTS):
    bpy.ops.wm.read_factory_settings(use_empty=True); mh.MATS.clear()
    rnd = random.Random(i)
    rig = mh.build_variant(f'v{i:02d}', float(g), race, rnd.uniform(.45, .65), rnd.uniform(.4, .65),
                           rnd.uniform(.4, .55), mh.SKIN_TONES[TONE(race)], vest, hair=hair, cap=cap, seed=i)
    objs = [o for o in bpy.data.objects if o.type == 'MESH']
    refl = simple_mat('refletivo', (.62, .64, .66), .22, .55)
    iris = simple_mat('iris', mh.lin((.22, .14, .07)), .15); pupil = simple_mat('pupila', (.01, .01, .01), .1)
    for o in objs:
        for md in [m for m in o.modifiers if m.type in ('SUBSURF', 'PARTICLE_SYSTEM')]:
            o.modifiers.remove(md)
        me = o.data
        if o.name.startswith('colete'):        # faixas refletivas viram material próprio
            col = me.color_attributes.get('marca')
            me.materials.append(refl)
            for p in me.polygons:
                if col and sum(col.data[v].color[0] for v in p.vertices) / len(p.vertices) > .5:
                    p.material_index = len(me.materials) - 1
        if o.name.startswith('olho'):          # esclera, íris e pupila por face
            me.materials.clear(); me.materials.append(simple_mat('esclera', (.82, .8, .76), .1))
            me.materials.append(iris); me.materials.append(pupil)
            for p in me.polygons:
                y = p.center.y
                p.material_index = 2 if y < -.93 else 1 if y < -.72 else 0
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        if o.name.startswith(('bota', 'colete')):   # bota sem dedos marcados; colete com recorte limpo
            bm = bmesh.new(); bm.from_mesh(me)
            boot = o.name.startswith('bota')
            for _ in range(25 if boot else 12):
                bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=.5, use_axis_x=True, use_axis_y=boot, use_axis_z=True)
            if boot:   # um pouco mais volumosa, cobrindo o pé do corpo
                for sgn in (-1, 1):
                    vs = [v for v in bm.verts if v.co.x * sgn > 0]
                    if not vs: continue
                    cx = sum(v.co.x for v in vs) / len(vs); cy = sum(v.co.y for v in vs) / len(vs)
                    for v in vs:
                        v.co.x = cx + (v.co.x - cx) * 1.12; v.co.y = cy + (v.co.y - cy) * 1.04
            bm.normal_update(); bm.to_mesh(me); bm.free()
        if o.name.startswith('corpo'):         # malha mais leve para tempo real
            bpy.context.view_layer.objects.active = o
            d = o.modifiers.new('leve', 'DECIMATE'); d.ratio = .5
            bpy.ops.object.modifier_move_to_index(modifier='leve', index=0)
            bpy.ops.object.modifier_apply(modifier='leve')
    for m in bpy.data.materials:
        if m.use_nodes and m.name not in ('refletivo', 'iris', 'pupila', 'esclera') and not m.name.startswith(('esclera', 'iris', 'pupila', 'refletivo')):
            flat_material(m)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [rig] + list(rig.children_recursive):
        o.select_set(True)
    fn = f'pessoa_{i:02d}.glb'
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, fn), export_format='GLB', use_selection=True,
                              export_skins=True, export_animations=False, export_apply=False, export_yup=True,
                              export_texcoords=False, export_normals=True, export_vertex_color='NONE')
    index.append({'arquivo': fn, 'papeis': roles, 'feminino': g == 0})
    print('exportado', fn, os.path.getsize(os.path.join(OUT, fn)) // 1024, 'KB', flush=True)
json.dump(index, open(os.path.join(OUT, 'pessoas.json'), 'w'), ensure_ascii=False, indent=1)
