"""Dados para animar o sorter: carrinhos em ordem de circuito, peças de cada carrinho, rampas,
esteiras (placas), telescópicas e pistas de indução. Saída em metros, coordenadas do desenho."""
import sys, json, pickle, collections, itertools
sys.path.insert(0, '.')
import numpy as np
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation as Rot
from classify import classify, G
topo = pickle.load(open('topo.pkl', 'rb')); insts = pickle.load(open('insts.pkl', 'rb'))
NC = collections.Counter(x['g'] for x in insts)
by = collections.defaultdict(list)
for x in insts: by[x['g']].append(x)
world = lambda g, x: (topo[g][2] @ x['R'].T + x['T']) / 1000
CHUTE, CART_REF = 253, 910   # 910: peça do carrinho que corre no circuito

def frame(x):   # rotação própria (sem espelho/escala) e posição
    R = x['R'] / np.cbrt(abs(np.linalg.det(x['R'])))
    if np.linalg.det(R) < 0: R = -R
    U, _, Vt = np.linalg.svd(R); R = U @ Vt
    return x['T'] / 1000, Rot.from_matrix(R).as_quat()

# ---- carrinhos e circuitos
refs = by[CART_REF]
P = np.array([x['T'] for x in refs]) / 1000
# grafo: cada carrinho liga aos vizinhos a ~1,0 m (passo do sorter); pontas soltas ligam à ponta mais próxima
tree = cKDTree(P[:, :2]); adj = collections.defaultdict(set)
for i, j in tree.query_pairs(1.15): adj[i].add(j); adj[j].add(i)
# liga as pontas soltas (curvas têm passo maior) pela ponta mais próxima, até fechar
for _ in range(200):
    ends = [i for i in range(len(refs)) if len(adj[i]) < 2]
    if not ends: break
    best = None
    for i in ends:
        for j in ends:
            if j <= i or j in adj[i]: continue
            # não fecha um segmento nele mesmo antes da hora
            d = float(np.linalg.norm(P[i, :2] - P[j, :2]))
            if best is None or d < best[0]: best = (d, i, j)
    if best is None or best[0] > 1.6: break   # só continuações diretas: os trechos ficam retos
    _, i, j = best
    # evita ligar as duas pontas do mesmo trecho se ainda houver outras pontas
    seen = {i}; st = [i]
    while st:
        k = st.pop()
        for m in adj[k]:
            if m not in seen: seen.add(m); st.append(m)
    if j in seen and len(ends) > 2:
        cand = [(float(np.linalg.norm(P[i, :2] - P[k, :2])), k) for k in ends if k not in seen]
        if not cand: break
        j = min(cand)[1]
    adj[i].add(j); adj[j].add(i)
left = set(range(len(refs))); loops = []
while left:
    st = min(left); loop = [st]; left.discard(st); prev, cur = None, st
    while True:
        nx = [k for k in adj[cur] if k != prev and k in left]
        if not nx: break
        prev, cur = cur, nx[0]; loop.append(cur); left.discard(cur)
    loops.append(loop)
print('circuitos', [len(l) for l in loops], 'fechamento', [round(float(np.linalg.norm(P[l[0], :2] - P[l[-1], :2])), 2) for l in loops])
carts = []; cartOf = {}
for li, loop in enumerate(loops):
    for k, i in enumerate(loop):
        p, q = frame(refs[i]); cartOf[i] = len(carts)
        carts.append(dict(l=li, p=np.round(p, 4).tolist(), q=np.round(q, 5).tolist()))
CP = np.array([c['p'] for c in carts])
ctree = cKDTree(CP)
# membros de cada carrinho: formas repetidas por carrinho (exceto a rampa)
members = {}
for g, n in NC.items():
    if g == CHUTE or n % 765 or g not in topo or topo[g][0] != 'tri': continue
    if np.ptp(topo[g][2], 0).max() >= 2000: continue
    idx = []; ds = []
    for x in by[g]:
        c = world(g, x).mean(0); d, j = ctree.query(c); ds.append(d); idx.append(int(j))
    if np.percentile(ds, 90) < 1.0: members[g] = idx      # peça que anda com o carrinho
print('formas dos carrinhos', len(members), 'sem dono', sum(i < 0 for v in members.values() for i in v))
# ---- rampas
chutes = []
for x in by[CHUTE]:
    W = world(CHUTE, x)
    lo = W[W[:, 2] < W[:, 2].min() + .25].mean(0); hi = W[W[:, 2] > W[:, 2].max() - .25].mean(0)
    d, j = ctree.query(lo)
    chutes.append(dict(lo=np.round(lo, 3).tolist(), hi=np.round(hi, 3).tolist(), cart=int(j)))
# ---- esteiras (placas) fora dos carrinhos
center = np.array([425.0, 203.0])
belts = []
for x in insts:
    g = x['g']
    if g not in G or g in members or classify(g, x['R']) != 'esteira': continue
    W = world(g, x); c = (W.min(0) + W.max(0)) / 2
    if np.ptp(W, 0).max() > 400: continue
    # eixo longo pelo PCA no plano
    Q = W[:, :2] - W[:, :2].mean(0); ev, evec = np.linalg.eigh(Q.T @ Q); a = evec[:, -1]
    proj = Q @ a; length = float(np.ptp(proj)); width = float(np.ptp(Q @ evec[:, 0]))
    if length < .6 or width < .25: continue
    ax = np.array([a[0], a[1], 0.0])
    # inclinação: z ao longo do eixo
    zfit = np.polyfit(proj, W[:, 2], 1)[0] if np.ptp(proj) > 0 else 0
    if np.dot(center - c[:2], a) < 0: ax[:2] *= -1; zfit = -zfit
    ax[2] = zfit; ax /= np.linalg.norm(ax)
    belts.append([*np.round(c[:2], 3).tolist(), round(float(W[:, 2].max()), 3), *np.round(ax, 4).tolist(), round(length, 3), round(width, 3)])
print('placas de esteira', len(belts), 'comprimento total', round(sum(b[6] for b in belts)))
B = np.array(belts)
# ---- telescópicas: peças ciano (cor do CAD) acima de Y 250, agrupadas em X; a ponta é o maior Y
cyan = [x for x in insts if x['col'] and tuple(round(c, 2) for c in x['col']) == (0.0, 0.6, 0.8) and x['T'][1] / 1000 > 250 and x['g'] in topo and topo[x['g']][0] == 'tri']
pts = []
for x in cyan:
    W = world(x['g'], x)
    if W[:, 1].max() > 262: pts.append(W)
A = np.concatenate(pts)
xs = np.sort(A[:, 0]); cuts = np.where(np.diff(xs) > 1.5)[0]
bounds = np.split(xs, cuts + 1)
teles = []
for seg in bounds:
    if len(seg) < 30: continue
    m = (A[:, 0] >= seg[0]) & (A[:, 0] <= seg[-1]); W = A[m]
    top = W[W[:, 1] > W[:, 1].max() - .5]
    teles.append(dict(tip=[round(float(top[:, 0].mean()), 3), round(float(W[:, 1].max()), 3), round(float(np.percentile(top[:, 2], 90)), 3)],
                      inner=round(float(W[:, 1].min()), 3)))
print('telescópicas', len(teles))
# ---- pistas de indução: placas diagonais na área do sorter
ang = np.degrees(np.arctan2(np.abs(B[:, 4]), np.abs(B[:, 3])))
m = (ang > 20) & (ang < 70) & (B[:, 0] > 360) & (B[:, 0] < 495) & (B[:, 1] > 175) & (B[:, 1] < 227)
ind = []
for b in B[m]:
    c = np.array(b[:3]); a = np.array(b[3:6]); h = b[6] / 2
    e0 = c - a * h; e1 = c + a * h                      # e1: ponta a jusante (sentido do fluxo)
    d1, j1 = ctree.query(e1); d0, _ = ctree.query(e0)
    if d1 > d0: e0, e1 = e1, e0; d1, j1 = ctree.query(e1)
    ind.append(dict(a=np.round(e0, 3).tolist(), b=np.round(e1, 3).tolist(), cart=int(j1), d=round(float(d1), 2)))
print('placas diagonais', len(ind))
segs = [np.array([carts[cartOf[i]]['p'] for i in loop]) for loop in loops if len(loop) >= 10]
# retas do sorter: linha média entre duas fileiras de estações paralelas
lanes = []; used = set()
for i, A in enumerate(segs):
    if i in used: continue
    ca = A.mean(0); da = A[-1] - A[0]; da /= np.linalg.norm(da)
    best = None
    for j, Bq in enumerate(segs):
        if j == i or j in used: continue
        cb = Bq.mean(0); db = Bq[-1] - Bq[0]; db /= np.linalg.norm(db)
        off = cb - ca; perp = np.linalg.norm(off - np.dot(off, da) * da)
        if abs(np.dot(da, db)) > .98 and 1.5 < perp < 5 and abs(np.dot(off, da)) < max(np.ptp(A @ da), np.ptp(Bq @ db)) and (best is None or perp < best[0]): best = (perp, j)
    if not best: continue
    j = best[1]; used |= {i, j}; Bq = segs[j]
    pts = np.concatenate([A, Bq]); c = pts.mean(0); a = da.copy(); a[2] = 0; a /= np.linalg.norm(a)
    t = (pts - c) @ a
    lanes.append(dict(p0=np.round(c + a * t.min(), 3).tolist(), p1=np.round(c + a * t.max(), 3).tolist(), w=round(float(best[0]), 2)))
print('retas', len(lanes), [round(float(np.linalg.norm(np.array(l['p1']) - l['p0'])), 1) for l in lanes])
segs = [s_.tolist() for s_ in segs]
# circuitos dos carrinhos: liga as pontas dos trechos (curvas) pela ponta livre mais próxima
strands = [loop for loop in loops if len(loop) >= 10]
ends = []   # (trecho, 0=início | 1=fim)
for si, lp in enumerate(strands): ends += [(si, 0), (si, 1)]
pos = lambda e: P[strands[e[0]][0 if e[1] == 0 else -1], :2]
link = {}
pairs = sorted(((float(np.linalg.norm(pos(a) - pos(b))), a, b) for i, a in enumerate(ends) for b in ends[i + 1:] if a[0] != b[0]))
for d, a, b in pairs:
    if a in link or b in link or d > 12: continue
    link[a] = b; link[b] = a
cycles = []; seen = set()
for si in range(len(strands)):
    if si in seen: continue
    order = []; cur = (si, 0)            # entra pelo início, sai pelo fim
    while True:
        k, side = cur; seen.add(k)
        seq = strands[k] if side == 0 else strands[k][::-1]
        order += [cartOf[i] for i in seq]
        out = (k, 1 - side)
        nxt = link.get(out)
        if nxt is None or nxt[0] in seen: break
        cur = nxt
    cycles.append(order)
print('ciclos', [len(c) for c in cycles])
# saída (outbound): linha magenta e dedos (chutes)
mag = [x for x in insts if x['col'] and tuple(round(c, 2) for c in x['col']) == (1.0, 0.0, 1.0) and x['g'] in topo and topo[x['g']][0] == 'tri']
MC = np.array([world(x['g'], x).mean(0) for x in mag])
fz = MC[(MC[:, 1] < 157) & (MC[:, 1] > 150)]
xs = np.sort(fz[:, 0]); cuts = np.where(np.diff(xs) > 2.0)[0]
fingers = [round(float(g_.mean()), 2) for g_ in np.split(xs, cuts + 1) if len(g_) >= 5]
outb = dict(lineY=161.2, lineZ=1.7, topY=158.6, endY=153.4, endZ=.9, x0=316.0, fingers=fingers)
print('dedos de saída', len(fingers))
# bonecos do CAD nos postos de indução (tronco 1305, cabeça 1306, pernas 1307, braços 1339): viram o lugar dos nossos operadores
MANN = [1305, 1306, 1307, 1339, 2275, 2854, 1637, 1638, 1639, 1640, 793, 2443, 1259, 1707]   # dois tipos de boneco do CAD
mann = []
for x in by[1307]:
    W = world(1307, x); c = W.mean(0)
    mann.append([round(float(c[0]), 3), round(float(c[1]), 3), round(float(W[:, 2].min()), 3)])
print('postos (bonecos do CAD)', len(mann))
json.dump(dict(mann=mann, hideGeo=MANN, cycles=cycles, outb=outb, lanes=lanes, segs=segs, carts=carts, loops=[len(l) for l in loops], members={str(k): v for k, v in members.items()}, chutes=chutes,
               belts=belts, teles=teles, ind=ind), open(sys.argv[1], 'w'), separators=(',', ':'))
