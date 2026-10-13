import sys, pickle; sys.path.insert(0,'.')
from geo import *; from mesh import *
items=load_items('../nwd_out/s0.bin')
topo={}
for k,it in enumerate(items):
    if 'a' in it:
        r=topology(it)
        if r: topo[k]=(r[0], strips_to_tris(r[1]) if r[0]=='tri' else r[1], it['V'], it['t'])
    elif it['t']==103: topo[k]=('text', it['raw'], None, 103)
pickle.dump(topo,open('topo.pkl','wb'))
