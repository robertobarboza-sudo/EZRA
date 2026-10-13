"""Pessoas realistas a partir do MakeHuman (CC0): malha-base, alvos de forma, esqueleto e pesos.

Gera corpos variados (gênero, origem, peso, musculatura, altura), veste uniforme de operação
(camisa azul-marinho, calça, botas, luvas, colete refletivo), cabelo por partículas e poses por função.
"""
import bpy, bmesh, json, math, os, random
import numpy as np
from mathutils import Vector, Matrix, Quaternion

MH = os.environ.get('MH_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mh'))

# ---------------------------------------------------------------- dados-base
def _load_obj():
    verts, groups, g = [], {}, None
    for line in open(f'{MH}/3dobjs/base.obj'):
        if line.startswith('v '):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '):
            g = line[2:].strip()
        elif line.startswith('f '):
            groups.setdefault(g, []).append([int(p.split('/')[0]) - 1 for p in line.split()[1:]])
    return np.array(verts, dtype=np.float64), groups

BASE, GROUPS = _load_obj()
TARGETS = np.load(f'{MH}/makehuman/data/targets.npz', allow_pickle=True)
SKEL = json.load(open(f'{MH}/rigs/default.mhskel'))
WEIGHTS = json.load(open(f'{MH}/rigs/default_weights.mhw'))['weights']

def _delta(name):
    k = 'targets/macrodetails/' + name
    if k + '.index' not in TARGETS:
        return None
    return TARGETS[k + '.index'].astype(np.int64), TARGETS[k + '.vector'].astype(np.float64) * 1e-3

def _tri(v, lo, mid, hi):
    if v < .5:
        a = (.5 - v) / .5
        return {lo: a, mid: 1 - a}
    a = (v - .5) / .5
    return {hi: a, mid: 1 - a}

def morph(gender=1.0, race=None, muscle=.5, weight=.5, height=.5):
    race = race or {'caucasian': 1.0}
    co = BASE.copy()
    gw = {'male': gender, 'female': 1 - gender}
    def add(name, w):
        if w <= 1e-4:
            return
        d = _delta(name)
        if d is not None:
            co[d[0]] += d[1] * w
    for r, rw in race.items():
        for g, gv in gw.items():
            add(f'{r}-{g}-young', rw * gv)
    mw, ww = _tri(muscle, 'minmuscle', 'averagemuscle', 'maxmuscle'), _tri(weight, 'minweight', 'averageweight', 'maxweight')
    hk = 'maxheight' if height >= .5 else 'minheight'
    hv = abs(height - .5) / .5
    for g, gv in gw.items():
        for m, mv in mw.items():
            for w, wv in ww.items():
                add(f'universal-{g}-young-{m}-{w}', gv * mv * wv)
                add(f'height/{g}-young-{m}-{w}-{hk}', gv * mv * wv * hv)
                add(f'proportions/{g}-young-{m}-{w}-idealproportions', gv * mv * wv * .6)
    # MakeHuman: y para cima, z para frente, decímetros  ->  Blender: z para cima, -y para frente, metros
    out = np.empty_like(co)
    out[:, 0], out[:, 1], out[:, 2] = co[:, 0] * .1, -co[:, 2] * .1, co[:, 1] * .1
    out[:, 2] -= out[:, 2].min()   # pés no chão
    return out

# ---------------------------------------------------------------- categorias (roupa) por osso dominante
def _cat(bone):
    b = bone.split('.')[0]
    if b.startswith(('foot', 'toe')):
        return 'boots'
    if b.startswith(('finger', 'metacarpal', 'wrist')):
        return 'gloves'
    if b.startswith(('upperleg', 'lowerleg', 'pelvis', 'root')):
        return 'pants'
    if b.startswith(('spine', 'clavicle', 'shoulder', 'breast', 'upperarm', 'lowerarm')):
        return 'shirt'   # tronco, ombros, braços
    return 'skin'        # cabeça, rosto, pescoço

_dom = np.full(len(BASE), '', dtype=object)
_domw = np.zeros(len(BASE))
for bone, lst in WEIGHTS.items():
    for v, w in lst:
        if w > _domw[v]:
            _domw[v], _dom[v] = w, bone
VCAT = np.array([_cat(b) if b else 'skin' for b in _dom], dtype=object)

MATS = {}
lin = lambda c: tuple((x / 12.92) if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)
def _mat(name, build):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    build(m.node_tree)
    MATS[name] = m
    return m

def _principled(nt):
    return next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')

def skin_mat(tone):
    def b(nt):
        p = _principled(nt)
        tl = lin(tone)
        p.inputs['Base Color'].default_value = (*tl, 1)
        p.inputs['Roughness'].default_value = .5
        p.inputs['Subsurface Weight'].default_value = .18
        p.inputs['Subsurface Radius'].default_value = (1.0, .35, .2)
        p.inputs['Subsurface Scale'].default_value = .012
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 900
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .05
        nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], p.inputs['Normal'])
        # íris/olhos e lábios por atributo de cor (pintado na malha em repouso)
        at = nt.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'marca'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        mix.inputs[6].default_value = (*tl, 1); mix.inputs[7].default_value = (*lin((.16, .11, .08)), 1)
        nt.links.new(at.outputs['Color'], mix.inputs[0]); nt.links.new(mix.outputs[2], p.inputs['Base Color'])
    return _mat(f'pele_{tone}', b)

def cloth_mat(name, color, rough=.85, sheen=.3, weave=600):
    color = lin(color)
    def b(nt):
        p = _principled(nt)
        p.inputs['Base Color'].default_value = (*color, 1)
        p.inputs['Roughness'].default_value = rough
        p.inputs['Sheen Weight'].default_value = sheen * .25
        p.inputs['Sheen Tint'].default_value = (*color, 1)
        n = nt.nodes.new('ShaderNodeTexWave'); n.inputs['Scale'].default_value = weave
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .08
        nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], p.inputs['Normal'])
        n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 8
        ramp = nt.nodes.new('ShaderNodeMix'); ramp.data_type = 'RGBA'; ramp.blend_type = 'MULTIPLY'
        ramp.inputs[0].default_value = .25; ramp.inputs[6].default_value = (*color, 1)
        nt.links.new(n2.outputs['Color'], ramp.inputs[7]); nt.links.new(ramp.outputs[2], p.inputs['Base Color'])
    return _mat(name, b)

def vest_mat(color):
    color = lin(color)
    def b(nt):
        p = _principled(nt)
        p.inputs['Roughness'].default_value = .62
        at = nt.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'marca'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        mix.inputs[6].default_value = (*color, 1); mix.inputs[7].default_value = (.62, .64, .66, 1)
        nt.links.new(at.outputs['Color'], mix.inputs[0]); nt.links.new(mix.outputs[2], p.inputs['Base Color'])
        rm = nt.nodes.new('ShaderNodeMix'); rm.data_type = 'FLOAT'
        rm.inputs[2].default_value = .62; rm.inputs[3].default_value = .18
        nt.links.new(at.outputs['Color'], rm.inputs[0]); nt.links.new(rm.outputs[0], p.inputs['Roughness'])
        mt = nt.nodes.new('ShaderNodeMix'); mt.data_type = 'FLOAT'
        mt.inputs[2].default_value = 0; mt.inputs[3].default_value = .55
        nt.links.new(at.outputs['Color'], mt.inputs[0]); nt.links.new(mt.outputs[0], p.inputs['Metallic'])
    return _mat(f'colete_{color}', b)

def hairshell_mat(color):
    color = lin(color)
    def b(nt):
        p = _principled(nt)
        p.inputs['Base Color'].default_value = (*color, 1)
        p.inputs['Roughness'].default_value = .42
        p.inputs['Coat Weight'].default_value = .15
        w = nt.nodes.new('ShaderNodeTexWave'); w.wave_type = 'BANDS'; w.bands_direction = 'Z'
        w.inputs['Scale'].default_value = 140; w.inputs['Distortion'].default_value = 6
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .25
        nt.links.new(w.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], p.inputs['Normal'])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = .35
        mx.inputs[6].default_value = (*color, 1); nt.links.new(w.outputs['Color'], mx.inputs[7]); nt.links.new(mx.outputs[2], p.inputs['Base Color'])
    return _mat(f'cabelo_{color}', b)

def eye_mat(iris):
    iris = lin(iris)
    def b(nt):
        p = _principled(nt)
        p.inputs['Roughness'].default_value = .05; p.inputs['Coat Weight'].default_value = 1
        tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Object'], sep.inputs[0])
        r1 = nt.nodes.new('ShaderNodeMath'); r1.operation = 'LESS_THAN'; r1.inputs[1].default_value = -.72
        nt.links.new(sep.outputs['Y'], r1.inputs[0])
        r2 = nt.nodes.new('ShaderNodeMath'); r2.operation = 'LESS_THAN'; r2.inputs[1].default_value = -.93
        nt.links.new(sep.outputs['Y'], r2.inputs[0])
        m1 = nt.nodes.new('ShaderNodeMix'); m1.data_type = 'RGBA'
        m1.inputs[6].default_value = (.82, .8, .76, 1); m1.inputs[7].default_value = (*iris, 1)
        nt.links.new(r1.outputs[0], m1.inputs[0])
        m2 = nt.nodes.new('ShaderNodeMix'); m2.data_type = 'RGBA'; m2.inputs[7].default_value = (.01, .01, .01, 1)
        nt.links.new(m1.outputs[2], m2.inputs[6]); nt.links.new(r2.outputs[0], m2.inputs[0])
        nt.links.new(m2.outputs[2], p.inputs['Base Color'])
    return _mat(f'olho_{iris}', b)

def hair_mat(melanin, redness=.3):
    def b(nt):
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        for n in list(nt.nodes):
            if n.type == 'BSDF_PRINCIPLED':
                nt.nodes.remove(n)
        h = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
        h.parametrization = 'MELANIN'
        h.inputs['Melanin'].default_value = melanin
        h.inputs['Melanin Redness'].default_value = redness
        h.inputs['Roughness'].default_value = .3
        nt.links.new(h.outputs[0], out.inputs['Surface'])
    return _mat(f'cabelo_{melanin}_{redness}', b)

SKIN_TONES = [(.93, .76, .64), (.84, .63, .50), (.70, .49, .36), (.52, .34, .23), (.36, .23, .15), (.88, .69, .55)]

# ---------------------------------------------------------------- corpo + esqueleto
def build_variant(key, gender, race, muscle, weight, height, tone, vest, hair=('short', .8), cap=None, seed=0):
    rnd = random.Random(seed)
    co = morph(gender, race, muscle, weight, height)
    keep = ['body']
    faces = [f for g in keep for f in GROUPS.get(g, [])]
    used = sorted({i for f in faces for i in f})
    remap = {v: i for i, v in enumerate(used)}
    me = bpy.data.meshes.new(f'corpo_{key}')
    me.from_pydata([tuple(co[v]) for v in used], [], [[remap[i] for i in f] for f in faces])
    me.update()
    obj = bpy.data.objects.new(f'corpo_{key}', me)
    bpy.context.collection.objects.link(obj)

    cats = {'skin': 0, 'shirt': 1, 'pants': 2, 'boots': 3, 'gloves': 4}
    obj.data.materials.append(skin_mat(tone))
    obj.data.materials.append(cloth_mat('camisa_marinho', (.035, .07, .14), .8, .35, 700))
    obj.data.materials.append(cloth_mat('calca_cinza', (.05, .055, .065), .82, .3, 500))
    obj.data.materials.append(cloth_mat('bota', (.018, .018, .02), .45, 0, 50))
    obj.data.materials.append(cloth_mat('luva', (.06, .065, .07), .7, .1, 900))
    hipj = Vector(co[SKEL['joints'][SKEL['bones']['upperleg01.L']['head']]].mean(axis=0)); waist = hipj.z + .085
    def vcat(v):
        c = VCAT[v]
        if c == 'shirt' and co[v][2] < waist and not _dom[v].startswith(('upperarm', 'lowerarm', 'shoulder', 'clavicle')):
            return 'pants'
        return c
    for poly, f in zip(me.polygons, faces):
        cs = [vcat(v) for v in f]
        poly.material_index = cats[max(set(cs), key=cs.count)]
        poly.use_smooth = True

    # marca: sobrancelhas (pintadas na pele, na pose de repouso)
    eye_vs = sorted({v for g in ('helper-l-eye', 'helper-r-eye') for f in GROUPS[g] for v in f})
    EYES = {}
    for g, side in (('helper-l-eye', 'L'), ('helper-r-eye', 'R')):
        vs = sorted({v for f in GROUPS[g] for v in f}); c = co[vs].mean(axis=0)
        EYES[side] = (Vector(c), float(np.linalg.norm(co[vs] - c, axis=1).max()))
    eye_z = co[eye_vs][:, 2].mean(); eye_y = co[eye_vs][:, 1].mean(); ex = abs(EYES['L'][0].x)
    col = me.color_attributes.new('marca', 'FLOAT_COLOR', 'POINT')
    for v, i in remap.items():
        x, y, z = co[v]
        brow = (eye_z + .016 < z < eye_z + .03) and (ex - .03 < abs(x) < ex + .028) and y < eye_y + .005 and VCAT[v] == 'skin'
        m = 0.0
        col.data[i].color = (m, m, m, 1)

    # esqueleto
    def jpos(name):
        return Vector(co[SKEL['joints'][name]].mean(axis=0))
    arm = bpy.data.armatures.new(f'esqueleto_{key}')
    rig = bpy.data.objects.new(f'esqueleto_{key}', arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, b in SKEL['bones'].items():
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = jpos(b['head']), jpos(b['tail'])
        if (eb.tail - eb.head).length < 1e-4:
            eb.tail = eb.head + Vector((0, 0, .01))
        pl = SKEL['planes'].get(b.get('rotation_plane') or '')
        if pl:
            p1, p2, p3 = (jpos(j) for j in pl)
            n = (p2 - p1).cross(p3 - p1)
            if n.length > 1e-8:
                eb.align_roll(n.normalized())
    for name, b in SKEL['bones'].items():
        if b['parent']:
            arm.edit_bones[name].parent = arm.edit_bones[b['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')

    for bone, lst in WEIGHTS.items():
        vg = obj.vertex_groups.new(name=bone)
        for v, w in lst:
            if v in remap:
                vg.add([remap[v]], w, 'REPLACE')
    md = obj.modifiers.new('esqueleto', 'ARMATURE'); md.object = rig
    sd = obj.modifiers.new('suave', 'SUBSURF'); sd.levels = 0; sd.render_levels = 1
    obj.parent = rig

    tf = GROUPS['helper-tights']
    def shell(name, sel, offset, mat, colorfn=None, thick=.004):
        used_t = sorted({v for f in sel for v in f}); rm = {v: i for i, v in enumerate(used_t)}
        sme = bpy.data.meshes.new(name)
        sme.from_pydata([tuple(co[v]) for v in used_t], [], [[rm[v] for v in f] for f in sel]); sme.update()
        bm = bmesh.new(); bm.from_mesh(sme); bm.normal_update()
        # normais para fora (centro do tronco como referência)
        cxy = Vector((0, sum(v.co.y for v in bm.verts) / len(bm.verts), 0))
        flip = sum((v.normal.dot(Vector((v.co.x, v.co.y, 0)) - cxy) < 0) for v in bm.verts) > len(bm.verts) / 2
        for v in bm.verts:
            v.co += v.normal * (-offset if flip else offset)
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thick)
        bm.to_mesh(sme); bm.free()
        if colorfn:
            vc = sme.color_attributes.new('marca', 'FLOAT_COLOR', 'POINT')
            for v in sme.vertices:
                m = colorfn(v.co); vc.data[v.index].color = (m, m, m, 1)
        for p in sme.polygons: p.use_smooth = True
        sme.materials.append(mat)
        so = bpy.data.objects.new(name, sme); bpy.context.collection.objects.link(so)
        # pesos: cada vértice da casca herda os do vértice-base mais próximo (mesma posição em repouso)
        base_pts = [Vector(co[v]) for v in used_t]
        from mathutils.kdtree import KDTree
        kd = KDTree(len(base_pts))
        for i, p in enumerate(base_pts): kd.insert(p, i)
        kd.balance()
        vw = {}
        for bone, lst in WEIGHTS.items():
            for v, w in lst:
                if v in rm: vw.setdefault(rm[v], []).append((bone, w))
        groups = {}
        for v in sme.vertices:
            _, i, _ = kd.find(v.co)
            for bone, w in vw.get(i, []):
                g = groups.get(bone) or so.vertex_groups.new(name=bone); groups[bone] = g
                g.add([v.index], w, 'REPLACE')
        am = so.modifiers.new('esqueleto', 'ARMATURE'); am.object = rig
        sv = so.modifiers.new('suave', 'SUBSURF'); sv.levels = 0; sv.render_levels = 1
        so.parent = rig
        return so
    sh = jpos(SKEL['bones']['upperarm01.L']['head']); neck = jpos(SKEL['bones']['neck01']['head'])
    fc = lambda f: co[f].mean(axis=0)
    boots = [f for f in faces if sum(vcat(v) == 'boots' for v in f) >= 3 or (all(co[v][2] < .13 for v in f) and all(vcat(v) in ('boots', 'pants') for v in f))]
    if boots:
        shell(f'bota_{key}', boots, .011, cloth_mat('bota_couro', (.03, .028, .026), .38, 0, 40), thick=.006)
    belt = [f for f in tf if waist - .028 < fc(f)[2] < waist + .022]
    shell(f'cinto_{key}', belt, .006, cloth_mat('cinto', (.04, .035, .03), .4, 0, 80), thick=.008)
    vest_obj = None
    if vest:
        zlo, zhi, xa = waist + .02, neck.z - .015, abs(sh.x) - .03
        def vsel(f):
            c = fc(f); ax = abs(c[0])
            if not (zlo < c[2] < zhi) or ax > xa: return False
            if c[2] > sh.z - .085: return .05 < ax < .1
            return True
        sel = [f for f in tf if vsel(f)]
        if sel:
            zs_ = [fc(f)[2] for f in sel]; z0, z1 = min(zs_), max(zs_)
            def band(p):
                t = (p.z - z0) / max(1e-6, z1 - z0)
                return 1.0 if ((.18 < t < .27) or (.47 < t < .56) or (t > .62 and .062 < abs(p.x) < .088)) else 0.0
            vest_obj = shell(f'colete_{key}', sel, .02, vest_mat(vest), band)

    # olhos: esfera com esclera e íris, presa ao osso da cabeça
    iris = rnd.choice([(.25, .16, .08), (.12, .08, .05), (.30, .24, .14), (.2, .25, .3)])
    for side in ('L', 'R'):
        c, r = EYES[side]
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=c, segments=24, ring_count=16)
        e = bpy.context.active_object; e.name = f'olho_{side}_{key}'; e.scale = (r * .97,) * 3
        for p in e.data.polygons: p.use_smooth = True
        e.data.materials.append(eye_mat(iris))
        _attach_to_bone(e, rig, 'head')
    # cabelo: casca sobre o couro cabeludo (+ coque ou rabo de cavalo)
    style, hcol = hair
    head_c = (jpos(SKEL['bones']['head']['head']) + jpos(SKEL['bones']['head']['tail'])) / 2
    if style != 'bald':
        hb = obj.vertex_groups['head'].index
        def scalp_ok(i):
            v = me.vertices[i]
            w = next((g.weight for g in v.groups if g.group == hb), 0)
            p = v.co
            front = p.y < head_c.y - .035
            if w < .5: return False
            if front: return p.z > eye_z + .045
            side = abs(p.x) > .065 and p.y < head_c.y + .02
            return p.z > eye_z + (.0 if side else -.045 if style == 'long' else -.02)
        sel = [k for k, poly in enumerate(me.polygons) if all(scalp_ok(i) for i in poly.vertices)]
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        keepf = {bm.faces[k] for k in sel}
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keepf], context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.normal_update()
        for v in bm.verts: v.co += v.normal * (.009 if style == 'short' else .016)
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.006)
        hme = bpy.data.meshes.new(f'cabelo_{key}'); bm.to_mesh(hme); bm.free()
        for p in hme.polygons: p.use_smooth = True
        hme.materials.clear(); hme.materials.append(hairshell_mat(hcol))
        ho = bpy.data.objects.new(f'cabelo_{key}', hme); bpy.context.collection.objects.link(ho)
        for vg in obj.vertex_groups: ho.vertex_groups.new(name=vg.name)
        hm = ho.modifiers.new('esqueleto', 'ARMATURE'); hm.object = rig
        hs = ho.modifiers.new('suave', 'SUBSURF'); hs.levels = 0; hs.render_levels = 1
        ho.parent = rig
        if style == 'long':
            back = Vector((head_c.x, head_c.y + .085, head_c.z + .03))
            bpy.ops.mesh.primitive_uv_sphere_add(radius=.045, location=back, segments=20, ring_count=12)
            bun = bpy.context.active_object; bun.name = f'coque_{key}'; bun.scale = (1, .8, 1)
            bpy.ops.mesh.primitive_cylinder_add(radius=.026, depth=.2, location=(back.x, back.y + .02, back.z - .1))
            tail = bpy.context.active_object; tail.rotation_euler = (math.radians(-12), 0, 0)
            bpy.ops.object.select_all(action='DESELECT'); bun.select_set(True); tail.select_set(True)
            bpy.context.view_layer.objects.active = bun; bpy.ops.object.join()
            for p in bun.data.polygons: p.use_smooth = True
            bun.data.materials.append(hairshell_mat(hcol))
            _attach_to_bone(bun, rig, 'head')
    if cap is not None:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=.105, location=(head_c.x, head_c.y + .005, head_c.z - .02), segments=32, ring_count=16)
        c = bpy.context.active_object; c.name = f'bone_{key}'
        bm = bmesh.new(); bm.from_mesh(c.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -.005], context='VERTS')
        bm.to_mesh(c.data); bm.free()
        c.scale = (1.08, 1.16, 1.0)
        bpy.ops.mesh.primitive_cylinder_add(radius=.085, depth=.008, location=(head_c.x, head_c.y - .09, head_c.z - .025))
        v = bpy.context.active_object; v.scale = (1, .75, 1); v.name = f'aba_{key}'
        bpy.ops.object.select_all(action='DESELECT'); c.select_set(True); v.select_set(True)
        bpy.context.view_layer.objects.active = c; bpy.ops.object.join()
        c.data.materials.append(cloth_mat(f'bone_{cap}', cap, .7, .2, 400))
        for p in c.data.polygons: p.use_smooth = True
        _attach_to_bone(c, rig, 'head')
    return rig

VCAT_OK = [lambda p: True]

def _attach_to_bone(obj, rig, bone):
    bpy.context.view_layer.update()
    mw = obj.matrix_world.copy()
    obj.parent = rig; obj.parent_type = 'BONE'; obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = mw

# ---------------------------------------------------------------- poses
def aim(rig, bone, direction, up_twist=0.0):
    pb = rig.pose.bones[bone]
    bpy.context.view_layer.update()
    cur = (pb.tail - pb.head).normalized()
    q = cur.rotation_difference(Vector(direction).normalized())
    head = pb.head.copy()
    pb.matrix = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ pb.matrix
    bpy.context.view_layer.update()

def bend(rig, bone, axis, deg):
    pb = rig.pose.bones[bone]
    bpy.context.view_layer.update()
    head = pb.head.copy()
    pb.matrix = Matrix.Translation(head) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis)) @ Matrix.Translation(-head) @ pb.matrix
    bpy.context.view_layer.update()

def curl(rig, deg=22):
    for pb in rig.pose.bones:
        if pb.name.startswith('finger') and not pb.name.startswith('finger1'):
            bpy.context.view_layer.update()
            ax = (pb.matrix.to_3x3() @ Vector((1, 0, 0))).normalized()
            bend(rig, pb.name, ax, deg)

def pose(rig, kind, rnd=random):
    # direções no referencial do corpo: x = lado esquerdo do personagem? (+x), -y = frente, z = cima
    j = lambda a=.06: rnd.uniform(-a, a)
    if kind in ('reach', 'carry', 'push', 'stand', 'pull', 'walk'):
        if kind == 'reach':
            bend(rig, 'spine03', (1, 0, 0), -12 + j(4) * 10)
            for s in ('L', 'R'):
                sx = 1 if s == 'L' else -1
                aim(rig, f'upperarm01.{s}', (sx * .2, -.82, -.55 + j()))
                aim(rig, f'lowerarm01.{s}', (sx * .05, -1, -.15 + j()))
        elif kind == 'carry':
            bend(rig, 'spine03', (1, 0, 0), 4)
            for s in ('L', 'R'):
                sx = 1 if s == 'L' else -1
                aim(rig, f'upperarm01.{s}', (sx * .22, -.25, -.95))
                aim(rig, f'lowerarm01.{s}', (-sx * .12, -1, .12))
        elif kind == 'push':
            bend(rig, 'spine03', (1, 0, 0), -8)
            for s in ('L', 'R'):
                sx = 1 if s == 'L' else -1
                aim(rig, f'upperarm01.{s}', (sx * .12, -.7, -.7))
                aim(rig, f'lowerarm01.{s}', (sx * .02, -1, -.05))
        elif kind == 'pull':
            aim(rig, 'upperarm01.R', (-.18, .42, -.9)); aim(rig, 'lowerarm01.R', (-.1, .35, -.93))
            aim(rig, 'upperarm01.L', (.16, -.25, -.95)); aim(rig, 'lowerarm01.L', (.1, -.35, -.93))
        else:
            for s in ('L', 'R'):
                sx = 1 if s == 'L' else -1
                aim(rig, f'upperarm01.{s}', (sx * .16, .02 + j(), -1))
                aim(rig, f'lowerarm01.{s}', (sx * .06, -.12 + j(), -1))
        if kind in ('walk', 'pull', 'push'):
            st = rnd.choice((1, -1))
            aim(rig, 'upperleg01.L', (0, -.32 * st, -1)); aim(rig, 'upperleg01.R', (0, .28 * st, -1))
            back = 'R' if st > 0 else 'L'
            aim(rig, f'lowerleg01.{back}', (0, .45, -1))
        bend(rig, 'head', (0, 0, 1), rnd.uniform(-12, 12))
        curl(rig, rnd.uniform(18, 30))
