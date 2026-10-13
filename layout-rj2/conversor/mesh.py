import struct, numpy as np
from geo import bits_decode
from idx import decode_idx
def nwords(n,w): return (n*w+31)//32
def topology(it):
    """devolve (tipo, lista de sequências de índices) — tipo 'tri' (faixas) ou 'line' (polilinhas)"""
    t=it['t']; a=it['a']; V=it['V']; nv=len(V); tail=it['tail']
    lead=None
    if a!=nv:
        lead=decode_idx(tail,a,nv,'prev')
    best=None
    for j in range(0,len(tail)-12,4):
        n,w,n2=struct.unpack('<III',tail[j:j+12])
        if not(n and n==n2 and 1<=w<=24 and n<=200000): continue
        L=bits_decode(tail[j+12:],n,w)
        if not L: continue
        S=sum(L); k=j+12+4*nwords(n,w)
        if S==a:
            C=lead if a!=nv else list(range(nv))
            if C is None: continue
            best=(L,C); break
        if k+4<=len(tail) and struct.unpack('<I',tail[k:k+4])[0]==S:
            # segunda lista: índices de cantos (0..a-1), mapeados pela primeira lista (canto -> vértice)
            C2=decode_idx(tail[k+4:],S,a,'prev')
            base=lead if a!=nv else list(range(nv))
            if C2 is not None and base is not None: best=(L,[base[c] for c in C2]); break
    if best is None:
        if t==96 or t==95:
            if a==nv: return 'line',[list(range(nv))] if t==95 else [[2*i,2*i+1] for i in range(nv//2)]
        return None
    L,C=best; seqs=[]; p=0
    for n in L: seqs.append(C[p:p+n]); p+=n
    return ('tri' if t==94 else 'line'), seqs
def strips_to_tris(seqs):
    T=[]
    for s in seqs:
        for i in range(len(s)-2):
            a,b,c=s[i],s[i+1],s[i+2]
            if a==b or b==c or a==c: continue
            T.append((a,b,c) if i%2==0 else (b,a,c))
    return T
