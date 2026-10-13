import numpy as np
def decode_idx(blob, a, nv, s80='prev'):
    out=[]; nxt=0; p=0
    while len(out)<a:
        if p>=len(blob): return None
        t=blob[p]
        if t<0x40:
            for _ in range(t+1): out.append(nxt); nxt+=1
            p+=1
        elif t<0x80:
            d=t-0x40
            if d<1 or d>len(out): return None
            out.append(out[-d]); p+=1
        elif t<0xc0:
            p+=1
            if s80=='skip': pass
            elif s80=='prev':
                if not out: return None
                out.append(out[-1])
            elif s80=='prev2':
                if len(out)<2: return None
                out.append(out[-2])
            elif s80=='v0': out.append(0)
            elif s80=='new': out.append(nxt); nxt+=1
        elif t<0xf0:
            d=((t&0x0f)<<8)|blob[p+1]; p+=2
            if d<1 or d>len(out): return None
            out.append(out[-d])
        else:
            v=((t&0x0f)<<16)|(blob[p+1]<<8)|blob[p+2]; p+=3
            out.append(v)
    if len(out)!=a or nxt!=nv or min(out)<0 or max(out)>=nv: return None
    return out
def planar4(V,idx,L):
    p=0; bad=0; tot=0
    for n in L:
        s=idx[p:p+n]; p+=n
        for q in range(0,n-3,2):
            P=V[s[q:q+4]]; c=P-P.mean(0); sv=np.linalg.svd(c,compute_uv=False)
            tot+=1; bad+= int(sv[0]>0 and sv[-1]/sv[0]>1e-2)
    return bad,tot
