// GLB -> glTF JSON com buffer embutido (.gltf.json é servido pelos artifacts; .glb não)
const fs = require('fs'), [src, dst] = process.argv.slice(2);
fs.mkdirSync(dst, { recursive: true });
const idx = JSON.parse(fs.readFileSync(src + '/pessoas.json'));
for (const e of idx) {
  const b = fs.readFileSync(`${src}/${e.arquivo}`), n = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + n));
  const o = 20 + n, bin = b.slice(o + 8, o + 8 + b.readUInt32LE(o));
  j.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
  e.arquivo = e.arquivo.replace('.glb', '.gltf.json');
  fs.writeFileSync(`${dst}/${e.arquivo}`, JSON.stringify(j));
}
fs.writeFileSync(dst + '/pessoas.json', JSON.stringify(idx, null, 1));
