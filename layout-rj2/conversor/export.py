import pickle, numpy as np, struct, json, gzip, base64, collections, itertools, sys
sys.path.insert(0,'.')
from classify import classify, G as GST
CLS=['metal','esteira','rolete','concreto','piso','linha','carro']
topo=pickle.load(open('topo.pkl','rb')); insts=pickle.load(open('insts.pkl','rb'))
ORIGIN=np.array([370000.,210000.,0.])
cols=[]; cidx={}
def colid(c):
    c=tuple(round(float(v),3) for v in (c or (0.62,0.62,0.62)))
    if c not in cidx: cidx[c]=len(cols); cols.append(c)
    return cidx[c]
groups=collections.defaultdict(list)
bbc={g:np.array(list(itertools.product(*zip(V.min(0),V.max(0))))) for g,(k,d,V,t) in topo.items() if V is not None and len(V)}
skipped=0; zmins=[]
NCOUNT=collections.Counter(x['g'] for x in insts)
for x in insts:
    g=x['g']
    if g not in topo or topo[g][0]=='text': continue
    C=bbc[g]@x['R'].T+x['T']
    if np.ptp(C,0).max()>500000: skipped+=1; continue
    M=np.concatenate([x['R'].T.reshape(-1)/1.0, (x['T']-ORIGIN)])  # linhas de R^T = colunas de R
    k='linha' if topo[g][0]=='line' else (classify(g,x['R']) if g in GST else 'metal')
    # peças repetidas 765 vezes = carrinhos do sorter (parte que transporta: cinza)
    if k in ('metal','rolete') and NCOUNT[g]%765==0 and np.ptp(topo[g][2],0).max()<2000: k='carro'
    if k=='metal': zmins.append(C[:,2].min())
    groups[(g,CLS.index(k))].append(M)
print('skipped',skipped,'groups',len(groups),'colors',len(cols))
blob=bytearray(); meta=[]
def put(arr):
    global blob
    while len(blob)%4: blob+=b'\0'
    o=len(blob); blob+=arr.tobytes(); return o
geo_off={}
for (g,c),Ms in groups.items():
    kind,data,V,t=topo[g]
    if g not in geo_off:
        P=(V/1000.0).astype(np.float32)
        if kind=='tri': I=np.array(data,dtype=np.uint32).reshape(-1)
        else: I=np.array([v for s in data for p in zip(s[:-1],s[1:]) for v in p],dtype=np.uint32)
        if len(I)==0: geo_off[g]=None; continue
        if P.shape[0]<65536: I=I.astype(np.uint16)
        size=float(np.ptp(V,0).max())
        geo_off[g]=dict(p=put(P),np=len(P),i=put(I),ni=len(I),i16=int(I.dtype==np.uint16),k=0 if kind=='tri' else 1,s=round(size))
    if geo_off[g] is None: continue
    M=np.array(Ms,dtype=np.float64); M[:,9:]/=1000.0   # translação mm -> m (os vértices já estão em m)
    meta.append(dict(g=g,c=c,m=put(M.astype(np.float32)),n=len(Ms)))
geos={str(g):v for g,v in geo_off.items() if v}
raw=bytes(blob); z=gzip.compress(raw,9)
print('raw MB',len(raw)/1e6,'gz MB',len(z)/1e6)
piso_z=0.0   # pés dos suportes começam em z = 0
print('classes', collections.Counter(CLS[k[1]] for k in groups))
json.dump(dict(origem_mm=ORIGIN.tolist(),classes=CLS,piso_z=piso_z,geos=geos,grupos=meta,bin=base64.b64encode(z).decode()),open(sys.argv[1],'w'),separators=(',',':'))
