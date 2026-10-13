import sys, struct, collections, pickle
b = open(sys.argv[1], 'rb').read()
# objetos: [id u32 sequencial][classe u32]
start_id = int(sys.argv[2], 0); pos = int(sys.argv[3], 0)
objs = []; nid = start_id; p = pos
while True:
    key = struct.pack('<I', nid)
    q = b.find(key, p)
    # aceita só se a próxima ocorrência estiver "perto" e a classe for pequena
    tries = 0
    while q != -1 and not (struct.unpack('<I', b[q+4:q+8])[0] < 4096):
        q = b.find(key, q + 1); tries += 1
        if tries > 50: q = -1
    if q == -1 or q - p > 5_000_000: break
    objs.append((q, nid, struct.unpack('<I', b[q+4:q+8])[0])); p = q + 8; nid += 1
print('objs', len(objs), 'last off', objs[-1][0] if objs else None, 'of', len(b))
cnt = collections.Counter(c for _, _, c in objs)
size = collections.defaultdict(list)
for k in range(len(objs) - 1): size[objs[k][2]].append(objs[k+1][0] - objs[k][0])
for c, n in cnt.most_common(40):
    s = size[c]; print(c, hex(c), n, 'size min/med/max', min(s) if s else '-', sorted(s)[len(s)//2] if s else '-', max(s) if s else '-')
pickle.dump(objs, open(sys.argv[4], 'wb'))
