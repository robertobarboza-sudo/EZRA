"""Converte clipes BVH do CMU Mocap (conversão cgspeed) em clipes compactos para a maquete.

Saída (JSON): para cada osso do MakeHuman mapeado, a rotação global do osso BVH em cada quadro
(espaço do personagem: Y para cima, olhando para +Z), mais o deslocamento do quadril normalizado
pela altura do quadril. A página aplica W = Δ · C · W_repouso no esqueleto MakeHuman, onde C leva a
direção de repouso do osso MakeHuman para a direção de repouso do osso BVH (guardada aqui).

Uso: python bvh2clips.py saida.json
"""
import json
import sys

import numpy as np
from scipy.spatial.transform import Rotation as R, Slerp

MAP = {  # BVH -> MakeHuman (nomes como o GLTFLoader os deixa: sem ponto)
    'Hips': 'root', 'LowerBack': 'spine04', 'Spine': 'spine03', 'Spine1': 'spine01',
    'Neck': 'neck01', 'Neck1': 'neck02', 'Head': 'head',
    'LeftShoulder': 'clavicleL', 'LeftArm': 'upperarm01L', 'LeftForeArm': 'lowerarm01L', 'LeftHand': 'wristL',
    'RightShoulder': 'clavicleR', 'RightArm': 'upperarm01R', 'RightForeArm': 'lowerarm01R', 'RightHand': 'wristR',
    'LeftUpLeg': 'upperleg01L', 'LeftLeg': 'lowerleg01L', 'LeftFoot': 'footL',
    'RightUpLeg': 'upperleg01R', 'RightLeg': 'lowerleg01R', 'RightFoot': 'footR',
}
FPS = 30


def parse(path):
    joints, stack, cur = [], [], None
    lines = open(path).read().split('\n')
    i = 0
    while i < len(lines):
        t = lines[i].split()
        i += 1
        if not t:
            continue
        if t[0] in ('ROOT', 'JOINT'):
            cur = {'name': t[1], 'parent': stack[-1] if stack else -1, 'children': [], 'end': None}
            if stack:
                joints[stack[-1]]['children'].append(len(joints))
            joints.append(cur)
        elif t[0] == 'End':
            cur = {'endsite': True}
        elif t[0] == '{':
            if cur is not None and not cur.get('endsite'):
                stack.append(len(joints) - 1)
            elif cur is not None:
                stack.append(None)
        elif t[0] == '}':
            stack.pop()
            cur = None
        elif t[0] == 'OFFSET':
            off = np.array([float(v) for v in t[1:4]])
            if cur is not None and cur.get('endsite'):
                joints[[k for k in stack if k is not None][-1]]['end'] = off
            elif cur is not None:
                cur['offset'] = off
        elif t[0] == 'CHANNELS':
            cur['channels'] = t[2:]
        elif t[0] == 'MOTION':
            break
    n = int(lines[i].split()[1])
    ft = float(lines[i + 1].split()[2])
    data = np.array([[float(v) for v in l.split()] for l in lines[i + 2:i + 2 + n] if l.strip()])
    return joints, data, ft


def fk(joints, data):
    """Rotação global (quaternions xyzw) e posição global de cada junta em cada quadro."""
    nf = data.shape[0]
    rots, pos, col = [], [], 0
    for j in joints:
        ch = j['channels']
        p = np.tile(j['offset'], (nf, 1))
        order, angs = '', []
        for k, c in enumerate(ch):
            if c.endswith('position'):
                p[:, 'XYZ'.index(c[0])] = data[:, col + k]
            else:
                order += c[0]
                angs.append(data[:, col + k])
        col += len(ch)
        local = R.from_euler(order, np.stack(angs, 1), degrees=True)
        if j['parent'] < 0:
            rots.append(local)
            pos.append(p)
        else:
            pr, pp = rots[j['parent']], pos[j['parent']]
            rots.append(pr * local)
            pos.append(pp + pr.apply(j['offset']))
    return rots, pos


def rest_dir(joints, idx):
    j = joints[idx]
    if j['children']:
        offs = [joints[c]['offset'] for c in j['children']]
        # o filho "principal" é o mais longo (ex.: Spine1 -> Neck, não os ombros)
        d = max(offs, key=np.linalg.norm) if j['name'] != 'Spine1' else joints[[c for c in j['children'] if joints[c]['name'] == 'Neck'][0]]['offset']
    else:
        d = j['end']
    n = np.linalg.norm(d)
    return (d / n).tolist() if n > 1e-6 else [0, 1, 0]


def resample(rots, pos, ft, a, b):
    """Recorta [a, b) (quadros na taxa original) e reamostra para FPS."""
    t0 = np.arange(rots[0].as_quat().shape[0]) * ft
    tt = np.arange(a * ft, (b - 1) * ft, 1 / FPS)
    out_r = [Slerp(t0, r)(tt) for r in rots]
    out_p = [np.stack([np.interp(tt, t0, p[:, k]) for k in range(3)], 1) for p in pos]
    return out_r, out_p


def heading(rot):
    """Ângulo de guinada (em torno de Y) da direção +Z do quadril."""
    f = rot.apply([0, 0, 1])
    return np.unwrap(np.arctan2(f[:, 0], f[:, 2]))


def period(sig, lo, hi):
    s = sig - sig.mean()
    ac = np.correlate(s, s, 'full')[len(s) - 1:]
    return lo + int(np.argmax(ac[lo:hi]))


def make_clip(joints, rots, pos, hip_h, loop, fade=8, keep_root_xz=False):
    names = [j['name'] for j in joints]
    hips = names.index('Hips')
    yaw = heading(rots[hips])
    # remove a guinada média (o personagem olha para +Z) e a deriva do caminho
    nf = len(yaw)
    if loop:
        k = np.polyfit(np.arange(nf), yaw, 1)
        base = np.polyval(k, np.arange(nf))
    else:
        base = np.full(nf, yaw[:8].mean())
    corr = R.from_euler('y', -base[:, None])
    rp = corr.apply(pos[hips] - pos[hips][0])
    fwd = rp[:, 2].copy()
    stride = float(fwd[-1] - fwd[0]) / hip_h
    if not keep_root_xz:
        for k in (0, 2):
            c = np.polyfit(np.arange(nf), rp[:, k], 1)
            rp[:, k] -= np.polyval(c, np.arange(nf))
    rp[:, 1] = pos[hips][:, 1]
    rp[:, 1] -= rp[:, 1].mean() if loop else rp[:8, 1].mean()   # só o sobe-desce relativo (o modelo já tem a altura do quadril)
    q = {}
    for bj, mh in MAP.items():
        if bj not in names:
            continue
        g = (corr * rots[names.index(bj)]).as_quat()
        # hemisfério contínuo
        for f in range(1, nf):
            if np.dot(g[f], g[f - 1]) < 0:
                g[f] = -g[f]
        q[mh] = g
    if loop and fade:
        # cruza o final com o começo para o laço não pular
        for mh, g in q.items():
            for f in range(fade):
                w = (f + 1) / (fade + 1)
                a, b = R.from_quat(g[nf - fade + f]), R.from_quat(g[f])
                g[nf - fade + f] = Slerp([0, 1], R.concatenate([a, b]))(w).as_quat()
            for f in range(1, nf):
                if np.dot(g[f], g[f - 1]) < 0:
                    g[f] = -g[f]
        for f in range(fade):
            w = (f + 1) / (fade + 1)
            rp[nf - fade + f] = rp[nf - fade + f] * (1 - w) + rp[f] * w
    return {
        'frames': nf, 'loop': loop, 'stride': round(stride, 4),
        'q': {mh: [round(float(v), 4) for v in g.reshape(-1)] for mh, g in q.items()},
        'root': [round(float(v) / hip_h, 4) for v in rp.reshape(-1)],
    }


def cycle_window(rots, pos, names, center_frac=.5, side='LeftFoot'):
    foot = pos[names.index(side)][:, 1]
    n = len(foot)
    T = period(foot, int(.7 * FPS), int(1.6 * FPS))
    c = int(n * center_frac)
    # começa num mínimo do pé (apoio) perto do centro
    a = max(0, c - T // 2)
    a = a + int(np.argmin(foot[a:a + T]))
    return a, a + T


def main(out):
    clips, meta = {}, None
    specs = [
        ('andar', '69_02.bvh', 'walk'), ('andar_tras', '69_39.bvh', 'back'),
        ('parado', '77_02.bvh', 'idle'), ('pegar', '69_73.bvh', 'pick'),
    ]
    for key, path, kind in specs:
        joints, data, ft = parse(path)
        names = [j['name'] for j in joints]
        rots, pos = fk(joints, data)
        hip_h = abs(joints[names.index('LeftUpLeg')]['offset'][1]) + sum(abs(joints[names.index(n)]['offset'][1]) for n in ('LeftLeg', 'LeftFoot', 'LeftToeBase'))
        rr, pp = resample(rots, pos, ft, 0, data.shape[0])
        nf = len(pp[0])
        hips = names.index('Hips')
        if kind in ('walk', 'back'):
            yaw = heading(rr[hips])
            v = np.gradient(pp[hips][:, [0, 2]], axis=0) * FPS
            fwd = v[:, 0] * np.sin(yaw) + v[:, 1] * np.cos(yaw)
            want = fwd > .25 * hip_h if kind == 'walk' else fwd < -.15 * hip_h
            # maior trecho contínuo com a direção desejada
            best, s0 = (0, 0), None
            for f in range(nf + 1):
                ok = f < nf and want[f]
                if ok and s0 is None:
                    s0 = f
                if not ok and s0 is not None:
                    if f - s0 > best[1] - best[0]:
                        best = (s0, f)
                    s0 = None
            a0, b0 = best
            sub_r = [r[a0:b0] for r in rr]
            sub_p = [p[a0:b0] for p in pp]
            a, b = cycle_window(sub_r, sub_p, names)
            clip = make_clip(joints, [r[a:b] for r in sub_r], [p[a:b] for p in sub_p], hip_h, True)
            print(key, 'trecho', a0, b0, 'ciclo', a, b, 'passada', clip['stride'])
        elif kind == 'idle':
            sp = np.linalg.norm(np.gradient(pp[hips][:, [0, 2]], axis=0), axis=1) * FPS
            L = 8 * FPS
            cs = np.convolve(sp, np.ones(L), 'valid')
            a = int(np.argmin(cs))
            clip = make_clip(joints, [r[a:a + L] for r in rr], [p[a:a + L] for p in pp], hip_h, True, fade=30)
            print(key, 'janela', a, a + L)
        else:  # pegar: do ponto mais baixo da cabeça, 1,2 s antes até 1,1 s depois
            hy = pp[names.index('Head')][:, 1]
            m = int(np.argmin(hy))
            a, b = max(0, m - int(1.2 * FPS)), min(nf, m + int(1.1 * FPS))
            clip = make_clip(joints, [r[a:b] for r in rr], [p[a:b] for p in pp], hip_h, False)
            clip['pico'] = m - a
            print(key, 'janela', a, b, 'pico', m - a)
        clips[key] = clip
        if meta is None:
            meta = {'restDir': {MAP[n]: rest_dir(joints, names.index(n)) for n in MAP if n in names}}
    json.dump({'fps': FPS, 'fonte': 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), conversão BVH de B. Hahne', **meta, 'clips': clips}, open(out, 'w'), separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'clips.json')
