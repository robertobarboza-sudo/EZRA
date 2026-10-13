"""Circuitos dos carrinhos por nível (módulos de 600 mm) e o protótipo de um carrinho."""
import sys, json, pickle, collections
sys.path.insert(0, '.')
import numpy as np
from scipy.spatial import cKDTree
topo = pickle.load(open('topo.pkl', 'rb')); insts = pickle.load(open('insts.pkl', 'rb'))
world = lambda g, x: (topo[g][2] @ x['R'].T + x['T']) / 1000
REF = 858                                   # lona do carrinho (600 x 800 mm)
refs = [x for x in insts if x['g'] == REF]
RC = np.array([world(REF, x).mean(0) for x in refs])
levels = []
for lv in (2.6, 4.3, 5.7):
    idx = np.where(np.abs(RC[:, 2] - lv) < .25)[0]; P = RC[idx]
    t = cKDTree(P[:, :2]); adj = collections.defaultdict(set)
    for i, j in t.query_pairs(.65):
        if abs(np.linalg.norm(P[i, :2] - P[j, :2]) - .6) < .08: adj[i].add(j); adj[j].add(i)
    for i in list(adj):     # mantém só 2 vizinhos (os mais próximos de 0,6 m)
        if len(adj[i]) > 2:
            keep = sorted(adj[i], key=lambda j: abs(np.linalg.norm(P[i, :2] - P[j, :2]) - .6))[:2]
            for j in adj[i] - set(keep): adj[j].discard(i)
            adj[i] = set(keep)
    # liga pontas soltas à ponta mais próxima
    for _ in range(50):
        ends = [i for i in range(len(P)) if len(adj[i]) < 2]
        if len(ends) < 2: break
        best = min(((np.linalg.norm(P[a, :2] - P[b, :2]), a, b) for k, a in enumerate(ends) for b in ends[k + 1:] if b not in adj[a]), default=None)
        if not best or best[0] > 6: break
        adj[best[1]].add(best[2]); adj[best[2]].add(best[1])
    left = set(range(len(P))); cyc = []
    while left:
        st = min(left); order = [st]; left.discard(st); prev, cur = None, st
        while True:
            nx = [k for k in adj[cur] if k != prev and k in left]
            if not nx: break
            prev, cur = cur, nx[0]; order.append(cur); left.discard(cur)
        if len(order) > 20:
            pts = P[order]; L = float(np.sum(np.linalg.norm(np.diff(np.vstack([pts, pts[:1]])[:, :2], axis=0), axis=1)))
            cyc.append(dict(pts=np.round(pts, 3).tolist(), len=round(L, 2)))
    levels.append(dict(z=lv, cycles=cyc))
    print('nível', lv, 'módulos', len(P), 'ciclos', [(len(c['pts']), c['len']) for c in cyc])
# protótipo: peças perto de um módulo de referência numa reta (Y 219,8)
i0 = int(np.argmin(np.abs(RC[:, 1] - 219.8) + np.abs(RC[:, 0] - 400) + np.abs(RC[:, 2] - 2.6)))
p0 = RC[i0]
others = [g for g in (860, 462, 684) if g in topo]
parts = []
def M_of(x): M = np.eye(4); M[:3, :3] = x['R']; M[:3, 3] = x['T'] / 1000; return M
# frame do módulo: x = tangente (eixo X do desenho nesta reta), z = vertical
F0 = np.eye(4); F0[:3, 3] = p0
Finv = np.linalg.inv(F0)
for g in [REF] + others:
    for x in insts:
        if x['g'] != g: continue
        c = world(g, x).mean(0)
        if np.linalg.norm(c[:2] - p0[:2]) < .3 and abs(c[2] - p0[2]) < .5:
            parts.append(dict(g=g, rel=np.round((Finv @ M_of(x)).reshape(-1), 6).tolist()))
print('peças do carrinho', [p['g'] for p in parts])
json.dump(dict(levels=levels, parts=parts, hide=[REF] + others), open(sys.argv[1], 'w'), separators=(',', ':'))
