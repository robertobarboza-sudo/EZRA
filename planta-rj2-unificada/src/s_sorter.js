/* ------------------------------------------------------------------ */
/* Sorter RJ2 ASM3 (lido do Navisworks) na mesma planta das esteiras    */
/* ------------------------------------------------------------------ */
// Desenho (m, Z para cima) -> mundo da maquete (Y para cima):
//   x = Y_desenho - Yc   (o fim das esteiras, saída, encosta na parede norte do galpão, Y 261,6)
//   y = Z_desenho
//   z = X_desenho - Xc   (o caminho seguro encosta na parede leste, X 547,4)
// Vida: pacotes nas esteiras, descarga nas telescópicas, indução, pacotes no sorter caindo nas sacas,
// sacas cheias descendo e um colaborador a cada 10 rampas.
const SR_BOUNDS = { X0: 225.0, X1: 547.4, Y0: 130.0, Y1: 261.6 };
const SR_ORIGIN = [370, 210];   // origem do modelo.json (m)
const SR = { data: null, extra: null, levels: null, buf: null, grp: null, key: '', ready: false, Xc: 0, Yc: 0 };
const SR_FULL = 45;             // pacotes por saca (média)
const SR_LITE = /[?&]lite/.test(location.search);

function srFrame() { SR.Xc = SR_BOUNDS.X1 - L.bz1; SR.Yc = SR_BOUNDS.Y1 - L.bx1; }
const srW = (X, Y, Z, out = V3()) => out.set(Y - SR.Yc, Z, X - SR.Xc);   // ponto do desenho -> mundo
const srDir = (ax, ay, az) => V3(ay, az, ax);                             // vetor do desenho -> mundo
function srWorldBounds() {
  return { x0: SR_BOUNDS.Y0 - SR.Yc, x1: SR_BOUNDS.Y1 - SR.Yc, z0: SR_BOUNDS.X0 - SR.Xc, z1: SR_BOUNDS.X1 - SR.Xc };
}
const srInPlant = (x, z, m = 1) => x > L.bx0 - m && x < L.bx1 + m && z > L.bz0 - m && z < L.bz1 + m;

async function loadSorter(base = 'sorter/') {
  const get = f => fetch(base + f).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
  const [M, E, N] = await Promise.all([get('modelo.json'), get('extra.json'), get('niveis.json')]);
  SR.levels = N;
  const gz = Uint8Array.from(atob(M.bin), ch => ch.charCodeAt(0));
  SR.buf = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  delete M.bin; SR.data = M; SR.extra = E;
  SR.linesTex = await new Promise(ok => new THREE.TextureLoader().load(base + 'piso_linhas.png', ok, undefined, () => ok(null)));
  if (SR.linesTex) { SR.linesTex.colorSpace = THREE.SRGBColorSpace; SR.linesTex.anisotropy = MAX_ANISO; }
}

/* ---------- estrutura estática: instâncias por forma, materiais do sorter ---------- */
const SCREEN_MAT = std({ color: 0x0f1820, emissive: 0x1f6fa8, emissiveIntensity: .9, roughness: .3 });
// mesmo acabamento do visualizador do layout: faces planas, metal laranja e lonas/roletes em cinza escuro
const SR_MATS = {
  metal: std({ color: 0xe8641b, roughness: .42, metalness: .35, flatShading: true, side: THREE.DoubleSide, envMapIntensity: .45 }),
  esteira: std({ color: 0x2b2f33, roughness: .88, metalness: 0, flatShading: true, side: THREE.DoubleSide, envMapIntensity: .45 }),
  rolete: std({ color: 0x3a3f44, roughness: .35, metalness: .7, flatShading: true, side: THREE.DoubleSide, envMapIntensity: .45 }),
  carro: std({ color: 0x3d4248, roughness: .5, metalness: .45, flatShading: true, side: THREE.DoubleSide, envMapIntensity: .45 }),
};
function buildSorterStatic() {
  if (!SR.data) return;
  srFrame();
  const key = `${SR.Xc.toFixed(2)}|${SR.Yc.toFixed(2)}|${L.bx0.toFixed(2)}|${L.bz0.toFixed(2)}`;
  if (SR.grp && SR.key === key) return;
  if (SR.grp) { scene.remove(SR.grp); SR.grp.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); }
  SR.key = key;
  const M = SR.data, buf = SR.buf;
  const grp = new THREE.Group(); grp.name = 'sorter'; grp.matrixAutoUpdate = false;
  // desenho relativo à origem -> mundo
  grp.matrix.set(0, 1, 0, SR_ORIGIN[1] - SR.Yc, 0, 0, 1, 0, 1, 0, 0, SR_ORIGIN[0] - SR.Xc, 0, 0, 0, 1);
  const geoCache = {}, m4 = new THREE.Matrix4(), v = V3();
  const geo = g => {
    if (geoCache[g]) return geoCache[g];
    const d = M.geos[g];
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, d.p, d.np * 3), 3));
    G.setIndex(new THREE.BufferAttribute(d.i16 ? new Uint16Array(buf, d.i, d.ni) : new Uint32Array(buf, d.i, d.ni), 1));
    return geoCache[g] = G;
  };
  let n = 0;
  for (const gr of M.grupos) {
    const d = M.geos[gr.g], cls = M.classes[gr.c];
    if (!d || d.k !== 0 || !SR_MATS[cls]) continue;
    if (SR_LITE && d.s < 200) continue;   // teste leve: sem peças menores que 20 cm
    if (SR.levels && SR.levels.hide.includes(gr.g)) continue;   // carrinhos: desenhados em movimento
    if (SR.extra && SR.extra.hideGeo && SR.extra.hideGeo.includes(gr.g)) continue;   // bonecos do CAD (viram nossos operadores)
    const T = new Float32Array(buf, gr.m, gr.n * 12), keep = [];
    for (let i = 0; i < gr.n; i++) {
      // fora da área da planta das esteiras (o sorter não invade a planta)
      const X = T[i * 12 + 9] + SR_ORIGIN[0], Y = T[i * 12 + 10] + SR_ORIGIN[1];
      srW(X, Y, 0, v); if (!srInPlant(v.x, v.z, .5)) keep.push(i);
    }
    if (!keep.length) continue;
    const IM = new THREE.InstancedMesh(geo(gr.g), SR_MATS[cls], keep.length);
    keep.forEach((i, k) => {
      const o = i * 12;
      m4.set(T[o], T[o + 3], T[o + 6], T[o + 9], T[o + 1], T[o + 4], T[o + 7], T[o + 10], T[o + 2], T[o + 5], T[o + 8], T[o + 11], 0, 0, 0, 1);
      IM.setMatrixAt(k, m4);
    });
    IM.castShadow = false; IM.receiveShadow = true; IM.computeBoundingSphere(); IM.userData.g = gr.g;
    grp.add(IM); n += keep.length;
  }
  grp.updateMatrixWorld(true);
  scene.add(grp); SR.grp = grp; SR.count = n;
}

/* ---------- piso do galpão inteiro (mesmo concreto da maquete) + desenho do CAD ---------- */
function buildSorterFloor() {
  srFrame();
  const b = srWorldBounds(), W = b.x1 - b.x0, D = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  if (SR.linesTex) {
    // UV: u = X do desenho (eixo z do mundo), v = Y do desenho (eixo x do mundo)
    const g = new THREE.BufferGeometry();
    const P = [b.x0, .004, b.z0, b.x1, .004, b.z0, b.x1, .004, b.z1, b.x0, .004, b.z1];
    const U = [0, 0, 0, 1, 1, 1, 1, 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: SR.linesTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.userData.disposeGeo = true; AO_HIDE.push(m); world.add(m);
  }
  return { W, D, cx, cz };
}

/* ---------- vida do sorter ---------- */
// Fluxo (premissas do usuário):
// indução: o colaborador da mesa pega o pacote que desce do topo e põe na mesa; a mesa dispara para o
// próximo carrinho livre; o carrinho gira sem parar (uma volta em P.voltaSorter s) e descarrega na queda
// do destino; a saca da queda enche (P.pacotesSaca); o colaborador das suas P.quedasPorColab quedas fecha a
// saca, empurra para o take away e põe uma saca vazia; o take away leva à matriz e ao outbound, onde a saca
// cai no chute do destino; o colaborador põe a saca na gaiola; com P.sacasGaiola sacas a gaiola fecha e vai
// para o buffer de endereçamento e depois para a rua de destino, onde aguarda o carregamento.
const SRV = { ready: false };
const _sm = new THREE.Matrix4(), _sm2 = new THREE.Matrix4(), _sq = new THREE.Quaternion(), _ss = V3(), _sp = V3(), _up = V3(0, 1, 0), _sv = V3();
const srYaw = d => Math.atan2(d.x, d.z);

function srCycle(c, z) {   // circuito: pontos do desenho (m) -> amostragem por comprimento
  const P = c.pts.map(p => V3(p[0], p[1], p[2])), cum = [0];
  for (let i = 1; i <= P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i % P.length].x - P[i - 1].x, P[i % P.length].y - P[i - 1].y));
  return { P, cum, len: cum[P.length], z };
}
function srAt(cy, s, out, tan) {   // ponto do desenho e ângulo da tangente no comprimento s
  s = ((s % cy.len) + cy.len) % cy.len;
  let lo = 0, hi = cy.P.length; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cy.cum[m] <= s) lo = m; else hi = m; }
  const a = cy.P[lo], b = cy.P[(lo + 1) % cy.P.length], k = (s - cy.cum[lo]) / Math.max(1e-6, cy.cum[lo + 1] - cy.cum[lo]);
  out.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
  if (tan) tan.t = Math.atan2(b.y - a.y, b.x - a.x);
  return out;
}
function srNearestS(cy, X, Y) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < cy.P.length; i++) { const d = Math.hypot(cy.P[i].x - X, cy.P[i].y - Y); if (d < bd) { bd = d; best = i; } }
  return { s: cy.cum[best], d: bd };
}

function buildSorterLife() {
  if (!SR.extra || !SR.levels) return;
  const E = SR.extra, N = SR.levels;
  for (const k of Object.keys(SRV)) delete SRV[k];
  Object.assign(SRV, { ready: false, P: [], free: [], cycles: [], carts: [], parts: [], chutes: [], inds: [], teles: [], ops: [], plates: [],
    bagsM: [], bagFree: [], fingers: [], lanes: [], t: 0, stats: { induzidos: 0, ordenados: 0, sacas: 0, gaiolas: 0, carregadas: 0 } });

  /* carrinhos: P.carrinhosNivel por nível, distribuídos nos circuitos do nível, girando a uma volta por P.voltaSorter */
  const lv = N.levels.slice(0, P.niveisSorter);
  for (const L0 of lv) {
    const cys = L0.cycles.map(c => srCycle(c, L0.z)), tot = cys.reduce((a, c) => a + c.len, 0);
    let left = P.carrinhosNivel;
    cys.forEach((cy, i) => {
      cy.n = i === cys.length - 1 ? left : Math.max(1, Math.round(P.carrinhosNivel * cy.len / tot)); left -= cy.n;
      cy.v = tot / P.voltaSorter; cy.off = 0; cy.busy = new Array(cy.n).fill(null); cy.dests = [];
      SRV.cycles.push(cy);
    });
  }
  const nCarts = SRV.cycles.reduce((a, c) => a + c.n, 0);
  const cartsGrp = new THREE.Group(); cartsGrp.name = 'carrinhos';
  if (SR.cartsGrp && SR.cartsGrp.parent) SR.cartsGrp.parent.remove(SR.cartsGrp);
  SR.cartsGrp = cartsGrp; SR.grp && SR.grp.add(cartsGrp);
  for (const part of N.parts) {
    const d = SR.data.geos[part.g]; if (!d) continue;
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SR.buf, d.p, d.np * 3), 3));
    G.setIndex(new THREE.BufferAttribute(d.i16 ? new Uint16Array(SR.buf, d.i, d.ni) : new Uint32Array(SR.buf, d.i, d.ni), 1));
    const mat = part.g === 858 ? SR_MATS.esteira : part.g === 860 ? SR_MATS.carro : SR_MATS.metal;
    const IM = new THREE.InstancedMesh(G, mat, nCarts); IM.frustumCulled = false; IM.castShadow = false; IM.receiveShadow = true;
    cartsGrp.add(IM); SRV.parts.push({ IM, rel: new THREE.Matrix4().set(...part.rel) });
  }

  /* pacotes: uma malha instanciada */
  const NP = 5000;
  SRV.parcels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std({ color: 0xffffff, map: TEX.kraft || null, roughness: .9, metalness: 0 }), NP);
  SRV.parcels.userData.disposeAll = true; SRV.parcels.castShadow = false; SRV.parcels.receiveShadow = true; SRV.parcels.frustumCulled = false;
  const tones = [0xffffff, 0xf3e3c8, 0xe8d2ad, 0xfff6e8, 0xdcc19a];
  for (let k = 0; k < NP; k++) {
    SRV.P.push({ k, on: false, s: V3(rand(.22, .5), rand(.12, .34), rand(.2, .42)), yawJ: rand(-.15, .15), mode: null, pos: V3() });
    SRV.parcels.setColorAt(k, C(pick(tones))); SRV.free.push(k); _sm.makeScale(0, 0, 0); SRV.parcels.setMatrixAt(k, _sm);
  }
  world.add(SRV.parcels);

  /* sacas: as das quedas (fixas, enchem) e as em movimento (take away, outbound) */
  const bagGeo = new THREE.CylinderGeometry(.34, .4, 1, 12).translate(0, .5, 0), bagMat = std({ color: 0xeef0f1, roughness: .85, metalness: 0 });
  SRV.bags = new THREE.InstancedMesh(bagGeo, bagMat, E.chutes.length); SRV.bags.userData.disposeAll = true; SRV.bags.receiveShadow = true;
  SRV.mov = new THREE.InstancedMesh(bagGeo, std({ color: 0xdfe4e8, roughness: .85 }), 700); SRV.mov.userData.disposeAll = true; SRV.mov.frustumCulled = false;
  _sm.makeScale(0, 0, 0);
  for (let i = 0; i < E.chutes.length; i++) SRV.bags.setMatrixAt(i, _sm);
  for (let i = 0; i < 700; i++) { SRV.mov.setMatrixAt(i, _sm); SRV.bagFree.push(i); SRV.bagsM.push({ i, on: false }); }
  world.add(SRV.bags, SRV.mov);

  /* outbound: linha que vem da matriz e os chutes (dedos) com gaiola, buffer de endereçamento e ruas */
  const O = E.outb, fz = O.fingers.filter(x => x > 320 && x < 484);
  const doorsX = [345, 370, 395, 420, 445, 470];
  fz.forEach((x, i) => {
    const f = { x, i, top: srW(x, O.topY, 1.6), end: srW(x, O.endY, O.endZ), cagePos: srW(x, O.endY - 1.6, 0), bufPos: srW(x, O.endY - 6.5, 0),
      rua: doorsX.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a), queue: [], cage: null, bags: 0, job: null, ruaN: 0 };
    zoneBox(f.bufPos.x - .8, f.bufPos.z - .7, f.bufPos.x + .8, f.bufPos.z + .7, 'yellow', .05);
    f.cage = newCage(0, `Gaiola de sacas · chute ${i + 1}`); place(f.cage, world, f.cagePos, 0);
    const w = makeWorker('outbound'); w.home = f.cagePos.clone().add(V3(0, 0, 1.4)); w.root.position.copy(w.home); w.restYaw = PI; w.setYaw(PI);
    w.where = `Outbound · chute ${i + 1}`; w.state = 'aguardando sacas'; world.add(w.root); f.w = w;
    SRV.fingers.push(f);
  });
  for (const x of doorsX) { const a = srW(x - 1.1, SR_BOUNDS.Y0 + 1, 0), b = srW(x + 1.1, SR_BOUNDS.Y0 + 9, 0); zoneBox(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z), 'green', .06); }
  if (SRV.fingers.length) {
    const f0 = SRV.fingers[0], fN = SRV.fingers[SRV.fingers.length - 1];
    floorText(world, [{ t: 'BUFFER DE ENDEREÇAMENTO', size: 70 }, { t: 'gaiolas fechadas · 10 sacas', size: 36, weight: 600, font: MONO }], (f0.bufPos.x + fN.bufPos.x) / 2 - 2.2, (f0.bufPos.z + fN.bufPos.z) / 2, 9, 1.2, PI / 2, { w: 900, h: 170, color: '#7a5d00' });
  }

  /* quedas (rampas): saca no fim da rampa, ao lado da estação */
  E.chutes.forEach((c, i) => {
    const lo = srW(...c.lo), hi = srW(...c.hi);
    if (srInPlant(lo.x, lo.z, 1)) return;
    const dir = lo.clone().sub(hi).setY(0).normalize();
    const bag = lo.clone().addScaledVector(dir, .35); bag.y = Math.max(0, lo.y - 1.35);
    const ch = { bi: SRV.chutes.length, i, lo, hi, dir, bag, out: V3(-dir.z, 0, dir.x), fill: Math.floor(rand(0, P.pacotesSaca)), state: 'ok', k: 0, op: null,
      dest: SRV.fingers.length ? SRV.fingers[i % SRV.fingers.length] : null };
    SRV.chutes.push(ch);
    // circuitos que passam por cima da rampa (descarregam nela)
    for (const cy of SRV.cycles) { const q = srNearestS(cy, c.hi[0], c.hi[1]); if (q.d < 3.2) cy.dests.push({ ch, s: q.s }); }
  });
  SRV.chutes.forEach(srBagMatrix); SRV.bags.count = SRV.chutes.length;
  // lado de fora (take away): perpendicular à rampa, longe do centro do sorter
  const mid = srW(425, 203, 0);
  for (const ch of SRV.chutes) if (ch.out.dot(ch.bag.clone().sub(mid)) < 0) ch.out.negate();

  /* colaboradores das quedas: um para cada P.quedasPorColab quedas, em fileiras */
  const rows = {};
  for (const ch of SRV.chutes) { const key = `${Math.round(ch.lo.x / 2)}|${Math.round(ch.out.x)}|${Math.round(ch.out.z)}`; (rows[key] = rows[key] || []).push(ch); }
  const rowList = Object.values(rows).flatMap(r => { r.sort((a, b) => a.lo.z - b.lo.z || a.lo.x - b.lo.x); return [r]; });
  // fileiras por proximidade: junta rampas vizinhas na mesma direção
  const pool = SRV.chutes.slice().sort((a, b) => (a.lo.x - b.lo.x) || (a.lo.z - b.lo.z));
  const seen = new Set();
  for (const ch of pool) {
    if (seen.has(ch)) continue;
    const group = [ch]; seen.add(ch);
    let cur = ch;
    while (group.length < P.quedasPorColab) {
      let best = null, bd = 2.5;
      for (const o of SRV.chutes) { if (seen.has(o) || o.out.dot(cur.out) < .9) continue; const d = o.bag.distanceTo(cur.bag); if (d < bd) { bd = d; best = o; } }
      if (!best) break; group.push(best); seen.add(best); cur = best;
    }
    const m = group[Math.floor(group.length / 2)];
    const w = makeWorker('rampa'); const home = m.bag.clone().addScaledVector(m.out, 1.3).setY(0);
    w.home = home; w.root.position.copy(home); w.restYaw = srYaw(m.out.clone().negate()); w.setYaw(w.restYaw);
    w.where = 'Sorter · quedas'; w.state = 'acompanhando as sacas'; world.add(w.root);
    const op = { w, ch: group, job: null }; group.forEach(c => c.op = op); SRV.ops.push(op);
  }
  void rowList;

  /* indução: mesas nos níveis; pacote desce do topo, o colaborador põe na mesa, a mesa dispara no carrinho livre */
  // cada boneco do CAD marca um posto: o operador fica no lugar dele, de frente para a mesa mais próxima
  const plates = E.ind.map(it => ({ it, a: srW(...it.a), b: srW(...it.b) })), taken = new Set();
  for (const mn of (E.mann || [])) {
    const pos = srW(mn[0], mn[1], mn[2]);
    if (srInPlant(pos.x, pos.z, 1)) continue;
    let best = null;
    for (const pl of plates) {
      if (taken.has(pl)) continue;
      const d = Math.hypot(pl.a.x - pos.x, pl.a.z - pos.z), dz = Math.abs(pl.a.y - pos.y);
      if (d < 4.5 && dz < 2.0 && (!best || d < best.d)) best = { pl, d };
    }
    if (!best) continue;
    const { it, a, b } = best.pl;
    let cyb = null;
    for (const cy of SRV.cycles) { if (Math.abs(cy.z - it.b[2]) > .5) continue; const q = srNearestS(cy, it.b[0], it.b[1]); if (q.d < 2.2 && (!cyb || q.d < cyb.q.d)) cyb = { cy, q }; }
    if (!cyb) continue;
    taken.add(best.pl);
    const dir = b.clone().sub(a).setY(0).normalize(), side = V3(-dir.z, 0, dir.x);
    const w = makeWorker('inducaoSorter'); w.home = pos.clone(); w.root.position.copy(pos);
    w.restYaw = srYaw(a.clone().sub(pos).setY(0)); w.setYaw(w.restYaw);
    w.where = 'Sorter · mesa de indução'; w.state = 'induzindo pacotes'; world.add(w.root);
    // plataforma ("mesa") onde o colaborador fica
    if (pos.y > .3) { const pf = new THREE.Mesh(new THREE.BoxGeometry(2.2, .08, 2.2), SR_MATS.carro); pf.position.set(pos.x, pos.y - .04, pos.z); pf.userData.disposeGeo = true; world.add(pf);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, .05, .05), SR_MATS.metal); rail.userData.disposeGeo = true;
      const r1 = rail.clone(); r1.position.set(pos.x, pos.y + 1.05, pos.z); r1.lookAt(pos.x + dir.x, pos.y + 1.05, pos.z + dir.z); r1.rotateY(PI / 2); r1.translateZ(1.05); world.add(r1); }
    // escorregador: os pacotes sobem de baixo, por uma esteira inclinada, até a mão do colaborador
    const hand = a.clone().addScaledVector(dir, -.5); hand.y = Math.max(a.y, pos.y + .85);
    const feed = hand.clone().addScaledVector(dir, -3.4); feed.y = Math.max(.6, pos.y - 2.4);
    {
      const d = hand.clone().sub(feed), L0 = d.length(), m = new THREE.Mesh(new THREE.BoxGeometry(.62, .04, L0 + .2), SR_MATS.esteira);
      m.position.copy(feed).add(hand).multiplyScalar(.5); m.position.y -= .03; m.lookAt(hand.x, hand.y - .03, hand.z); m.userData.disposeGeo = true; world.add(m);
      const r = new THREE.Mesh(new THREE.BoxGeometry(.06, .16, L0 + .2), SR_MATS.metal); r.userData.disposeGeo = true;
      for (const sg of [-1, 1]) { const q = r.clone(); q.position.copy(m.position).addScaledVector(side, sg * .34); q.quaternion.copy(m.quaternion); world.add(q); }
    }
    // leitura: pórtico com scanner e tela no começo da mesa do computador
    {
      const pm = SR_MATS.carro, at = a.clone().addScaledVector(dir, .6);
      const add = (g, x, y, z, mat = pm) => { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.userData.disposeGeo = true; world.add(m); return m; };
      for (const sg of [-1, 1]) add(new THREE.BoxGeometry(.05, .75, .05), at.x + side.x * sg * .42, at.y + .37, at.z + side.z * sg * .42);
      const top = add(new THREE.BoxGeometry(.9, .08, .14), at.x, at.y + .76, at.z); top.lookAt(at.x + side.x, at.y + .76, at.z + side.z);
      const scr = add(new THREE.BoxGeometry(.42, .28, .04), pos.x + dir.x * .5 + side.x * .55, pos.y + 1.35, pos.z + dir.z * .5 + side.z * .55, SCREEN_MAT);
      scr.lookAt(pos.x, pos.y + 1.35, pos.z);
    }
    SRV.inds.push({ a, b, dir, side, feed, hand, cy: cyb.cy, sb: cyb.q.s, w, timer: rand(0, 3), wait: null });
  }

  /* telescópicas (docas): carreta, parede de caixas e descarga na ponta */
  const trailerM = std({ color: 0xe9ecee, roughness: .7, metalness: .1, side: THREE.DoubleSide });
  const boxes = [];
  for (const t of E.teles) {
    const tip = srW(...t.tip), inner = srW(t.tip[0], t.inner, t.tip[2]);
    if (srInPlant(tip.x, tip.z, 2)) continue;
    const dir = inner.clone().sub(tip).setY(0).normalize();
    const wallX = SR_BOUNDS.Y1 - SR.Yc + .5, tl = 13.6, tw = 2.5, th = 2.7, fy = 1.15, cx = wallX + tl / 2, cz = tip.z;
    const add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), trailerM); m.position.set(x, y, z); m.userData.disposeGeo = true; m.receiveShadow = true; world.add(m); };
    add(tl, .08, tw, cx, fy, cz); add(tl, .06, tw, cx, fy + th, cz); add(tl, th, .06, cx, fy + th / 2, cz - tw / 2); add(tl, th, .06, cx, fy + th / 2, cz + tw / 2); add(.06, th, tw, wallX + tl, fy + th / 2, cz);
    for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 4; iz++) for (let iy = 0; iy < 5; iy++) boxes.push([wallX + tl - .4 - ix * .55, fy + .25 + iy * .5, cz - tw / 2 + .32 + iz * .62]);
    const w = makeWorker('descarga'); const pos = V3(tip.x + 1.0, fy, tip.z + .55);
    w.home = pos; w.root.position.copy(pos); w.restYaw = PI / 2; w.setYaw(w.restYaw); w.where = 'Doca · telescópica'; w.state = 'descarregando a carreta'; world.add(w.root);
    // perfil da lona: placas de esteira sob a linha da telescópica (altura em função da distância à ponta)
    const prof = [];
    for (const bl of E.belts) {
      if (Math.abs(bl[0] - t.tip[0]) > .9 || bl[1] < t.inner - 1 || bl[1] > t.tip[1] + 1) continue;
      for (const sgn of [-1, 1]) prof.push([t.tip[1] - (bl[1] + sgn * bl[4] * bl[6] / 2), bl[2] + sgn * bl[5] * bl[6] / 2]);
    }
    prof.sort((p, q) => p[0] - q[0]);
    SRV.teles.push({ tip: tip.clone().setY(prof.length ? prof[0][1] : tip.y), inner, dir, prof, w, timer: rand(0, 4) });
  }
  if (boxes.length) {
    const IMb = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .45, .58), std({ color: 0xc8a06a, map: TEX.kraft || null, roughness: .9 }), boxes.length);
    boxes.forEach((p, i) => { _sm.makeTranslation(p[0], p[1], p[2]); IMb.setMatrixAt(i, _sm); }); IMb.userData.disposeAll = true; world.add(IMb);
  }

  /* pacotes rodando nas esteiras do térreo */
  let budget = 1100;
  for (const b of E.belts) {
    if (budget <= 0) break;
    if (b[2] > 2.2) continue;
    const c = srW(b[0], b[1], b[2]); if (srInPlant(c.x, c.z, 1)) continue;
    const a = srDir(b[3], b[4], b[5]).normalize(), len = b[6], n = Math.min(budget, Math.floor(len / 2.6)); if (!n) continue;
    const pl = { c, a, len, ps: [] };
    for (let i = 0; i < n; i++) { const p = srParcel(); if (!p) break; p.mode = 'plate'; p.u = (i + rand(0, .6)) * len / n; pl.ps.push(p); budget--; }
    SRV.plates.push(pl);
  }
  SRV.ready = true;
}

function srParcel() { const k = SRV.free.pop(); if (k == null) return null; const p = SRV.P[k]; p.on = true; p.mode = null; return p; }
function srKill(p) { p.on = false; SRV.free.push(p.k); _sm.makeScale(0, 0, 0); SRV.parcels.setMatrixAt(p.k, _sm); }
function srPlace(p, pos, yaw) {
  _sq.setFromAxisAngle(_up, yaw + p.yawJ); _sp.copy(pos); _sp.y += p.s.y / 2;
  _sm.compose(_sp, _sq, p.s); SRV.parcels.setMatrixAt(p.k, _sm);
}
function srBagMatrix(ch) {
  const h = .3 + .9 * Math.min(1, ch.fill / P.pacotesSaca);
  _sm.compose(ch.bag, _sq.identity(), _ss.set(1, ch.state === 'vazia' ? .25 : h, 1)); SRV.bags.setMatrixAt(ch.bi, _sm);
}
function srBagNew(route, f) {
  const i = SRV.bagFree.pop(); if (i == null) return null;
  const b = SRV.bagsM[i]; Object.assign(b, { on: true, route, seg: 0, k: 0, f, mode: 'take', pos: route[0].clone() }); return b;
}
function srBagDraw(b) {
  if (!b.on) { _sm.makeScale(0, 0, 0); SRV.mov.setMatrixAt(b.i, _sm); return; }
  _sm.compose(b.pos, _sq.identity(), _ss.set(1, 1.1, 1)); SRV.mov.setMatrixAt(b.i, _sm);
}
function srTakeAwayRoute(ch) {
  // da estação ao take away, pela matriz até a linha do outbound e o chute do destino
  const f = ch.dest, O = SR.extra.outb, pts = [];
  const p0 = ch.bag.clone().addScaledVector(ch.out, 1.0); p0.y = .9; pts.push(ch.bag.clone().setY(.9), p0);
  const toD = w => ({ X: w.z + SR.Xc, Y: w.x + SR.Yc });
  const d0 = toD(p0);
  pts.push(srW(356, d0.Y, .9), srW(352, 174, .9), srW(330, 166, .9), srW(O.x0 + 4, O.lineY, 1.7), srW(f.x, O.lineY, 1.7), f.top.clone(), f.end.clone().setY(.9));
  return pts;
}

function sorterUpdate(dt) {
  if (!SRV.ready) return;
  SRV.t += dt;
  const v = V3(), tan = {};
  /* carrinhos girando */
  let ci = 0;
  for (const cy of SRV.cycles) {
    cy.off = (cy.off + cy.v * dt) % cy.len;
    for (let k = 0; k < cy.n; k++) {
      srAt(cy, k * cy.len / cy.n + cy.off, v, tan);
      _sm.makeRotationZ(tan.t); _sm.setPosition(v.x - SR_ORIGIN[0], v.y - SR_ORIGIN[1], v.z - .0);
      for (const pt of SRV.parts) { _sm2.multiplyMatrices(_sm, pt.rel); pt.IM.setMatrixAt(ci, _sm2); }
      ci++;
    }
  }
  for (const pt of SRV.parts) pt.IM.instanceMatrix.needsUpdate = true;
  const cartWorld = (cy, k, out) => { const d = srAt(cy, k * cy.len / cy.n + cy.off, _sv); return srW(d.x, d.y, d.z + .037, out); };

  /* esteiras do térreo */
  for (const pl of SRV.plates) for (const p of pl.ps) {
    p.u += 1.1 * dt; if (p.u > pl.len) p.u -= pl.len;
    v.copy(pl.c).addScaledVector(pl.a, p.u - pl.len / 2); v.y += .02; srPlace(p, v, srYaw(pl.a));
  }
  /* telescópicas */
  for (const t of SRV.teles) {
    t.timer -= dt; const ph = (t.timer % 4 + 4) % 4;
    t.w.pose(ph > 2.6 ? .85 : ph > 1.6 ? .35 : .1, ph > 2.6 ? .7 : .2); t.w.walkPose(0, false);
    if (t.timer <= 0) { t.timer += 4; const p = srParcel(); if (p) { p.mode = 'tele'; p.pos.copy(t.tip); p.t = t; } }
  }
  /* mesas de indução */
  const dtInd = 3600 / P.inducaoSorterPh;
  for (const it of SRV.inds) {
    it.timer -= dt; const ph = (it.timer % dtInd + dtInd) % dtInd;
    it.w.pose(ph > dtInd * .7 ? .9 : ph > dtInd * .45 ? .45 : .15, ph > dtInd * .7 ? .45 : .12); it.w.walkPose(0, false);
    if (it.timer <= 0) { it.timer += dtInd; const p = srParcel(); if (p) { p.mode = 'feed'; p.pos.copy(it.feed); p.it = it; p.k0 = 0; } }
  }
  /* pacotes em trânsito */
  for (const p of SRV.P) {
    if (!p.on || p.mode === 'plate') continue;
    if (p.mode === 'tele') {
      p.pos.addScaledVector(p.t.dir, 1.0 * dt);
      if (p.pos.clone().sub(p.t.inner).dot(p.t.dir) > 0) { srKill(p); continue; }
      const pr = p.t.prof; if (pr.length) {   // segue a altura da lona
        const u = p.pos.clone().sub(p.t.tip).setY(0).length(); let y = pr[0][1];
        for (let i = 1; i < pr.length; i++) if (pr[i][0] >= u) { const a = pr[i - 1], b = pr[i]; y = a[1] + (b[1] - a[1]) * clamp01((u - a[0]) / Math.max(1e-3, b[0] - a[0])); break; } else y = pr[i][1];
        p.pos.y = y + .01;
      }
      srPlace(p, p.pos, srYaw(p.t.dir));
    } else if (p.mode === 'feed') {          // desce pela calha até a mão do colaborador, que põe na mesa
      const it = p.it; p.k0 += dt / 1.6; const k = Math.min(1, p.k0);
      if (k < .75) v.lerpVectors(it.feed, it.hand, k / .75); else { v.lerpVectors(it.hand, it.a, (k - .75) / .25); v.y += Math.sin((k - .75) / .25 * PI) * .18; }
      srPlace(p, v, srYaw(it.dir));
      if (k >= 1) { p.mode = 'mesa'; p.pos.copy(it.a); SRV.stats.induzidos++; }
    } else if (p.mode === 'mesa') {          // corre na mesa até a ponta e espera o carrinho livre
      const it = p.it, L0 = it.b.distanceTo(it.a), u = p.pos.clone().sub(it.a).dot(it.dir);
      if (u < L0 - .05) p.pos.addScaledVector(it.dir, Math.min(1.2 * dt, L0 - u));
      else {
        const cy = it.cy;
        let kk = Math.round((it.sb - cy.off) / (cy.len / cy.n)); kk = ((kk % cy.n) + cy.n) % cy.n;
        const sk = ((kk * cy.len / cy.n + cy.off) % cy.len + cy.len) % cy.len;
        if (!cy.busy[kk] && Math.abs(sk - it.sb) < .35 && cy.dests.length) {
          const opts = cy.dests.filter(d => d.ch.state === 'ok');
          if (opts.length) {
            const d = pick(opts); cy.busy[kk] = p;
            Object.assign(p, { mode: 'cart', cy, kk, need: ((d.s - it.sb) % cy.len + cy.len) % cy.len, run: 0, dest: d.ch });
          }
        }
      }
      if (p.mode === 'mesa') srPlace(p, p.pos, srYaw(it.dir));
    }
    if (p.mode === 'cart') {                 // no carrinho até a queda do destino
      p.run += p.cy.v * dt;
      cartWorld(p.cy, p.kk, p.pos);
      if (p.run >= p.need) {
        p.cy.busy[p.kk] = null; p.mode = 'queda'; p.k0 = 0;
        const ch = p.dest, h = clamp((p.pos.y - ch.lo.y) / Math.max(.1, ch.hi.y - ch.lo.y), 0, 1);
        p.from = p.pos.clone(); p.top = ch.lo.clone().lerp(ch.hi, h); SRV.stats.ordenados++;
      } else srPlace(p, p.pos, 0);
    } else if (p.mode === 'queda') {         // cai na rampa, desce até a saca
      const ch = p.dest; p.k0 += dt; let k;
      if (p.k0 < .35) { k = p.k0 / .35; v.lerpVectors(p.from, p.top, k); }
      else { const L0 = p.top.distanceTo(ch.lo); k = Math.min(1, (p.k0 - .35) * 3.0 / Math.max(.5, L0)); v.lerpVectors(p.top, ch.lo, k);
        if (k >= 1) { srKill(p); if (ch.state === 'ok') { ch.fill++; if (ch.fill >= P.pacotesSaca) ch.state = 'cheia'; srBagMatrix(ch); } continue; } }
      srPlace(p, v, srYaw(ch.dir));
    }
  }
  /* colaboradores das quedas: fecha a saca, empurra para o take away, põe saca vazia */
  for (const op of SRV.ops) {
    const w = op.w;
    if (!op.job) {
      const ch = op.ch.find(c => c.state === 'cheia');
      if (ch) { ch.state = 'reservada'; op.job = { ch, phase: 'ir', to: ch.bag.clone().addScaledVector(ch.out, .7).setY(0), k: 0 }; w.state = 'trocando saca cheia'; }
      else { w.idle(dt); continue; }
    }
    const j = op.job, target = j.phase === 'voltar' ? w.home : j.to;
    const d = target.clone().sub(w.root.position).setY(0), dist = d.length();
    if (j.phase === 'ir' || j.phase === 'voltar') {
      if (dist > .05) { w.root.position.addScaledVector(d.normalize(), Math.min(dist, P.velPessoa * dt)); w.setYaw(lerpAngle(w.yaw, Math.atan2(d.x, d.z), Math.min(1, dt * 8))); w.pose(0, 0); }
      else if (j.phase === 'ir') { j.phase = 'fechar'; j.k = 0; } else { op.job = null; w.state = 'acompanhando as sacas'; }
    } else {
      j.k += dt; w.setYaw(lerpAngle(w.yaw, srYaw(j.ch.out.clone().negate()), Math.min(1, dt * 6)));
      if (j.phase === 'fechar') { w.pose(.75 + .15 * Math.sin(j.k * 6), .6); if (j.k > 2.2) { j.phase = 'empurrar'; j.k = 0; } }
      else if (j.phase === 'empurrar') {
        w.pushPose(1);
        if (j.k > .9) {
          const ch = j.ch; if (ch.dest) { const b = srBagNew(srTakeAwayRoute(ch), ch.dest); if (b) SRV.stats.sacas++; }
          ch.state = 'vazia'; ch.fill = 0; srBagMatrix(ch); j.phase = 'repor'; j.k = 0;
        }
      } else if (j.phase === 'repor') { w.pose(.6, .5); if (j.k > 1.2) { j.ch.state = 'ok'; srBagMatrix(j.ch); j.phase = 'voltar'; } }
    }
  }
  /* sacas no take away e no outbound */
  for (const b of SRV.bagsM) {
    if (!b.on) continue;
    if (b.mode === 'take') {
      let step = 1.6 * dt;
      while (step > 0 && b.seg < b.route.length - 1) {
        const A = b.route[b.seg], B = b.route[b.seg + 1], L0 = A.distanceTo(B), left = L0 * (1 - b.k);
        if (step >= left) { step -= left; b.seg++; b.k = 0; } else { b.k += step / L0; step = 0; }
      }
      if (b.seg >= b.route.length - 1) { b.mode = 'chute'; b.pos.copy(b.route[b.route.length - 1]); b.f.queue.push(b); }
      else b.pos.lerpVectors(b.route[b.seg], b.route[b.seg + 1], b.k);
    }
    srBagDraw(b);
  }
  /* outbound: saca do chute para a gaiola; gaiola cheia -> buffer de endereçamento -> rua */
  for (const f of SRV.fingers) srFingerStep(f, dt);
  SRV.parcels.instanceMatrix.needsUpdate = true; SRV.bags.instanceMatrix.needsUpdate = true; SRV.mov.instanceMatrix.needsUpdate = true;
}
function srWalk(w, to, dt, speed, push) {
  const d = to.clone().sub(w.root.position).setY(0), dist = d.length();
  if (dist < .05) return true;
  w.root.position.addScaledVector(d.normalize(), Math.min(dist, speed * dt));
  w.setYaw(lerpAngle(w.yaw, Math.atan2(d.x, d.z), Math.min(1, dt * 8)));
  if (push) w.pushPose(1); else w.pose(0, 0);
  return false;
}
function srFingerStep(f, dt) {
  const w = f.w;
  if (!f.job) {
    if (f.bags >= P.sacasGaiola) f.job = { phase: 'buffer', cage: f.cage };
    else if (f.queue.length) f.job = { phase: 'saca', b: f.queue.shift(), k: 0 };
    else if (f.waiting && SRV.t >= f.waiting.until) f.job = { phase: 'rua', cage: f.waiting.cage };
    else { w.idle(dt); return; }
  }
  const j = f.job;
  if (j.phase === 'saca') {   // pega a saca no fim do chute e põe na gaiola
    j.k += dt; w.pose(.8, .6); w.state = 'pondo saca na gaiola';
    if (j.k > 1.4) { j.b.on = false; SRV.bagFree.push(j.b.i); srBagDraw(j.b); f.bags++; f.cage.fill = f.bags * f.cage.cap / P.sacasGaiola; setCageFill(f.cage); f.job = null; }
  } else if (j.phase === 'buffer') {   // fecha a gaiola e leva ao buffer de endereçamento
    w.state = 'levando gaiola ao buffer de endereçamento';
    const to = f.bufPos.clone().add(V3(0, 0, 1.1));
    const arrived = srWalk(w, to, dt, P.velPaleteira, true);
    j.cage.grp.position.copy(w.root.position).add(V3(0, 0, -1.1)); j.cage.grp.position.y = 0;
    if (arrived) {
      f.waiting = { cage: j.cage, until: SRV.t + P.permanenciaBuffer }; SRV.stats.gaiolas++;
      f.cage = newCage(0, `Gaiola de sacas · chute ${f.i + 1}`); place(f.cage, world, f.cagePos, 0); f.bags = 0;
      f.job = { phase: 'volta' };
    }
  } else if (j.phase === 'rua') {    // do endereçamento para a rua de destino
    w.state = 'levando gaiola para a rua de destino';
    if (!j.slot) { const n = f.ruaN++ % 4; j.slot = srW(f.rua + (f.i % 2 ? .7 : -.7), SR_BOUNDS.Y0 + 2 + n * 1.5, 0); }
    if (!j.got) { if (srWalk(w, j.cage.grp.position.clone().add(V3(0, 0, 1.1)), dt, P.velPessoa, false)) j.got = true; return; }
    const arrived = srWalk(w, j.slot.clone().add(V3(0, 0, 1.1)), dt, P.velPaleteira, true);
    j.cage.grp.position.copy(w.root.position).add(V3(0, 0, -1.1)); j.cage.grp.position.y = 0;
    if (arrived) {
      const c = j.cage; f.waiting = null;
      (SRV.loads = SRV.loads || []).push({ c, until: SRV.t + P.permanenciaRua });
      f.job = { phase: 'volta' };
    }
  } else if (j.phase === 'volta') {
    w.state = 'voltando ao chute';
    if (srWalk(w, w.home, dt, P.velPessoa, false)) { w.setYaw(lerpAngle(w.yaw, w.restYaw, Math.min(1, dt * 6))); f.job = null; w.state = 'aguardando sacas'; }
  }
  // carregamento: gaiolas na rua saem depois do tempo de espera
  if (SRV.loads && f.i === 0) SRV.loads = SRV.loads.filter(x => { if (SRV.t >= x.until) { killCage(x.c); SRV.stats.carregadas++; return false; } return true; });
}
window.__sr = () => ({
  pecas: SR.count, ciclos: SRV.cycles.length, carrinhos: SRV.cycles.reduce((a, c) => a + c.n, 0), volta_m: SRV.cycles.map(c => Math.round(c.len)),
  rampas: SRV.chutes.length, mesas: SRV.inds.length, telescopicas: SRV.teles.length, colabQuedas: SRV.ops.length, chutesOutbound: SRV.fingers.length,
  pacotes: SRV.P.filter(p => p.on).reduce((a, p) => (a[p.mode] = (a[p.mode] || 0) + 1, a), {}),
  sacasCheias: SRV.chutes.filter(c => c.state !== 'ok').length, sacasNoTake: SRV.bagsM.filter(b => b.on).length, ...SRV.stats,
});
window.__srDbg = () => SRV;
window.__srPick = (x, y) => { const r = new THREE.Raycaster(), n = new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)); r.setFromCamera(n, camera); const h = r.intersectObjects(SR.grp ? [SR.grp] : [], true)[0]; return h ? { g: h.object.userData.g, id: h.instanceId, d: h.distance } : null; };
