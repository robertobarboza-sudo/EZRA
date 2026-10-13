import pickle, numpy as np, itertools
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PolyCollection
topo=pickle.load(open('topo.pkl','rb')); insts=pickle.load(open('insts.pkl','rb'))
segs=[]; polys=[]; pc=[]
bbc={}
for g,(kind,data,V,t) in topo.items():
    if V is not None and len(V): bbc[g]=np.array(list(itertools.product(*zip(V.min(0),V.max(0)))))
for x in insts:
    g=x['g']
    if g not in topo: continue
    kind,data,V,t=topo[g]
    if kind=='line':
        W=(V@x['R'].T+x['T'])[:,:2]/1000
        if np.ptp(W,0).max()>500: continue
        for s in data:
            if len(s)>1: P=W[s]; segs.extend(np.stack([P[:-1],P[1:]],1))
    elif kind=='tri':
        C=(bbc[g]@x['R'].T+x['T'])[:,:2]/1000
        if np.ptp(C,0).max()>500: continue
        # contorno do retângulo projetado (casco convexo simples)
        from scipy.spatial import ConvexHull
        try: h=ConvexHull(C); polys.append(C[h.vertices]); pc.append(x['col'] or (.6,.6,.6))
        except Exception: pass
print(len(segs), len(polys))
fig,ax=plt.subplots(figsize=(30,14),dpi=100)
ax.add_collection(LineCollection(segs,colors='#555',linewidths=.12))
ax.add_collection(PolyCollection(polys,facecolors=pc,edgecolors='k',linewidths=.05,alpha=.8))
allp=np.concatenate([np.concatenate(polys)]+[np.array(segs).reshape(-1,2)[::50]])
lo=np.percentile(allp,0.5,0); hi=np.percentile(allp,99.5,0); print('lim',lo,hi)
ax.set_xlim(lo[0]-10,hi[0]+10); ax.set_ylim(lo[1]-10,hi[1]+10); ax.set_aspect('equal'); plt.tight_layout(); plt.savefig('top.png')
