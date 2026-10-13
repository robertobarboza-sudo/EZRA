import re, struct, numpy as np
def load_items(path):
    b=open(path,'rb').read()
    offs=[m.start() for m in re.finditer(rb'\x64\x00\x00\x00[\x30-\x7f]\x00\x00\x00', b)]+[len(b)]
    items=[]
    for k in range(len(offs)-1):
        o=offs[k]; r=b[o:offs[k+1]]; t=r[4]
        it=dict(t=t,raw=r)
        if t in (94,95,96) and r[8:12]==b'\x65\x00\x00\x00':
            a,nf=struct.unpack('<II',r[16:24])
            it['a']=a; it['V']=np.frombuffer(r[24:24+4*nf],'<f4').reshape(-1,3).astype(np.float64); it['tail']=r[24+4*nf:]
        items.append(it)
    return items
def bits_decode(words_bytes, n, w):
    out=[]; bits=''
    for j in range(0,len(words_bytes)-3,4):
        bits+=f"{struct.unpack('<I',words_bytes[j:j+4])[0]:032b}"
        if len(bits)>=n*w: break
    for j in range(n):
        s=bits[j*w:(j+1)*w]
        if len(s)<w: return None
        out.append(int(s,2))
    return out
def find_strips(tail, total):
    """procura [n][w][n][palavras] cujo total de comprimentos = total"""
    for j in range(0,len(tail)-12,4):
        n,w,n2=struct.unpack('<III',tail[j:j+12])
        if n and n==n2 and 1<=w<=20 and n<=100000:
            L=bits_decode(tail[j+12:], n, w)
            if L and sum(L)==total: return L, j
    return None, None
