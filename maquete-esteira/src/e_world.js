
/* ------------------------------------------------------------------ */
/* Mundo: montado a partir das premissas (reconstruído ao aplicar)      */
/* ------------------------------------------------------------------ */
let L = null, world = null, S = null, ASSET = {}, dimGroup = null;
let ROOT = null, LINES = [], PLANT = null, AGG = null, IND_SEQ = 0;
const LINE_NAMES = [['ESTEIRA TERMOPLÁSTICA', 'Termoplástica'], ['ESTEIRA LONA 01', 'Lona 01'], ['ESTEIRA LONA 02', 'Lona 02']];
let hitTargets = [];
const H_ROOF = 11;
const LABEL_GEO = new THREE.PlaneGeometry(.5, .25);
const SLAB_SIDE = std({ color: 0xb9bcbd, roughness: .9 });
const WALL = std({ color: 0xe8eaeb, roughness: .8, metalness: .05 });
const CURB = std({ color: 0x8e9396, roughness: .9 });
MAT.wall = WALL; MAT.curb = CURB; MAT.slabSide = SLAB_SIDE;

function disposeWorld() {
  if (!ROOT) return;
  ROOT.traverse(o => {
    if (o.userData.disposeGeo && o.geometry) o.geometry.dispose();
    if (o.userData.disposeAll) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
  });
  for (const k in ASSET) { const v = ASSET[k]; if (v.isBufferGeometry) v.dispose(); else for (const key in v) v[key].dispose(); }
  scene.remove(ROOT); ROOT = null; world = null; LINES = []; PLANT = null;
}

/* ---------- unitizadores móveis ---------- */
function setLabel(sc, text) {
  if (sc.label.material.map) sc.label.material.map.dispose();
  sc.label.material.map = textTexture([{ t: text, size: 66, font: MONO, weight: 600 }], { w: 256, h: 128, bg: '#f7f7f3', color: '#1a2230' });
  sc.label.material.needsUpdate = true; sc.code = text;
}
function setScFill(sc) {
  const h = (P.scuttleAlt - .25) * Math.min(1, sc.fill / sc.cap);
  sc.fillM.scale.y = Math.max(.02, h); sc.fillM.visible = sc.fill > 0;
}
function newScuttle(text, fill = 0) {
  const g = instance(ASSET.scuttle);
  const fillM = new THREE.Mesh(ASSET.scFill, MAT.fill); fillM.position.y = PAL_H + .015; fillM.receiveShadow = true; g.add(fillM);
  const label = new THREE.Mesh(LABEL_GEO, std({ color: 0xffffff, roughness: .7 })); label.userData.disposeAll = false;
  label.position.set(0, PAL_H + P.scuttleAlt - .22, .598); g.add(label);
  const hit = new THREE.Mesh(box(1.0, P.scuttleAlt + PAL_H, 1.2), MAT.hit); hit.position.y = (P.scuttleAlt + PAL_H) / 2; g.add(hit);
  const sc = { kind: 'scuttle', grp: g, fillM, label, hit, fill, cap: P.scuttleCap, code: '' };
  hit.userData = { kind: 'scuttle', ref: sc }; hitTargets.push(hit);
  setLabel(sc, text); setScFill(sc);
  return sc;
}
function killScuttle(sc) {
  if (sc.label.material.map) sc.label.material.map.dispose(); sc.label.material.dispose();
  const i = hitTargets.indexOf(sc.hit); if (i >= 0) hitTargets.splice(i, 1);
  if (sc.grp.parent) sc.grp.parent.remove(sc.grp);
}
function setCageFill(c) {
  const h = (P.gaiolaAlt - .35) * .92 * Math.min(1, c.fill / c.cap);
  c.fillM.scale.y = Math.max(.02, h); c.fillM.visible = c.fill > 0;
}
function newCage(fill, name) {
  const g = instance(ASSET.cage);
  const fillM = new THREE.Mesh(ASSET.cgFill, MAT.fill); fillM.position.y = .17; fillM.receiveShadow = true; g.add(fillM);
  const hit = new THREE.Mesh(box(1.2, P.gaiolaAlt, 1.0), MAT.hit); hit.position.y = P.gaiolaAlt / 2; g.add(hit);
  const c = { kind: 'cage', grp: g, fillM, hit, fill, cap: P.gaiolaCap, name };
  hit.userData = { kind: 'cage', ref: c }; hitTargets.push(hit);
  setCageFill(c);
  return c;
}
function killCage(c) {
  const i = hitTargets.indexOf(c.hit); if (i >= 0) hitTargets.splice(i, 1);
  if (c.grp.parent) c.grp.parent.remove(c.grp);
}
function place(obj, parent, pos, yaw) { parent.add(obj.grp); obj.grp.position.set(pos.x, 0, pos.z); obj.grp.rotation.set(0, yaw, 0); }
const fwdOf = yaw => V3(Math.sin(yaw), 0, Math.cos(yaw));

/* ---------- base da maquete: piso com grade de 1 m e 5 m (profundidade e escala) ---------- */
function buildBuilding() {
  const x0 = L.bx0 - 1.5, x1 = L.bx1 + 1.5, z0 = L.bz0 - 1.5, z1 = L.bz1 + 1.5, W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  TEX.concrete.repeat.set(W / 9, D / 9); TEX.concreteR.repeat.set(W / 9, D / 9);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, .6, D), [MAT.plinth, MAT.plinth, MAT.floor, MAT.plinth, MAT.plinth, MAT.plinth]);
  slab.position.set(cx, -.3, cz); slab.receiveShadow = true; slab.castShadow = true; slab.userData.disposeGeo = true; world.add(slab);
  const tbl = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-PI / 2), MAT.table);
  tbl.position.y = -.6; tbl.receiveShadow = true; tbl.userData.disposeGeo = true; tbl.userData.noExport = true; world.add(tbl);
  TEX.grid.repeat.set(W / 5, D / 5);
  TEX.grid.offset.set(((x0 % 5) + 5) % 5 / 5, ((-z1 % 5) + 5) % 5 / 5);
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: TEX.grid, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  grid.position.set(cx, .002, cz); grid.userData.disposeGeo = true; AO_HIDE.push(grid); world.add(grid);
}

/* ---------- esteira ---------- */
function buildBelt() {
  const hw = L.bw / 2, len = L.len, bt = L.bt;
  TEX.belt.repeat.set(len / 1.2, 1);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(len, .02, L.bw - .04), std({ color: 0xffffff, map: TEX.belt, roughness: .8, metalness: .05, envMapIntensity: .3 }));
  belt.position.set(0, bt - .01, 0); belt.receiveShadow = true; belt.castShadow = true; belt.userData.disposeAll = true; world.add(belt);
  put('rubber', box(len, .015, L.bw - .1), 0, bt - .2, 0);
  for (const s of [-1, 1]) {
    put('alu', box(len + .1, .17, .05), 0, bt - .07, s * (hw + .01));
    put('alu', box(len + .1, .02, .09), 0, bt + .02, s * (hw + .03));
    put('estop', box(L.ind, .05, .012), L.X0 + L.ind / 2, bt - .07, s * (hw + .04));
  }
  for (const x of [L.X0, L.X1]) put('alu', cyl(.085, L.bw - .02, 20), x, bt - .09, 0, PI / 2, 0, 0);
  const n = Math.round(len / 2.1);
  for (let i = 0; i <= n; i++) {
    const x = L.X0 + .15 + i * (len - .3) / n;
    for (const s of [-1, 1]) { put('steelDark', box(.06, bt - .15, .06), x, (bt - .15) / 2, s * (hw - .06)); put('steelDark', box(.16, .012, .16), x, .006, s * (hw - .06)); }
    put('steelDark', box(.04, .04, L.bw - .12), x, .25, 0);
    put('steelDark', box(.05, .05, L.bw - .12), x, bt - .16, 0);
  }
  put('steelDark', box(.06, 1.1, .06), L.X0 + .35, .55, -(hw + .3));
  put('estop', box(.22, .26, .14), L.X0 + .35, 1.18, -(hw + .3));
  put('red', cyl(.045, .05, 16), L.X0 + .35, 1.22, -(hw + .39), PI / 2, 0, 0);
  // sinaleiro (torre de luz) no fim da linha
  put('steelDark', cyl(.03, 2.2, 8), L.X1 - .3, bt + 1.1, hw + .15);
  put('green', cyl(.06, .12, 12), L.X1 - .3, bt + 2.25, hw + .15);
  put('estop', cyl(.06, .12, 12), L.X1 - .3, bt + 2.38, hw + .15);
}

/* ---------- textos de piso e faixas ---------- */
function arrow(x, z, ry, len = 3) {
  frameAt(x, 0, z, ry, () => {
    put('orangeP', plane(len, .28), 0, .007, 0);
    const tri = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, .5), new THREE.Vector2(.8, 0), new THREE.Vector2(0, -.5)])).rotateX(-PI / 2);
    put('orangeP', tri, len / 2, .007, 0);
  });
}

/* ---------- cotas ---------- */
function dimLine(ax, az, bx, bz, label, { text = 1.0 } = {}) {
  const dx = bx - ax, dz = bz - az, Ln = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
  const g = new THREE.Group(); g.position.set((ax + bx) / 2, .014, (az + bz) / 2); g.rotation.y = ang; dimGroup.add(g);
  const add = (w, d, x, z, ry = 0) => { const m = new THREE.Mesh(box(w, .004, d), MAT.dim); m.position.set(x, 0, z); m.rotation.y = ry; g.add(m); };
  add(Ln, .035, 0, 0);
  for (const e of [-Ln / 2, Ln / 2]) { add(.03, .7, e, 0); add(.36, .05, e, 0, PI / 4); }
  const lw = Math.min(Ln * .85, text * 6.5), lh = lw * 112 / 768;
  const t = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshBasicMaterial({ map: textTexture([{ t: label, size: 62, font: MONO, weight: 600 }], { w: 768, h: 112, bg: 'rgba(250,250,248,.85)', color: '#1a2230' }), transparent: true, depthWrite: false }));
  t.rotation.set(-PI / 2, 0, 0); t.position.set(0, .003, -lh * .75); t.userData.disposeAll = true; AO_HIDE.push(t); g.add(t);
}
function dimVertical(x, z, y0, y1, label) {
  const g = new THREE.Group(); g.position.set(x, 0, z); dimGroup.add(g);
  const m = new THREE.Mesh(box(.025, y1 - y0, .025), MAT.dim); m.position.y = (y0 + y1) / 2; g.add(m);
  for (const y of [y0, y1]) { const tk = new THREE.Mesh(box(.3, .025, .025), MAT.dim); tk.position.y = y; g.add(tk); }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture([{ t: label, size: 58, font: MONO, weight: 600 }], { w: 384, h: 96, bg: 'rgba(250,250,248,.92)', color: '#1a2230' }) }));
  sp.scale.set(1.3, .32, 1); sp.position.set(0, (y0 + y1) / 2, 0); sp.userData.disposeAll = true; AO_HIDE.push(sp); g.add(sp);
}

/* ---------- montagem completa: planta com N linhas ---------- */
function newLineState() {
  return {
    t: 0, induced: 0, picked: 0, sep: 0, kept: 0, swaps: 0, cageSwaps: 0, shipped: 0, hist: [],
    live: [], pool: [], goalQ: [], islands: [], inductors: [], indSlots: [], goleiros: [], gSlots: { 1: [], '-1': [] },
    jacks: { 1: [], '-1': [] }, setups: { 1: [], '-1': [] }, loaders: { 1: [], '-1': [] }, workers: [],
    scJobs: { 1: [], '-1': [] }, cgJobs: { 1: [], '-1': [] },
    cageFull: [], cageEmpty: [], fullBuf: [], emptyBuf: { 1: [], '-1': [] },
  };
}
function buildWorld() {
  disposeWorld();
  L = computeLayout(P);
  ROOT = new THREE.Group(); scene.add(ROOT); world = ROOT;
  AO_HIDE.length = 0; hitTargets = []; WORKER_SEQ = 0; IND_SEQ = 0; LINES = [];
  ASSET = {
    scuttle: buildAsset(() => { pallet(); scuttleShell(P.scuttleAlt); }),
    cage: buildAsset(() => cageGeo(P.gaiolaAlt)),
    jack: buildAsset(jackGeo),
    scFill: new THREE.BoxGeometry(.92, 1, 1.12).translate(0, .5, 0),
    cgFill: new THREE.BoxGeometry(1.1, 1, .9).translate(0, .5, 0),
  };
  dimGroup = new THREE.Group(); dimGroup.visible = $('#dims').checked; ROOT.add(dimGroup);
  roofGroup = new THREE.Group(); ROOT.add(roofGroup);
  buildPkgTypes();
  buildBuilding();
  const dimRoot = dimGroup;
  for (let li = 0; li < L.nLines; li++) {
    const zL = L.zLines[li], g = new THREE.Group(); g.name = 'linha_' + (li + 1);
    g.position.z = zL; ROOT.add(g); g.updateMatrixWorld(true);
    world = g; S = newLineState(); S.li = li; [S.name, S.short] = LINE_NAMES[li] || [`ESTEIRA ${li + 1}`, `Linha ${li + 1}`];
    dimGroup = new THREE.Group(); dimGroup.position.z = zL; if (li === 0) dimRoot.add(dimGroup);
    FRAME = new THREE.Matrix4().makeTranslation(0, 0, zL);
    buildLine(li);
    FRAME = new THREE.Matrix4();
    LINES.push({ grp: g, S, z: zL, li });
  }
  dimGroup = dimRoot;
  world = ROOT; S = PLANT = newPlantState();
  buildPlant();
  bake(ROOT);
  S = AGG = makeAgg();

  /* sol e sombras cobrindo o galpão */
  const cx = (L.bx0 + L.bx1) / 2, cz = (L.bz0 + L.bz1) / 2, halfW = (L.bx1 - L.bx0) / 2 + 6, halfD = (L.bz1 - L.bz0) / 2 + 6;
  sun.target.position.set(cx, 0, cz);
  sun.position.set(cx - 40, 80, cz + 50);
  Object.assign(sun.shadow.camera, { left: -halfW, right: halfW, top: halfD, bottom: -halfD, near: 10, far: 260 });
  sun.shadow.camera.updateProjectionMatrix();
}
function buildLine(li) {
  const hw = L.bw / 2, sides = [1, -1], base = li * 2 * L.nIsl;
  buildBelt();
  hangSign(world, S.name, `${fmtM(L.len)} m · ${fmt(P.capacidade)} pct/h`, L.X0 + 6, 0, 0, 4.2, 6.2);

  /* ilhas */
  for (const s of sides) for (let k = 0; k < L.nIsl; k++) {
    const idx = (s > 0 ? 0 : L.nIsl) + k, num = base + idx + 1, code = String(num).padStart(2, '0');
    const xc = L.xc(k);
    const grp = new THREE.Group(); grp.position.set(xc, 0, s * L.zIsl); grp.rotation.y = s > 0 ? 0 : PI; world.add(grp);
    let rk;
    withFrame(grp, () => {
      rk = islandRack(L);
      const x1 = L.half + .08, z0 = -.05, z1 = L.islDepth - .05, t = .07;
      put('yellow', plane(2 * x1, t), 0, .006, z0); put('yellow', plane(2 * x1, t), 0, .006, z1);
      put('yellow', plane(t, z1 - z0), -x1, .006, (z0 + z1) / 2); put('yellow', plane(t, z1 - z0), x1, .006, (z0 + z1) / 2);
      put('white', plane(L.rackW, .05), 0, .006, L.rack0 - .08);
    });
    floorText(grp, [{ t: `ILHA ${code}`, size: 92 }], 0, L.islDepth + .75, 2.8, .7, 0, { w: 512, h: 128 });
    const isl = { idx, gidx: base + idx, num, code, s, xc, grp, rk, slots: [], rack: [], pickers: [], seps: [], count: 0 };
    for (const bs of [-1, 1]) for (let r = 0; r < P.scuttlesPorFila; r++) {
      const name = `${bs < 0 ? 'E' : 'D'}${r + 1}`;
      const pos = V3(bs * L.scX, 0, L.rack0 + .5 + r * 1.1), yaw = bs > 0 ? -PI / 2 : PI / 2;
      const slot = { isl, bs, r, name, pos, yaw, state: 'ok', sc: null };
      slot.sc = newScuttle(`I${code}·${name}`, Math.floor(rand(0, P.scuttleCap * .92)));
      place(slot.sc, grp, pos, yaw);
      isl.slots.push(slot);
    }
    const pxs = P.pescadoresPorIlha === 2 ? [-.7, .7] : [0];
    for (const px of pxs) {
      const w = makeWorker('pescador'); w.home = V3(px, 0, L.rack0 * .5); w.root.position.copy(w.home);
      w.restYaw = PI; w.setYaw(PI); grp.add(w.root); w.where = `Ilha ${code} · ${S.short}`; isl.pickers.push(w); S.workers.push(w);
    }
    const sxs = P.separadoresPorIlha === 2 ? [-.9, .9] : [0];
    for (const sx of sxs) {
      const w = makeWorker('separador'); w.home = V3(sx, 0, L.rack1 + .55); w.root.position.copy(w.home);
      w.restYaw = PI; w.setYaw(PI); w.sideOnly = sxs.length === 2 ? Math.sign(sx) : 0;
      grp.add(w.root); w.where = `Ilha ${code} · ${S.short}`; isl.seps.push(w); S.workers.push(w);
    }
    S.islands.push(isl);
  }
  S.islands.sort((a, b) => a.idx - b.idx);

  /* indução: posições laterais + ponta, cada uma com gaiola de abastecimento */
  const addInd = (s, wpos, restYaw, cpos, psi, spot, name) => {
    const slot = { kind: 'ind', s, pos: cpos, psi, name, req: false };
    slot.cage = newCage(Math.floor(rand(8, P.gaiolaCap)), name); place(slot.cage, world, cpos, psi);
    const w = makeWorker('inducao'); w.home = wpos.clone(); w.root.position.copy(wpos); w.restYaw = restYaw; w.setYaw(restYaw);
    w.slot = slot; w.spot = spot; w.timer = rand(.2, 4); w.where = name; world.add(w.root);
    slot.worker = w; S.inductors.push(w); S.indSlots.push(slot); S.workers.push(w);
  };
  let nInd = 0;
  for (const s of sides) {
    const hatch = new THREE.Mesh(new THREE.PlaneGeometry(L.ind, 2.9).rotateX(-PI / 2), MAT.hatch);
    hatch.position.set(L.X0 + L.ind / 2, .005, s * (hw + 1.55)); hatch.receiveShadow = true; hatch.userData.disposeGeo = true; world.add(hatch);
    for (const z of [hw + .1, hw + 3.0]) put('yellow', plane(L.ind, .08), L.X0 + L.ind / 2, .006, s * z);
    for (let i = 0; i < P.inducaoPorLado; i++) {
      const x = L.X0 + L.ind * (i + .5) / P.inducaoPorLado;
      addInd(s, V3(x, 0, s * (hw + .5)), s > 0 ? PI : 0, V3(x, 0, s * (hw + 1.95)), s > 0 ? 0 : PI,
        () => V3(x + rand(-.3, .3), 0, s * rand(.12, Math.max(.15, hw - .45))), `Indução ${String(++IND_SEQ).padStart(2, '0')}`); nInd++;
    }
  }
  TEX.hatch.repeat.set(L.ind / 1.2, 2.9 / 1.2);
  if (P.inducaoPonta) {
    put('yellow', plane(3.0, .08), L.X0 - 1.6, .006, 1.3); put('yellow', plane(3.0, .08), L.X0 - 1.6, .006, -1.3);
    put('yellow', plane(.08, 2.6), L.X0 - 3.1, .006, 0);
    addInd(1, V3(L.X0 - .6, 0, 0), PI / 2, V3(L.X0 - 2.05, 0, 0), -PI / 2, () => V3(L.X0 + .6, 0, rand(-.35, .35)), `Indução ${String(++IND_SEQ).padStart(2, '0')} (ponta)`); nInd++;
  }
  for (const s of sides) floorText(world, [{ t: 'INDUÇÃO', size: 96 }, { t: `${fmtM(L.ind, 2)} m · ${nInd} posições`, size: 42, weight: 600, font: MONO }], L.X0 + L.ind / 2, s * (hw + 3.75), 4.2, 1.6, s > 0 ? 0 : PI, { w: 512, h: 196, color: '#7a5d00' });

  /* goleiro: flow rack na direção da esteira, 1 goleiro de cada lado, gaiolas atrás deles */
  S.goal = goalRack(L);
  for (const s of sides) {
    const n = Math.max(1, Math.round(P.gaiolasGoleiro / 2));
    for (let i = 0; i < n; i++) {
      const pos = V3(L.golX + (i - (n - 1) / 2) * 1.3, 0, s * (hw + 1.65)), psi = s > 0 ? 0 : PI;
      const slot = { kind: 'gol', s, pos, psi, name: `Goleiro ${S.short} ${s > 0 ? 'A' : 'B'}${i + 1}`, req: false };
      slot.cage = newCage(Math.floor(rand(0, P.gaiolaCap * .6)), slot.name); place(slot.cage, world, pos, psi);
      S.gSlots[s].push(slot);
    }
    const x0 = L.golX - n * .65 - .4, x1 = L.golX + n * .65 + .4, z1 = s * (hw + 2.4);
    put('green', plane(x1 - x0, .07), (x0 + x1) / 2, .006, z1);
    put('green', plane(.07, hw + 2.4 - hw), x0, .006, s * (hw + 1.2)); put('green', plane(.07, 2.4), x1, .006, s * (hw + 1.2));
  }
  for (const s of (P.goleiros === 2 ? sides : [1])) {
    const w = makeWorker('goleiro'); w.home = V3(L.golX, 0, s * (hw + .45)); w.root.position.copy(w.home);
    w.restYaw = s > 0 ? PI : 0; w.setYaw(w.restYaw); w.side = s; w.where = `Goleiro · ${S.short}`; world.add(w.root);
    S.goleiros.push(w); S.workers.push(w);
  }
  floorText(world, [{ t: 'GOLEIRO', size: 96 }, { t: `${P.gaiolasGoleiro} gaiolas · flow rack ${fmtM(L.golL, 1)} m`, size: 40, weight: 600, font: MONO }], L.golX + (L.cmp ? 2.9 : 3.9), 0, 3.8, L.cmp ? 1.0 : 1.45, PI / 2, { w: 512, h: 196, color: '#1f6b41' });

  /* gaiola de avarias no fim da linha: o goleiro separa os volumes avariados (a tratativa busca) */
  {
    const pos = V3(L.golX + L.golL / 2 + .85, 0, 0);
    S.avSlot = { pos, psi: PI / 2, cage: newCage(Math.floor(rand(0, P.gaiolaCap * .35)), `Avarias · ${S.short}`), res: false, lock: 0, name: `Avarias · ${S.short}` };
    place(S.avSlot.cage, world, pos, PI / 2);
    zoneBox(pos.x - .65, -.75, pos.x + .65, .75, 'red', .06);
  }

  /* buffers de gaiolas antes da indução: cheias de um lado (sul), vazias do outro (norte) */
  for (let i = 0; i < 6; i++) {
    const z = 1.6 + i * 1.35;
    const f = { pos: V3(L.cageBufX, 0, -z), psi: PI / 2, cage: null, regen: 0, t: 0 };
    f.cage = newCage(P.gaiolaCap, 'Gaiola cheia'); place(f.cage, world, f.pos, f.psi); S.cageFull.push(f);
    const e = { pos: V3(L.cageBufX, 0, z), psi: PI / 2, cage: null, t: 0 };
    if (i < 3) { e.cage = newCage(0, 'Gaiola vazia'); place(e.cage, world, e.pos, e.psi); e.t = -10 + i; }
    S.cageEmpty.push(e);
  }
  for (const s of sides) {
    const z0 = 1.0, z1 = 1.6 + 5 * 1.35 + .7, x0 = L.cageBufX - .65, x1 = L.cageBufX + .65;
    put('navyP', plane(x1 - x0, .07), (x0 + x1) / 2, .006, s * z0); put('navyP', plane(x1 - x0, .07), (x0 + x1) / 2, .006, s * z1);
    put('navyP', plane(.07, z1 - z0), x0, .006, s * (z0 + z1) / 2); put('navyP', plane(.07, z1 - z0), x1, .006, s * (z0 + z1) / 2);
    floorText(world, [{ t: s < 0 ? 'GAIOLAS CHEIAS' : 'GAIOLAS VAZIAS', size: 74 }, { t: 'buffer da indução', size: 40, weight: 600, font: MONO }], L.cageBufX - 1.55, s * 5.2, 4.2, 1.1, PI / 2, { w: 640, h: 170, color: '#1f3a5f' });
  }

  /* buffer de scuttles cheias, depois do goleiro */
  for (let i = 0; i < 12; i++) {
    const slot = { T: V3(L.eastBufX, 0, (i - 5.5) * 1.35), psi: PI / 2, sc: null, t: 0, res: false };
    if (i % 4 === 1) { const isl = pick(S.islands); slot.sc = newScuttle(`I${isl.code}·${pick(['E1', 'E2', 'D1', 'D3'])}`, P.scuttleCap); place(slot.sc, world, slot.T, slot.psi); slot.t = -rand(0, 30); }
    S.fullBuf.push(slot);
    put('white', plane(.04, 1.24), L.eastBufX + .62, .006, slot.T.z); put('white', plane(1.24, .04), L.eastBufX, .006, slot.T.z - .67);
  }
  floorText(world, [{ t: 'SCUTTLES CHEIAS', size: 80 }, { t: 'buffer de saída', size: 40, weight: 600, font: MONO }], L.eastBufX + 1.8, 0, 4.4, 1.15, PI / 2, { w: 640, h: 170, color: '#4b5869' });

  /* buffer de scuttles vazias, atrás dos paleteiros */
  for (const s of sides) {
    const psi = s > 0 ? 0 : PI;
    for (let i = 0; i < 10; i++) {
      const slot = { T: V3(L.midIsl + s * L.consOff + (i - 4.5) * 1.35, 0, s * L.zCons), psi, sc: newScuttle('VAZIA'), regen: 0, res: false };
      place(slot.sc, world, slot.T, psi); S.emptyBuf[s].push(slot);
      put('white', plane(1.2, .04), slot.T.x, .006, s * (L.zCons - .62)); put('white', plane(.04, 1.24), slot.T.x - .62, .006, s * L.zCons);
    }
    if (L.cmp) floorText(world, [{ t: 'SCUTTLES VAZIAS', size: 80 }, { t: 'buffer dos paleteiros', size: 40, weight: 600, font: MONO }], L.midIsl + s * (L.consOff + 6.75 + 2.6), s * L.zCons, 4.6, 1.1, s > 0 ? 0 : PI, { w: 640, h: 170, color: '#4b5869' });
    else floorText(world, [{ t: 'SCUTTLES VAZIAS', size: 80 }, { t: 'buffer dos paleteiros', size: 40, weight: 600, font: MONO }], L.midIsl, s * (L.zCons + 1.45), 4.6, 1.2, s > 0 ? 0 : PI, { w: 640, h: 170, color: '#4b5869' });
  }

  /* corredores, setas de fluxo, faixas */
  for (const s of sides) {
    const xa = L.xWest + 1, xb = L.xEast - 1;
    put('yellow', plane(xb - xa, .1), (xa + xb) / 2, .006, s * (L.zEdge + .3));
    if (!L.cmp) put('yellow', plane(xb - xa, .1), (xa + xb) / 2, .006, s * (L.zAisle + 1.6));
    for (let x = L.X0 + 1; x < L.golX; x += 10) arrow(x, s * L.zAisle, 0, 2.6);
  }

  /* equipe móvel */
  for (const s of sides) {
    for (let i = 0; i < P.paleteirosPorLado; i++) {
      const u = makeUnit('paleteiro', s, V3(L.midIsl - 4 + i * Math.min(4, 8 / Math.max(1, P.paleteirosPorLado - 1)), 0, s * (L.zAisle + .9)), PI / 2);
      S.jacks[s].push(u);
    }
    for (let i = 0; i < P.setupPorLado; i++) {
      const w = makeWorker('setup'); w.home = V3(L.X0 + .4 + i * 1.3, 0, s * (L.zEdge + .9));
      w.root.position.copy(w.home); w.restYaw = s > 0 ? PI : 0; w.setYaw(w.restYaw); w.side = s; w.where = `${S.short} · lado ${s > 0 ? 'A' : 'B'}`;
      world.add(w.root); S.setups[s].push(w); S.workers.push(w);
    }
  }

  /* cotas principais */
  const zd = -(L.zEdge + .9), isl0 = S.islands[L.nIsl];
  dimLine(L.X0, zd - .9, L.X1, zd - .9, `${fmtM(L.len)} m · esteira`, { text: 1.5 });
  dimLine(L.X0, zd, L.XP, zd, `${fmtM(L.ind)} m · indução`);
  dimLine(L.XP, zd, L.X1, zd, `${fmtM(L.len - L.ind)} m · ilhas`, { text: 1.2 });
  dimLine(L.X0 - .6, -hw, L.X0 - .6, hw, `${fmtM(L.bw)} m`, { text: .5 });
  if (isl0) {
    const zb = -L.zIsl;
    dimLine(isl0.xc - L.half, zb + .5, isl0.xc + L.half, zb + .5, `${fmtM(2 * L.half)} m · ilha`, { text: .8 });
    dimLine(isl0.xc + L.half, zb - 1.6, isl0.xc + L.half + L.gap, zb - 1.6, `${fmtM(L.gap)} m`, { text: .5 });
    dimLine(isl0.xc - L.rackW / 2, zb - L.rack1 - .6, isl0.xc + L.rackW / 2, zb - L.rack1 - .6, `flow rack ${fmtM(L.rackW, 1)} × ${fmtM(L.rackL, 1)} m`, { text: .9 });
    dimLine(isl0.xc + L.rackW / 2, zb - L.rack0 - .3, isl0.xc + L.rackW / 2 + P.corredorFlow, zb - L.rack0 - .3, `${fmtM(P.corredorFlow)} m`, { text: .45 });
    dimVertical(isl0.xc - L.half - .3, zb - L.rack0 - .5, 0, PAL_H + P.scuttleAlt, `${fmtM(P.scuttleAlt)} m + PBR`);
  }
  dimVertical(L.golX + 2, -(hw + 2.6), 0, P.gaiolaAlt, `${fmtM(P.gaiolaAlt)} m`);
  dimLine(L.X1 + .05, -hw - .5, L.X1 + .05 + L.golL, -hw - .5, `${fmtM(L.golL, 1)} m`, { text: .45 });

}

/* paleteira + operador formam uma unidade (operador no timão, garfos para trás) */
function makeUnit(role, s, pos, yaw) {
  const grp = new THREE.Group(); grp.position.copy(pos); grp.rotation.y = yaw; world.add(grp);
  grp.add(instance(ASSET.jack));
  const op = makeWorker(role); op.root.position.set(0, 0, .82); op.setYaw(0); op.restYaw = 0; grp.add(op.root);
  op.where = S.short ? `${S.short} · lado ${s > 0 ? 'A' : 'B'}` : 'Planta';
  const u = { grp, op, side: s, home: pos.clone(), homeYaw: yaw, task: null, load: null };
  op.unit = u; S.workers.push(op);
  return u;
}
