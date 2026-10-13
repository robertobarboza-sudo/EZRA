"""Linhas 2D do desenho (até 1,2 m de altura) rasterizadas numa textura transparente para o piso."""
import sys, pickle, numpy as np
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
X0, X1, Y0, Y1 = 225.0, 547.4, 130.0, 261.6
topo = pickle.load(open('topo.pkl', 'rb')); insts = pickle.load(open('insts.pkl', 'rb'))
segs = []
for x in insts:
    g = x['g']
    if g not in topo or topo[g][0] != 'line': continue
    W = (topo[g][2] @ x['R'].T + x['T']) / 1000
    if np.ptp(W, 0).max() > 400 or W[:, 2].max() > 1.2: continue
    for s in topo[g][1]:
        if len(s) > 1: P = W[s][:, :2]; segs.extend(np.stack([P[:-1], P[1:]], 1))
segs = np.array(segs); print('segmentos', len(segs))
Wpx = 8192; Hpx = int(round(Wpx * (Y1 - Y0) / (X1 - X0)))
fig = plt.figure(figsize=(Wpx / 100, Hpx / 100), dpi=100); ax = fig.add_axes([0, 0, 1, 1]); ax.set_axis_off()
ax.add_collection(LineCollection(segs, colors=(0.16, 0.18, 0.2, .75), linewidths=.7, antialiased=True))
ax.set_xlim(X0, X1); ax.set_ylim(Y0, Y1)
fig.savefig(sys.argv[1], transparent=True, dpi=100)
print(Wpx, Hpx)
