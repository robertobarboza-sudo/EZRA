
/* ------------------------------------------------------------------ */
/* Geometria estática agrupada por material (poucas draw calls)         */
/* ------------------------------------------------------------------ */
let COLLECT = new Map();
let FRAME = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _p = V3(), _s = V3();
function put(key, geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  const g = geo.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(FRAME, _m));
  if (!COLLECT.has(key)) COLLECT.set(key, []);
  COLLECT.get(key).push(g);
}
function withFrame(obj, fn) { obj.updateMatrixWorld(true); const prev = FRAME; FRAME = obj.matrixWorld.clone(); fn(); FRAME = prev; }
function frameAt(x, y, z, ry, fn) {
  const prev = FRAME; FRAME = prev.clone().multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z)); fn(); FRAME = prev;
}
const G = {};
const box = (w, h, d) => { const k = `b${w}|${h}|${d}`; return G[k] || (G[k] = new THREE.BoxGeometry(w, h, d)); };
const cyl = (r, h, s = 12) => { const k = `c${r}|${h}|${s}`; return G[k] || (G[k] = new THREE.CylinderGeometry(r, r, h, s)); };
const plane = (w, d) => { const k = `p${w}|${d}`; return G[k] || (G[k] = new THREE.PlaneGeometry(w, d).rotateX(-PI / 2)); };
function mergeCollected(col) {
  const out = {};
  for (const [key, geos] of col) {
    out[key] = THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false);
    geos.forEach(g => g.dispose());
  }
  return out;
}
let roofGroup = null;
function bake(parent) {
  const merged = mergeCollected(COLLECT); COLLECT = new Map();
  for (const key in merged) {
    const mesh = new THREE.Mesh(merged[key], MAT[key]); mesh.name = 'fixo_' + key;
    if (ROOF_KEYS.has(key) && roofGroup) { mesh.castShadow = false; mesh.receiveShadow = false; mesh.matrixAutoUpdate = false; mesh.userData.disposeGeo = true; roofGroup.add(mesh); continue; }
    mesh.castShadow = !NO_CAST.has(key); mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.userData.disposeGeo = true;
    if (key === 'wire') AO_HIDE.push(mesh);
    parent.add(mesh);
  }
}
/* um "asset" é geometria mesclada por material, montada uma vez e reutilizada por várias instâncias móveis */
function buildAsset(fn) {
  const prevC = COLLECT, prevF = FRAME;
  COLLECT = new Map(); FRAME = new THREE.Matrix4();
  fn();
  const a = mergeCollected(COLLECT);
  COLLECT = prevC; FRAME = prevF;
  return a;
}
function instance(asset) {
  const g = new THREE.Group();
  for (const key in asset) {
    const m = new THREE.Mesh(asset[key], MAT[key]);
    m.castShadow = !NO_CAST.has(key); m.receiveShadow = true;
    if (key === 'wire') AO_HIDE.push(m);
    g.add(m);
  }
  return g;
}
const AO_HIDE = [];   // malhas ignoradas pela oclusão de ambiente (telas aramadas, textos)

/* ------------------------------------------------------------------ */
/* Textos                                                              */
/* ------------------------------------------------------------------ */
const FONT = '"Archivo", "Arial Narrow", Arial, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
function textTexture(lines, { w = 512, h = 128, color = '#232a33', bg = null, font = FONT, weight = 800, size = 80, align = 'center', bar = null } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    if (bar) { g.fillStyle = bar; g.fillRect(0, h - h * .09, w, h * .09); }
    g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
    const arr = Array.isArray(lines) ? lines : [lines];
    arr.forEach((ln, i) => {
      const o = typeof ln === 'object' ? ln : { t: ln };
      const s = o.size || size;
      g.font = `${o.weight || weight} ${s}px ${o.font || font}`;
      try { g.fontStretch = 'condensed'; } catch (e) {}
      const y = h / 2 + (i - (arr.length - 1) / 2) * s * 1.08 - (bar ? h * .04 : 0);
      g.fillText(o.t, align === 'center' ? w / 2 : 14, y, w - 20);
    });
  });
}
function floorText(parent, lines, x, z, w, h, rotY = 0, opts = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: textTexture(lines, opts), transparent: true, depthWrite: false, roughness: .8, envMapIntensity: .2,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.rotation.set(-PI / 2, 0, rotY); m.position.set(x, .009, z); m.receiveShadow = true;
  m.userData.disposeAll = true; AO_HIDE.push(m);
  parent.add(m); return m;
}
/* placa suspensa de área (azul institucional + faixa laranja) */
function hangSign(parent, text, sub, x, z, ry, y = 5.2, w = 5.2) {
  const h = w * .28;
  const tex = textTexture([{ t: text, size: 92 }, { t: sub, size: 38, weight: 600, font: MONO }], { w: 768, h: 216, bg: '#1f3a5f', color: '#ffffff', bar: '#e8641b' });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .55, envMapIntensity: .4 });
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  for (const s of [1, -1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    face.position.z = s * .03; face.rotation.y = s > 0 ? 0 : PI; face.userData.disposeAll = true; g.add(face);
  }
  withFrame(g, () => {
    put('navy', box(w + .06, h + .06, .05), 0, 0, 0);
    for (const s of [-1, 1]) put('steelDark', cyl(.008, 11.2 - y - h / 2, 4), s * w * .4, h / 2 + (11.2 - y - h / 2) / 2, 0);
  });
  return g;
}

/* ------------------------------------------------------------------ */
/* Pallet PBR + scuttle (local: X = 1,00 frente, Z = 1,20 profundidade; janela em +Z, garfo entra por ±Z) */
/* ------------------------------------------------------------------ */
const PAL_H = 0.144;
function pallet() {
  for (const x of [-.45, 0, .45]) {
    put('wood', box(.1, .022, 1.2), x, .011, 0);
    for (const z of [-.54, 0, .54]) put('wood', box(.1, .078, .12), x, .061, z);
  }
  for (const z of [-.54, 0, .54]) put('wood', box(1.0, .022, .12), 0, .111, z);
  for (let i = 0; i < 7; i++) put('wood', box(.1, .022, 1.2), -.45 + i * .15, .133, 0);
}
function scuttleShell(H) {
  const y0 = PAL_H, t = .012, W = .98, D = 1.18, yc = y0 + H / 2;
  put('kraft', box(W, H, t), 0, yc, -D / 2 + t / 2);
  put('kraft', box(t, H, D), -W / 2 + t / 2, yc, 0);
  put('kraft', box(t, H, D), W / 2 - t / 2, yc, 0);
  put('kraftIn', box(W - .02, .01, D - .02), 0, y0 + .006, 0);
  const wy0 = Math.min(.95, H * .45), wy1 = Math.min(H - .3, wy0 + .6), side = .14, zf = D / 2 - t / 2;
  put('kraft', box(W, wy0, t), 0, y0 + wy0 / 2, zf);
  put('kraft', box(W, H - wy1, t), 0, y0 + wy1 + (H - wy1) / 2, zf);
  put('kraft', box(side, wy1 - wy0, t), -W / 2 + side / 2, y0 + (wy0 + wy1) / 2, zf);
  put('kraft', box(side, wy1 - wy0, t), W / 2 - side / 2, y0 + (wy0 + wy1) / 2, zf);
  const a = .22, fl = Math.min(.5, wy0 - .05);
  put('kraft', box(W - 2 * side - .02, fl, t), 0, y0 + wy0 - fl / 2 * Math.cos(a), zf + fl / 2 * Math.sin(a) + .008, -a, 0, 0);
  const b = .5, fh = .38, top = y0 + H;
  put('kraft', box(W, fh, t), 0, top + fh / 2 * Math.cos(b), D / 2 + fh / 2 * Math.sin(b), b, 0, 0);
  put('kraft', box(W, fh, t), 0, top + fh / 2 * Math.cos(b), -D / 2 - fh / 2 * Math.sin(b), -b, 0, 0);
  put('kraft', box(t, fh, D), W / 2 + fh / 2 * Math.sin(b), top + fh / 2 * Math.cos(b), 0, 0, 0, -b);
  put('kraft', box(t, fh, D), -W / 2 - fh / 2 * Math.sin(b), top + fh / 2 * Math.cos(b), 0, 0, 0, b);
  return { wy0, wy1 };
}

/* ------------------------------------------------------------------ */
/* Flow rack preto da ilha (local: eixo x=0, de z=rack0 a rack1, saindo da esteira) */
/* ------------------------------------------------------------------ */
function islandRack(L) {
  const z0 = L.rack0, z1 = L.rack1, hw = L.rackW / 2, yN = L.rackH + .02, yF = L.rackH - .05;
  const ang = Math.atan2(yF - yN, L.rackL), deck = z => lerp(yN, yF, (z - z0) / L.rackL);
  const legsZ = [z0 + .05, (z0 + z1) / 2, z1 - .05];
  const lanes = Math.max(1, Math.round(L.rackW / .82)), lw = L.rackW / lanes;
  for (let i = 0; i <= lanes; i++) {
    const x = -hw + i * lw;
    put('rackBlack', box(.045, .1, L.rackL), x, (yN + yF) / 2 - .02, (z0 + z1) / 2, -ang, 0, 0);
    for (const z of legsZ) {
      const h = deck(z) - .05;
      put('rackBlack', box(.05, h, .05), x, h / 2, z);
      put('rackDark', box(.12, .01, .12), x, .005, z);
    }
    put('rackBlack', box(.035, .035, L.rackL), x, .22, (z0 + z1) / 2);
  }
  for (const z of legsZ) put('rackBlack', box(L.rackW, .035, .035), 0, .22, z);
  put('rackBlack', box(L.rackW - .1, .02, L.rackL - .12), 0, .25, (z0 + z1) / 2);
  for (let i = 0; i < lanes; i++) {
    const cx = -hw + (i + .5) * lw;
    for (let z = z0 + .06; z < z1 - .03; z += .09) put('rollerDark', cyl(.026, lw - .06, 10), cx, deck(z), z, 0, 0, PI / 2);
  }
  put('rackBlack', box(L.rackW, .12, .04), 0, yF + .07, z1);
  put('rackBlack', box(L.rackW, .05, .04), 0, yN + .03, z0);
  for (const s of [-1, 1]) put('mat', box(Math.min(1.1, P.corredorFlow - .1), .012, L.rackL), s * (hw + P.corredorFlow / 2), .006, (z0 + z1) / 2);
  put('mat', box(L.rackW, .012, Math.max(.3, L.rack0 - .2)), 0, .006, L.rack0 / 2);
  put('mat', box(L.rackW, .012, .8), 0, .006, z1 + .5);
  // volumes parados na prateleira inferior
  put('pkgKraft', box(.5, .3, .4), .4, .41, z0 + .8, 0, .1, 0);
  put('pkgWhite', box(.45, .28, .35), -.5, .40, z0 + 2.0, 0, -.2, 0);
  return { deck, yN, yF };
}

/* flow rack do goleiro: mesma orientação e largura da esteira, logo após o fim dela */
function goalRack(L) {
  const x0 = L.X1 + .05, x1 = x0 + L.golL, hw = L.bw / 2, yN = L.bt - .01, yF = L.bt - .07;
  const ang = Math.atan2(yF - yN, L.golL), deck = x => lerp(yN, yF, (x - x0) / L.golL);
  for (const s of [-1, 1]) {
    put('rackBlack', box(L.golL, .1, .045), (x0 + x1) / 2, (yN + yF) / 2 - .02, s * (hw + .02), 0, 0, ang);
    for (const x of [x0 + .06, x1 - .06]) {
      const h = deck(x) - .05;
      put('rackBlack', box(.05, h, .05), x, h / 2, s * (hw - .03));
    }
  }
  for (const x of [x0 + .06, x1 - .06]) put('rackBlack', box(.035, .035, L.bw), x, .22, 0);
  for (let x = x0 + .06; x < x1 - .03; x += .08) put('rollerDark', cyl(.026, L.bw - .04, 10), x, deck(x), 0, PI / 2, 0, 0);
  put('rackBlack', box(.05, .2, L.bw + .08), x1 + .02, yF + .08, 0);
  return { x0, x1, deck };
}

/* ------------------------------------------------------------------ */
/* Gaiola 1,20 × 1,00 × H sem porta (local: face aberta em −Z)          */
/* ------------------------------------------------------------------ */
function cageGeo(H) {
  const W = 1.2, D = 1.0, y0 = .16, ph = H - y0;
  put('cageBase', box(W, .06, D), 0, y0 - .03, 0);
  for (const [x, z] of [[-.5, -.4], [.5, -.4], [-.5, .4], [.5, .4]]) {
    put('steelDark', cyl(.04, .03, 12), x, .055, z, PI / 2, 0, 0);
    put('steelDark', box(.05, .06, .05), x, .1, z);
  }
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) put('cageFrame', cyl(.018, ph, 10), x, y0 + ph / 2, z);
  for (const z of [-D / 2, D / 2]) put('cageFrame', cyl(.014, W, 8), 0, H, z, 0, 0, PI / 2);
  for (const x of [-W / 2, W / 2]) put('cageFrame', cyl(.014, D, 8), x, H, 0, PI / 2, 0, 0);
  put('cageFrame', cyl(.014, W, 8), 0, y0 + .12, -D / 2, 0, 0, PI / 2);
  put('wire', box(W, ph, .004), 0, y0 + ph / 2, D / 2);
  put('wire', box(.004, ph, D), -W / 2, y0 + ph / 2, 0);
  put('wire', box(.004, ph, D), W / 2, y0 + ph / 2, 0);
}

/* ------------------------------------------------------------------ */
/* Paleteira manual (local: garfos para −Z, timão em +Z)                */
/* ------------------------------------------------------------------ */
function jackGeo() {
  for (const s of [-1, 1]) {
    put('orange', box(.16, .055, 1.15), s * .2, .07, -.925);
    put('steelDark', cyl(.035, .07, 10), s * .2, .035, -1.42, 0, 0, PI / 2);
  }
  put('orange', box(.56, .12, .3), 0, .12, -.2);
  put('orange', box(.24, .34, .22), 0, .33, -.12);
  put('steelDark', cyl(.05, .2, 12), 0, .55, -.12);
  put('tire', cyl(.09, .07, 14), -.1, .09, -.08, 0, 0, PI / 2);
  put('tire', cyl(.09, .07, 14), .1, .09, -.08, 0, 0, PI / 2);
  put('steelDark', box(.04, .9, .04), 0, .95, .1, -.42, 0, 0);
  put('steelDark', cyl(.022, .36, 10), 0, 1.36, .28, 0, 0, PI / 2);
  put('rubber', cyl(.026, .14, 10), -.11, 1.36, .28, 0, 0, PI / 2);
  put('rubber', cyl(.026, .14, 10), .11, 1.36, .28, 0, 0, PI / 2);
}

/* ------------------------------------------------------------------ */
/* Caminhão (cavalo + carreta), traseira encostada na doca, em +Z local */
/* ------------------------------------------------------------------ */
function truckGeo() {
  const Lt = 13.6, Wt = 2.6, Ht = 2.75, yb = 1.25;
  put('trailer', box(Wt, Ht, Lt), 0, yb + Ht / 2, -Lt / 2);
  put('steelDark', box(Wt - .3, .25, Lt - 1), 0, yb - .15, -Lt / 2);
  put('doorDark', box(Wt - .1, Ht - .1, .02), 0, yb + Ht / 2, .005);
  for (const z of [-1.4, -2.7, -3.9]) for (const s of [-1, 1]) put('tire', cyl(.5, .3, 18), s * (Wt / 2 - .2), .5, z, 0, 0, PI / 2);
  put('steelDark', box(.3, .9, .2), -.9, yb - .5, -Lt + 3);
  const zc = -Lt - 1.2;
  put('steelDark', box(Wt - .2, .3, 6), 0, .9, zc - .6);
  put('cab', box(Wt, 2.3, 2.3), 0, 2.45, zc - 2.4);
  put('glass', box(Wt - .2, .9, .05), 0, 2.95, zc - 3.56);
  put('navy', box(Wt + .01, .3, 2.31), 0, 1.5, zc - 2.4);
  for (const z of [zc - 2.6, zc + .4, zc + 1.6]) for (const s of [-1, 1]) put('tire', cyl(.5, .3, 18), s * (Wt / 2 - .2), .5, z, 0, 0, PI / 2);
}

/* ------------------------------------------------------------------ */
/* Porta-pallets (armazenagem): 1 módulo de 2,7 m × 1,1 m × 3 níveis    */
/* ------------------------------------------------------------------ */
function rackBay(withPal = true) {
  const w = 2.7, d = 1.1, lv = [0, 1.6, 3.2], H = 4.6;
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) put('rackBlue', box(.08, H, .07), x, H / 2, z);
  for (const x of [-w / 2, w / 2]) for (let y = .4; y < H; y += .6) put('rackBlue', box(.03, .03, d), x, y, 0);
  for (const y of lv.slice(1)) for (const z of [-d / 2, d / 2]) put('rackOrange', box(w, .12, .05), 0, y, z);
  if (!withPal) return;
  for (const y of lv) for (const x of [-.65, .65]) {
    if (Math.random() < .12) continue;
    frameAt(x, y + (y ? .06 : 0), 0, PI / 2, () => {
      pallet();
      const hh = rand(.6, 1.1);
      put(pick(['pkgKraft', 'pkgKraft2', 'pkgWhite']), box(1.0, hh, 1.15), 0, PAL_H + hh / 2, 0);
    });
  }
}
