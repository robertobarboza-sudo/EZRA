import pickle, struct, numpy as np, collections, sys
b=open('../nwd_out/c0034_00174223.bin','rb').read()
objs=pickle.load(open('objs34.pkl','rb'))
nxt=[objs[k+1][0] for k in range(len(objs)-1)]+[len(b)]
cls_of={i:c for o,i,c in objs}
FIX={15:56,16:64,17:80,14:24}
def qmat(x,y,z,w):
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
geo93={}   # id -> geometry item index
mat55={}; last55=None
insts=[]; pending=None; orphan=0; stats=collections.Counter()
for k,(o,i,c) in enumerate(objs):
    r=b[o+8:nxt[k]]
    if c==55:
        mat55[i]=None; last55=i
        if pending is not None and pending.get('m') is None: pending['m']=i
        continue
    if c==54:
        n=min(len(r),24); f=struct.unpack('<6f',r[:24]) if len(r)>=24 else (0.6,)*6
        if last55 is not None and mat55.get(last55) is None: mat55[last55]=f[3:6]
        continue
    if c==93:
        g=struct.unpack('<I',r[-4:])[0]; geo93[i]=g
        if pending is not None and pending['g'] is None: pending['g']=g; stats['inline']+=1
        else: orphan+=1
        continue
    if c in FIX:
        n=FIX[c]
        if c==15:
            T=np.array(struct.unpack('<3d',r[:24])); R=qmat(*struct.unpack('<4d',r[24:56]))
        elif c==16:
            T=np.array(struct.unpack('<3d',r[:24])); R=qmat(*struct.unpack('<4d',r[24:56]))*struct.unpack('<d',r[56:64])[0]
        elif c==17:
            f=struct.unpack('<14f',r[:56]); R=np.array([[f[0],f[4],f[8]],[f[1],f[5],f[9]],[f[2],f[6],f[10]]]); T=np.array(struct.unpack('<3d',r[56:80]))
        else:
            T=np.array(struct.unpack('<3d',r[:24])); R=np.eye(3)
        g=None; m=None
        tail=r[n:]
        for j in range(0,len(tail)-7,8):
            a,ref=struct.unpack('<II',tail[j:j+8])
            if a==1 and cls_of.get(ref)==93: g=geo93.get(ref); stats['backref']+=1
            if a==1 and cls_of.get(ref)==55: m=ref
        pending=dict(T=T,R=R,g=g,c=c,id=i,m=m); insts.append(pending)
print(len(insts), stats, 'orphans', orphan, 'nogeo', sum(x['g'] is None for x in insts))
for x in insts: x['col']=mat55.get(x['m']) if x['m'] is not None else None
print('sem cor', sum(x['col'] is None for x in insts), collections.Counter(x['col'] for x in insts).most_common(5))
pickle.dump(insts,open('insts.pkl','wb'))
