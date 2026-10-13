import sys, zlib, os
data = open(sys.argv[1], 'rb').read()
out = sys.argv[2]; os.makedirs(out, exist_ok=True)
i = 0; n = 0; tot = 0; spans = []
while i < len(data) - 2:
    if data[i] == 0x78 and data[i+1] in (0x01, 0x5e, 0x9c, 0xda):
        d = zlib.decompressobj()
        try:
            raw = d.decompress(data[i:])
            if d.eof and len(raw) > 0:
                used = len(data) - i - len(d.unused_data)
                spans.append((i, used, len(raw)))
                open(f'{out}/c{n:04d}_{i:08x}.bin', 'wb').write(raw)
                n += 1; tot += len(raw); i += used; continue
        except zlib.error:
            pass
    i += 1
print(n, 'chunks', tot, 'bytes out')
cov = sum(s[1] for s in spans); print('coverage', cov, 'of', len(data))
for s in spans[:30]: print(hex(s[0]), s[1], s[2], 'gap_before' )
