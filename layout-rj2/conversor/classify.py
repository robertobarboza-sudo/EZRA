import pickle, numpy as np, itertools, collections
topo=pickle.load(open('topo.pkl','rb')); insts=pickle.load(open('insts.pkl','rb'))
# estatística por forma: normais*área (local), caixa, se parece cilindro
G={}
for g,(kind,data,V,t) in topo.items():
    if kind!='tri' or not len(data): continue
    T=np.array(data); A=V[T[:,1]]-V[T[:,0]]; B=V[T[:,2]]-V[T[:,0]]
    N=np.cross(A,B); area=np.linalg.norm(N,axis=1)
    G[g]=dict(N=N, area=area.sum()/2, lo=V.min(0), hi=V.max(0), nv=len(V), nt=len(T))
def classify(g, R):
    s=G[g]; Rn=R/np.cbrt(abs(np.linalg.det(R)) or 1)
    Nw=s['N']@Rn.T; tot=np.linalg.norm(Nw,axis=1).sum()+1e-9
    hz=np.abs(Nw[:,2]).sum()/tot                  # fração de área horizontal
    C=np.array(list(itertools.product(*zip(s['lo'],s['hi']))))@R.T
    d=np.ptp(C,0); dz=d[2]; dxy=sorted(d[:2])
    if dz>4000 and dxy[0]>=350 and dxy[1]<=1200 and abs(dxy[0]-dxy[1])<200: return 'concreto'   # pilares
    if dxy[1]>20000: return 'piso'
    # esteira: placa fina (menor eixo local <= 150 mm) com o menor eixo quase vertical
    dl=(s['hi']-s['lo'])*np.linalg.norm(R,axis=0)
    k=int(np.argmin(dl)); others=np.delete(dl,k)
    ax=Rn[:,k]/ (np.linalg.norm(Rn[:,k])+1e-9)
    if dl[k]<=150 and others.min()>=300 and abs(ax[2])>0.85 and hz>0.7: return 'esteira'
    # rolete: cilindro longo e fino na horizontal
    if dz<=130 and dxy[0]<=130 and dxy[1]>=250 and s['nt']>=24 and hz<0.75: return 'rolete'
    return 'metal'
if __name__=='__main__':
    c=collections.Counter(); ct=collections.Counter()
    for x in insts:
        g=x['g']
        if g in G: k=classify(g,x['R']); c[k]+=1; ct[k]+=G[g]['nt']
    print(c, ct)
